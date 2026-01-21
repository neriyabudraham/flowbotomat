const db = require('../../config/database');
const sumitService = require('./sumit.service');

/**
 * Process subscriptions that need to be charged
 * This should run daily (via cron)
 */
async function processSubscriptionCharges() {
  console.log('[Billing] Starting subscription charge processing...');
  
  try {
    // Get subscriptions due for charge (yearly only - monthly is handled by Sumit)
    const dueSubscriptions = await db.query(`
      SELECT 
        us.*,
        sp.price, sp.name_he,
        pm.card_token, pm.card_expiry_month, pm.card_expiry_year, pm.citizen_id,
        u.name as user_name, u.email as user_email
      FROM user_subscriptions us
      JOIN subscription_plans sp ON us.plan_id = sp.id
      JOIN user_payment_methods pm ON us.payment_method_id = pm.id
      JOIN users u ON us.user_id = u.id
      WHERE us.status = 'active'
        AND us.billing_period = 'yearly'
        AND us.next_charge_date <= NOW()
        AND pm.is_active = true
    `);
    
    console.log(`[Billing] Found ${dueSubscriptions.rows.length} yearly subscriptions due for charge`);
    
    for (const sub of dueSubscriptions.rows) {
      try {
        // Calculate yearly price with 20% discount
        const yearlyPrice = parseFloat(sub.price) * 12 * 0.8;
        
        console.log(`[Billing] Charging user ${sub.user_email} - ${yearlyPrice} ILS`);
        
        const chargeResult = await sumitService.chargeOneTime({
          customerId: sub.sumit_customer_id,
          cardToken: sub.card_token,
          expiryMonth: sub.card_expiry_month,
          expiryYear: sub.card_expiry_year,
          citizenId: sub.citizen_id,
          amount: yearlyPrice,
          description: `חידוש מנוי שנתי - ${sub.name_he}`,
        });
        
        if (chargeResult.success) {
          // Update next charge date
          const nextCharge = new Date();
          nextCharge.setFullYear(nextCharge.getFullYear() + 1);
          
          await db.query(`
            UPDATE user_subscriptions 
            SET next_charge_date = $1, updated_at = NOW()
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
          
          // TODO: Send email notification about failed payment
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
 */
async function processTrialEndings() {
  console.log('[Billing] Processing ended trials...');
  
  try {
    // Get trials that ended
    const endedTrials = await db.query(`
      SELECT 
        us.*,
        sp.price, sp.name_he, sp.trial_days,
        pm.card_token, pm.card_expiry_month, pm.card_expiry_year, pm.citizen_id,
        u.name as user_name, u.email as user_email
      FROM user_subscriptions us
      JOIN subscription_plans sp ON us.plan_id = sp.id
      JOIN user_payment_methods pm ON us.payment_method_id = pm.id
      JOIN users u ON us.user_id = u.id
      WHERE us.status = 'trial'
        AND us.trial_ends_at <= NOW()
        AND pm.is_active = true
    `);
    
    console.log(`[Billing] Found ${endedTrials.rows.length} ended trials`);
    
    for (const sub of endedTrials.rows) {
      try {
        let chargeAmount = parseFloat(sub.price);
        let chargeResult;
        
        if (sub.billing_period === 'yearly') {
          chargeAmount = parseFloat(sub.price) * 12 * 0.8;
          chargeResult = await sumitService.chargeOneTime({
            customerId: sub.sumit_customer_id,
            cardToken: sub.card_token,
            expiryMonth: sub.card_expiry_month,
            expiryYear: sub.card_expiry_year,
            citizenId: sub.citizen_id,
            amount: chargeAmount,
            description: `מנוי שנתי - ${sub.name_he}`,
          });
        } else {
          chargeResult = await sumitService.chargeRecurring({
            customerId: sub.sumit_customer_id,
            cardToken: sub.card_token,
            expiryMonth: sub.card_expiry_month,
            expiryYear: sub.card_expiry_year,
            citizenId: sub.citizen_id,
            amount: chargeAmount,
            description: `מנוי חודשי - ${sub.name_he}`,
            durationMonths: 1,
          });
        }
        
        if (chargeResult.success) {
          // Update subscription to active
          const nextCharge = new Date();
          if (sub.billing_period === 'yearly') {
            nextCharge.setFullYear(nextCharge.getFullYear() + 1);
          } else {
            nextCharge.setMonth(nextCharge.getMonth() + 1);
          }
          
          await db.query(`
            UPDATE user_subscriptions 
            SET status = 'active', 
                is_trial = false, 
                next_charge_date = $1,
                sumit_standing_order_id = $2,
                updated_at = NOW()
            WHERE id = $3
          `, [nextCharge, chargeResult.standingOrderId || null, sub.id]);
          
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
        } else {
          // Mark as expired
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
          
          // TODO: Send email notification
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
 * Send payment reminders
 * Send 3 days and 1 day before charge
 */
async function sendPaymentReminders() {
  console.log('[Billing] Sending payment reminders...');
  
  try {
    // Get subscriptions that will be charged in 3 days or 1 day
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
          OR (us.is_trial = true AND DATE(us.trial_ends_at) = CURRENT_DATE + INTERVAL '1 day')
        )
    `);
    
    console.log(`[Billing] Found ${upcomingCharges.rows.length} upcoming charges to notify`);
    
    for (const sub of upcomingCharges.rows) {
      const daysUntilCharge = Math.ceil(
        (new Date(sub.next_charge_date || sub.trial_ends_at) - new Date()) / (1000 * 60 * 60 * 24)
      );
      
      let amount = parseFloat(sub.price);
      if (sub.billing_period === 'yearly') {
        amount = amount * 12 * 0.8;
      }
      
      console.log(`[Billing] Would notify ${sub.user_email}: ${daysUntilCharge} days until charge of ${amount} ILS`);
      
      // TODO: Send email notification
      // await sendEmail({
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
    
    console.log('[Billing] Payment reminders sent');
  } catch (error) {
    console.error('[Billing] Error in sendPaymentReminders:', error);
  }
}

/**
 * Run all billing tasks
 */
async function runBillingTasks() {
  console.log('[Billing] ====== Starting daily billing tasks ======');
  
  await sendPaymentReminders();
  await processTrialEndings();
  await processSubscriptionCharges();
  
  console.log('[Billing] ====== Daily billing tasks completed ======');
}

module.exports = {
  processSubscriptionCharges,
  processTrialEndings,
  sendPaymentReminders,
  runBillingTasks,
};
