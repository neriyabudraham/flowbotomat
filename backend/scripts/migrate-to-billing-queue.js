/**
 * Migration Script: Sumit Standing Orders → Self-Managed Billing Queue
 * 
 * This script migrates from Sumit's automatic standing orders to the self-managed
 * billing queue system.
 * 
 * Steps:
 * 1. Cancel all active standing orders in Sumit
 * 2. Create billing queue entries for next charge dates
 * 3. Clear standing order IDs from subscriptions
 * 
 * Usage:
 *   node scripts/migrate-to-billing-queue.js [--dry-run]
 * 
 * Options:
 *   --dry-run    Don't make actual changes, just show what would happen
 */

require('dotenv').config();
const { pool } = require('../src/config/database');
const sumitService = require('../src/services/payment/sumit.service');

const DRY_RUN = process.argv.includes('--dry-run');

async function migrate() {
  console.log('='.repeat(60));
  console.log('Migration: Sumit Standing Orders → Billing Queue');
  console.log('='.repeat(60));
  
  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN MODE - No changes will be made\n');
  }
  
  const client = await pool.connect();
  
  try {
    // Step 1: Get all subscriptions with standing orders
    console.log('\n📋 Step 1: Finding subscriptions with standing orders...\n');
    
    const subsResult = await client.query(`
      SELECT us.*, 
             u.email, u.name as display_name,
             sp.name_he as plan_name, sp.price as plan_price,
             upm.sumit_customer_id as payment_customer_id
      FROM user_subscriptions us
      JOIN users u ON u.id = us.user_id
      LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
      LEFT JOIN user_payment_methods upm ON upm.user_id = us.user_id AND upm.is_active = true
      WHERE us.sumit_standing_order_id IS NOT NULL
      ORDER BY us.next_charge_date ASC
    `);
    
    console.log(`Found ${subsResult.rows.length} subscriptions with standing orders\n`);
    
    if (subsResult.rows.length === 0) {
      console.log('✅ No standing orders to migrate!\n');
      return;
    }
    
    // Step 2: Cancel standing orders and create billing queue entries
    console.log('📋 Step 2: Processing subscriptions...\n');
    
    let cancelled = 0;
    let failed = 0;
    let queued = 0;
    
    for (const sub of subsResult.rows) {
      console.log(`\n  Processing: ${sub.email} (${sub.display_name || 'No name'})`);
      console.log(`    Plan: ${sub.plan_name || 'Unknown'}`);
      console.log(`    Standing Order ID: ${sub.sumit_standing_order_id}`);
      console.log(`    Next Charge: ${sub.next_charge_date ? new Date(sub.next_charge_date).toLocaleDateString('he-IL') : 'Not set'}`);
      console.log(`    Status: ${sub.status}`);
      
      const customerId = sub.payment_customer_id || sub.sumit_customer_id;
      
      if (!customerId) {
        console.log(`    ⚠️  No customer ID - skipping Sumit cancellation`);
      } else if (!DRY_RUN) {
        // Cancel standing order in Sumit
        try {
          const cancelResult = await sumitService.cancelRecurring(
            sub.sumit_standing_order_id,
            customerId
          );
          
          if (cancelResult.success) {
            console.log(`    ✅ Cancelled standing order in Sumit`);
            cancelled++;
          } else {
            console.log(`    ⚠️  Failed to cancel in Sumit: ${cancelResult.error}`);
            failed++;
          }
        } catch (err) {
          console.log(`    ❌ Error cancelling: ${err.message}`);
          failed++;
        }
      } else {
        console.log(`    [DRY RUN] Would cancel standing order in Sumit`);
        cancelled++;
      }
      
      // Create billing queue entry if subscription is active and has next charge date
      if (sub.status === 'active' && sub.next_charge_date) {
        const chargeDate = new Date(sub.next_charge_date);
        const now = new Date();
        
        // Only create if charge date is in the future
        if (chargeDate > now) {
          // Calculate charge amount
          let chargeAmount = parseFloat(sub.plan_price || 0);
          
          // Apply custom discount if exists
          if (sub.custom_discount_mode === 'fixed_price' && sub.custom_fixed_price) {
            chargeAmount = parseFloat(sub.custom_fixed_price);
          } else if (sub.custom_discount_mode === 'percent' && sub.referral_discount_percent) {
            chargeAmount = chargeAmount * (1 - sub.referral_discount_percent / 100);
          }
          
          // Apply referral discount if active
          if (sub.referral_discount_percent && sub.referral_months_remaining > 0) {
            chargeAmount = chargeAmount * (1 - sub.referral_discount_percent / 100);
          }
          
          // Apply promo price if active
          if (sub.promo_price && sub.promo_months_remaining > 0) {
            chargeAmount = parseFloat(sub.promo_price);
          }
          
          if (chargeAmount > 0) {
            console.log(`    💰 Amount to charge: ₪${chargeAmount}`);
            
            if (!DRY_RUN) {
              // Check if already exists in billing queue
              const existingCheck = await client.query(
                `SELECT id FROM billing_queue 
                 WHERE user_id = $1 AND status = 'pending' AND charge_date = $2`,
                [sub.user_id, chargeDate.toISOString().split('T')[0]]
              );
              
              if (existingCheck.rows.length === 0) {
                await client.query(`
                  INSERT INTO billing_queue 
                  (user_id, subscription_id, amount, charge_date, billing_type, plan_id, description)
                  VALUES ($1, $2, $3, $4, $5, $6, $7)
                `, [
                  sub.user_id,
                  sub.id,
                  chargeAmount,
                  chargeDate.toISOString().split('T')[0],
                  sub.billing_period === 'yearly' ? 'yearly' : 'monthly',
                  sub.plan_id,
                  `מנוי ${sub.billing_period === 'yearly' ? 'שנתי' : 'חודשי'} - ${sub.plan_name || 'Unknown'}`
                ]);
                console.log(`    ✅ Created billing queue entry`);
                queued++;
              } else {
                console.log(`    ℹ️  Billing queue entry already exists`);
              }
            } else {
              console.log(`    [DRY RUN] Would create billing queue entry`);
              queued++;
            }
          }
        } else {
          console.log(`    ⏰ Charge date is in the past - will be handled by cron`);
        }
      } else if (sub.status === 'trial' && sub.trial_ends_at) {
        const trialEnd = new Date(sub.trial_ends_at);
        const now = new Date();
        
        if (trialEnd > now) {
          let chargeAmount = parseFloat(sub.plan_price || 0);
          
          if (sub.custom_discount_mode === 'fixed_price' && sub.custom_fixed_price) {
            chargeAmount = parseFloat(sub.custom_fixed_price);
          } else if (sub.custom_discount_mode === 'percent' && sub.referral_discount_percent) {
            chargeAmount = chargeAmount * (1 - sub.referral_discount_percent / 100);
          }
          
          if (chargeAmount > 0) {
            console.log(`    💰 Trial conversion amount: ₪${chargeAmount}`);
            
            if (!DRY_RUN) {
              const existingCheck = await client.query(
                `SELECT id FROM billing_queue 
                 WHERE user_id = $1 AND status = 'pending' AND billing_type = 'trial_conversion'`,
                [sub.user_id]
              );
              
              if (existingCheck.rows.length === 0) {
                await client.query(`
                  INSERT INTO billing_queue 
                  (user_id, subscription_id, amount, charge_date, billing_type, plan_id, description)
                  VALUES ($1, $2, $3, $4, 'trial_conversion', $5, $6)
                `, [
                  sub.user_id,
                  sub.id,
                  chargeAmount,
                  trialEnd.toISOString().split('T')[0],
                  sub.plan_id,
                  `המרת ניסיון - ${sub.plan_name || 'Unknown'}`
                ]);
                console.log(`    ✅ Created trial conversion queue entry`);
                queued++;
              } else {
                console.log(`    ℹ️  Trial conversion entry already exists`);
              }
            } else {
              console.log(`    [DRY RUN] Would create trial conversion entry`);
              queued++;
            }
          }
        }
      }
    }
    
    // Step 3: Clear standing order IDs from subscriptions
    console.log('\n📋 Step 3: Clearing standing order IDs from database...\n');
    
    if (!DRY_RUN) {
      const clearResult = await client.query(`
        UPDATE user_subscriptions 
        SET sumit_standing_order_id = NULL,
            updated_at = NOW()
        WHERE sumit_standing_order_id IS NOT NULL
        RETURNING user_id
      `);
      
      console.log(`  ✅ Cleared standing order IDs from ${clearResult.rows.length} subscriptions`);
    } else {
      console.log(`  [DRY RUN] Would clear standing order IDs from ${subsResult.rows.length} subscriptions`);
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`\n  Total subscriptions processed: ${subsResult.rows.length}`);
    console.log(`  Standing orders cancelled: ${cancelled}`);
    console.log(`  Cancellation failures: ${failed}`);
    console.log(`  Billing queue entries created: ${queued}`);
    
    if (DRY_RUN) {
      console.log('\n⚠️  This was a DRY RUN - no changes were made');
      console.log('   Run without --dry-run to execute migration');
    } else {
      console.log('\n✅ Migration completed!');
    }
    
    console.log('\n');
    
  } finally {
    client.release();
  }
}

// Run migration
migrate()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
