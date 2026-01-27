const db = require('../../config/database');
const sumitService = require('./sumit.service');
const { sendNewSubscriptionEmail, sendRenewalEmail } = require('../subscription/notification.service');

/**
 * Process subscriptions that need to be charged
 * This should run daily (via cron)
 * 
 * Handles:
 * - Yearly subscriptions due for renewal
 * - Monthly subscriptions are handled automatically by Sumit standing orders
 */
async function processSubscriptionCharges() {
  console.log('[Billing] ====== Starting subscription charge processing ======');
  
  try {
    // Get yearly subscriptions due for charge
    // Monthly subscriptions are handled by Sumit automatically via standing orders
    const dueSubscriptions = await db.query(`
      SELECT 
        us.*,
        sp.price, sp.name_he,
        pm.sumit_customer_id,
        u.name as user_name, u.email as user_email
      FROM user_subscriptions us
      JOIN subscription_plans sp ON us.plan_id = sp.id
      JOIN user_payment_methods pm ON us.payment_method_id = pm.id
      JOIN users u ON us.user_id = u.id
      WHERE us.status = 'active'
        AND us.billing_period = 'yearly'
        AND us.next_charge_date <= NOW()
        AND pm.is_active = true
        AND pm.sumit_customer_id IS NOT NULL
    `);
    
    console.log(`[Billing] Found ${dueSubscriptions.rows.length} yearly subscriptions due for charge`);
    
    for (const sub of dueSubscriptions.rows) {
      try {
        // Calculate yearly price with 20% discount
        const yearlyPrice = parseFloat(sub.price) * 12 * 0.8;
        
        console.log(`[Billing] Charging user ${sub.user_email} - ${yearlyPrice} ILS for ${sub.name_he}`);
        
        const chargeResult = await sumitService.chargeOneTime({
          customerId: sub.sumit_customer_id,
          amount: yearlyPrice,
          description: `חידוש מנוי שנתי - ${sub.name_he}`,
        });
        
        if (chargeResult.success) {
          // Update next charge date and expires_at
          const nextCharge = new Date();
          nextCharge.setFullYear(nextCharge.getFullYear() + 1);
          
          await db.query(`
            UPDATE user_subscriptions 
            SET next_charge_date = $1, expires_at = $1, updated_at = NOW()
            WHERE id = $2
          `, [nextCharge, sub.id]);
          
          // Log successful payment
          await db.query(`
            INSERT INTO payment_history (
              user_id, subscription_id, payment_method_id, 
              amount, status, sumit_transaction_id, sumit_document_number, description
            ) VALUES ($1, $2, $3, $4, 'success', $5, $6, $7)
          `, [
            sub.user_id, sub.id, sub.payment_method_id,
            yearlyPrice, chargeResult.transactionId, chargeResult.documentNumber,
            `חידוש מנוי שנתי - ${sub.name_he}`
          ]);
          
          console.log(`[Billing] Successfully charged user ${sub.user_email}`);
          
          // Send renewal email notification
          sendRenewalEmail(sub.user_id, sub.name_he, yearlyPrice, nextCharge, {
            documentNumber: chargeResult.documentNumber
          }).catch(err => console.error('[Billing] Failed to send renewal email:', err));
          
        } else {
          // Log failed payment
          await db.query(`
            INSERT INTO payment_history (
              user_id, subscription_id, payment_method_id, 
              amount, status, error_message, description
            ) VALUES ($1, $2, $3, $4, 'failed', $5, $6)
          `, [
            sub.user_id, sub.id, sub.payment_method_id,
            yearlyPrice, chargeResult.error,
            `חידוש מנוי שנתי נכשל - ${sub.name_he}`
          ]);
          
          console.error(`[Billing] Failed to charge user ${sub.user_email}:`, chargeResult.error);
          
          // TODO: Send failure email notification
          // TODO: Retry logic (try again in 1 day, then 3 days)
        }
      } catch (err) {
        console.error(`[Billing] Error processing subscription ${sub.id}:`, err);
      }
    }
    
    console.log('[Billing] Subscription charge processing completed');
  } catch (error) {
    console.error('[Billing] Error in processSubscriptionCharges:', error);
  }
}

/**
 * Process trial subscriptions that have ended
 * Converts trials to paid subscriptions by charging the first payment
 */
async function processTrialEndings() {
  console.log('[Billing] ====== Processing ended trials ======');
  
  try {
    // Get trials that ended with a valid payment method
    const endedTrials = await db.query(`
      SELECT 
        us.*,
        sp.price, sp.name_he, sp.trial_days,
        pm.sumit_customer_id,
        u.name as user_name, u.email as user_email
      FROM user_subscriptions us
      JOIN subscription_plans sp ON us.plan_id = sp.id
      JOIN user_payment_methods pm ON us.payment_method_id = pm.id
      JOIN users u ON us.user_id = u.id
      WHERE us.status = 'trial'
        AND us.trial_ends_at <= NOW()
        AND pm.is_active = true
        AND pm.sumit_customer_id IS NOT NULL
    `);
    
    console.log(`[Billing] Found ${endedTrials.rows.length} ended trials to convert`);
    
    for (const sub of endedTrials.rows) {
      try {
        let chargeAmount = parseFloat(sub.price);
        let chargeResult;
        let nextChargeDate = new Date();
        let expiresAt;
        
        console.log(`[Billing] Converting trial for user ${sub.user_email} - Plan: ${sub.name_he}, Period: ${sub.billing_period}`);
        
        if (sub.billing_period === 'yearly') {
          // Yearly: charge full year with discount, one-time payment
          chargeAmount = parseFloat(sub.price) * 12 * 0.8;
          nextChargeDate.setFullYear(nextChargeDate.getFullYear() + 1);
          expiresAt = new Date(nextChargeDate);
          
          chargeResult = await sumitService.chargeOneTime({
            customerId: sub.sumit_customer_id,
            amount: chargeAmount,
            description: `מנוי שנתי - ${sub.name_he}`,
          });
        } else {
          // Monthly: set up recurring charge
          nextChargeDate.setMonth(nextChargeDate.getMonth() + 1);
          expiresAt = new Date(nextChargeDate);
          
          chargeResult = await sumitService.chargeRecurring({
            customerId: sub.sumit_customer_id,
            amount: chargeAmount,
            description: `מנוי חודשי - ${sub.name_he}`,
            durationMonths: 1,
          });
        }
        
        if (chargeResult.success) {
          // Update subscription to active
          await db.query(`
            UPDATE user_subscriptions 
            SET status = 'active', 
                is_trial = false, 
                next_charge_date = $1,
                expires_at = $2,
                sumit_standing_order_id = $3,
                updated_at = NOW()
            WHERE id = $4
          `, [nextChargeDate, expiresAt, chargeResult.standingOrderId || null, sub.id]);
          
          // Log payment
          await db.query(`
            INSERT INTO payment_history (
              user_id, subscription_id, payment_method_id, 
              amount, status, sumit_transaction_id, sumit_document_number, description
            ) VALUES ($1, $2, $3, $4, 'success', $5, $6, $7)
          `, [
            sub.user_id, sub.id, sub.payment_method_id,
            chargeAmount, chargeResult.transactionId, chargeResult.documentNumber,
            `מנוי ${sub.name_he} - לאחר תקופת ניסיון`
          ]);
          
          console.log(`[Billing] Trial converted to paid for user ${sub.user_email}`);
          
          // Send new subscription email (trial converted to paid)
          sendNewSubscriptionEmail(sub.user_id, sub.name_he, chargeAmount, {
            documentNumber: chargeResult.documentNumber
          }).catch(err => console.error('[Billing] Failed to send subscription email:', err));
          
        } else {
          // Mark as expired (no valid payment)
          await db.query(`
            UPDATE user_subscriptions 
            SET status = 'expired', updated_at = NOW()
            WHERE id = $1
          `, [sub.id]);
          
          // Log failed payment
          await db.query(`
            INSERT INTO payment_history (
              user_id, subscription_id, payment_method_id, 
              amount, status, error_message, description
            ) VALUES ($1, $2, $3, $4, 'failed', $5, $6)
          `, [
            sub.user_id, sub.id, sub.payment_method_id,
            chargeAmount, chargeResult.error,
            `חיוב לאחר ניסיון נכשל - ${sub.name_he}`
          ]);
          
          console.error(`[Billing] Failed to convert trial for user ${sub.user_email}:`, chargeResult.error);
          
          // TODO: Send "trial ended, payment failed" email
        }
      } catch (err) {
        console.error(`[Billing] Error processing trial ${sub.id}:`, err);
      }
    }
    
    console.log('[Billing] Trial processing completed');
  } catch (error) {
    console.error('[Billing] Error in processTrialEndings:', error);
  }
}

/**
 * Process trials that ended without payment method (or cancelled)
 * These need to have WhatsApp disconnected
 */
async function processExpiredTrialsWithoutPayment() {
  console.log('[Billing] ====== Processing expired trials without payment ======');
  
  try {
    // Get trials that ended without a valid payment method
    const expiredTrials = await db.query(`
      SELECT 
        us.*,
        u.email as user_email
      FROM user_subscriptions us
      JOIN users u ON us.user_id = u.id
      WHERE us.status = 'trial'
        AND us.trial_ends_at <= NOW()
        AND (
          us.payment_method_id IS NULL 
          OR NOT EXISTS (
            SELECT 1 FROM user_payment_methods pm 
            WHERE pm.id = us.payment_method_id 
            AND pm.is_active = true 
            AND pm.sumit_customer_id IS NOT NULL
          )
        )
    `);
    
    console.log(`[Billing] Found ${expiredTrials.rows.length} expired trials without valid payment`);
    
    for (const sub of expiredTrials.rows) {
      try {
        // Mark subscription as expired
        await db.query(`
          UPDATE user_subscriptions 
          SET status = 'expired', updated_at = NOW()
          WHERE id = $1
        `, [sub.id]);
        
        // Note: The expiry.service.js will handle WhatsApp disconnection
        
        console.log(`[Billing] Marked trial as expired for user ${sub.user_email}`);
      } catch (err) {
        console.error(`[Billing] Error expiring trial ${sub.id}:`, err);
      }
    }
    
    console.log('[Billing] Expired trials processing completed');
  } catch (error) {
    console.error('[Billing] Error in processExpiredTrialsWithoutPayment:', error);
  }
}

/**
 * Send payment reminders
 * 3 days and 1 day before charge
 */
async function sendPaymentReminders() {
  console.log('[Billing] ====== Sending payment reminders ======');
  
  try {
    // Get subscriptions that will be charged soon
    const upcomingCharges = await db.query(`
      SELECT 
        us.*,
        sp.price, sp.name_he,
        u.name as user_name, u.email as user_email
      FROM user_subscriptions us
      JOIN subscription_plans sp ON us.plan_id = sp.id
      JOIN users u ON us.user_id = u.id
      WHERE us.status IN ('active', 'trial')
        AND (
          DATE(us.next_charge_date) = CURRENT_DATE + INTERVAL '3 days'
          OR DATE(us.next_charge_date) = CURRENT_DATE + INTERVAL '1 day'
          OR (us.is_trial = true AND DATE(us.trial_ends_at) = CURRENT_DATE + INTERVAL '3 days')
          OR (us.is_trial = true AND DATE(us.trial_ends_at) = CURRENT_DATE + INTERVAL '1 day')
        )
    `);
    
    console.log(`[Billing] Found ${upcomingCharges.rows.length} upcoming charges to notify`);
    
    for (const sub of upcomingCharges.rows) {
      const chargeDate = sub.is_trial ? sub.trial_ends_at : sub.next_charge_date;
      const daysUntilCharge = Math.ceil(
        (new Date(chargeDate) - new Date()) / (1000 * 60 * 60 * 24)
      );
      
      let amount = parseFloat(sub.price);
      if (sub.billing_period === 'yearly') {
        amount = amount * 12 * 0.8;
      }
      
      console.log(`[Billing] Reminder: ${sub.user_email} - ${daysUntilCharge} days until charge of ${amount} ILS`);
      
      // TODO: Send email notification
      // await emailService.send({
      //   to: sub.user_email,
      //   subject: sub.is_trial ? 'תקופת הניסיון שלך עומדת להסתיים' : 'תזכורת לחיוב קרוב',
      //   template: 'payment_reminder',
      //   data: {
      //     name: sub.user_name,
      //     planName: sub.name_he,
      //     amount: amount,
      //     daysUntilCharge: daysUntilCharge,
      //     isTrial: sub.is_trial,
      //   }
      // });
    }
    
    console.log('[Billing] Payment reminders processing completed');
  } catch (error) {
    console.error('[Billing] Error in sendPaymentReminders:', error);
  }
}

/**
 * Run all billing tasks
 * This should be called by cron job daily
 */
async function runBillingTasks() {
  console.log('\n[Billing] ========================================');
  console.log('[Billing] Starting daily billing tasks');
  console.log('[Billing] ========================================\n');
  
  const startTime = Date.now();
  
  try {
    // 1. Send reminders first (non-destructive)
    await sendPaymentReminders();
    
    // 2. Process ended trials with payment methods (convert to paid)
    await processTrialEndings();
    
    // 3. Process ended trials without payment (mark as expired)
    await processExpiredTrialsWithoutPayment();
    
    // 4. Process yearly subscription renewals
    await processSubscriptionCharges();
    
    // 5. Process ending promotions (transition to regular price)
    try {
      const { processEndingPromotions, decrementPromoMonths } = require('../../controllers/payment/payment.controller');
      await processEndingPromotions();
      await decrementPromoMonths();
    } catch (promoErr) {
      console.error('[Billing] Error processing promotions:', promoErr.message);
    }
    
    // 6. Process ending referral discounts (transition to regular price)
    try {
      const { processEndingReferralDiscounts, decrementReferralMonths } = require('../../controllers/payment/payment.controller');
      await processEndingReferralDiscounts();
      await decrementReferralMonths();
    } catch (refErr) {
      console.error('[Billing] Error processing referral discounts:', refErr.message);
    }
    
  } catch (error) {
    console.error('[Billing] Error running billing tasks:', error);
  }
  
  const duration = Date.now() - startTime;
  console.log(`\n[Billing] ========================================`);
  console.log(`[Billing] Daily billing tasks completed in ${duration}ms`);
  console.log(`[Billing] ========================================\n`);
}

module.exports = {
  processSubscriptionCharges,
  processTrialEndings,
  processExpiredTrialsWithoutPayment,
  sendPaymentReminders,
  runBillingTasks,
};
