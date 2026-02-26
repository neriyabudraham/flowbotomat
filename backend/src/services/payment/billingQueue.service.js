const { pool } = require('../../config/database');
const sumitService = require('./sumit.service');
const { sendMail } = require('../mail/transport.service');

/**
 * Schedule a charge in the billing queue
 */
async function scheduleCharge({
  userId,
  subscriptionId,
  amount,
  chargeDate,
  billingType,
  planId = null,
  description = null,
  currency = 'ILS'
}) {
  const result = await pool.query(
    `INSERT INTO billing_queue 
     (user_id, subscription_id, amount, charge_date, billing_type, plan_id, description, currency)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [userId, subscriptionId, amount, chargeDate, billingType, planId, description, currency]
  );
  
  console.log(`[BillingQueue] Scheduled ${billingType} charge of ${amount} ${currency} for user ${userId} on ${chargeDate}`);
  return result.rows[0];
}

/**
 * Cancel a pending charge
 */
async function cancelCharge(queueId) {
  const result = await pool.query(
    `UPDATE billing_queue 
     SET status = 'cancelled', updated_at = NOW()
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [queueId]
  );
  
  if (result.rows[0]) {
    console.log(`[BillingQueue] Cancelled charge ${queueId}`);
  }
  return result.rows[0];
}

/**
 * Cancel all pending charges for a user
 */
async function cancelUserCharges(userId) {
  const result = await pool.query(
    `UPDATE billing_queue 
     SET status = 'cancelled', updated_at = NOW()
     WHERE user_id = $1 AND status IN ('pending', 'failed')
     RETURNING *`,
    [userId]
  );
  
  console.log(`[BillingQueue] Cancelled ${result.rows.length} charges for user ${userId}`);
  return result.rows;
}

/**
 * Get upcoming charges for the next N days
 */
async function getUpcomingCharges(days = 7, limit = 100) {
  const result = await pool.query(
    `SELECT bq.*, 
            u.email, u.name as display_name,
            sp.name as plan_name, sp.name_he as plan_name_he,
            us.sumit_customer_id,
            EXISTS(SELECT 1 FROM user_payment_methods pm WHERE pm.user_id = bq.user_id AND pm.is_active = true) as has_payment_method,
            (SELECT pm.card_last_digits FROM user_payment_methods pm WHERE pm.user_id = bq.user_id AND pm.is_active = true LIMIT 1) as card_last_digits
     FROM billing_queue bq
     JOIN users u ON u.id = bq.user_id
     LEFT JOIN user_subscriptions us ON us.user_id = bq.user_id
     LEFT JOIN subscription_plans sp ON sp.id = bq.plan_id
     WHERE bq.status = 'pending' 
       AND bq.charge_date <= CURRENT_DATE + INTERVAL '${days} days'
     ORDER BY bq.charge_date ASC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

/**
 * Get failed charges that need attention
 */
async function getFailedCharges(limit = 100) {
  const result = await pool.query(
    `SELECT bq.*, 
            u.email, u.name as display_name,
            sp.name as plan_name, sp.name_he as plan_name_he
     FROM billing_queue bq
     JOIN users u ON u.id = bq.user_id
     LEFT JOIN subscription_plans sp ON sp.id = bq.plan_id
     WHERE bq.status = 'failed'
     ORDER BY bq.last_attempt_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

/**
 * Get payment history with optional filters
 */
async function getPaymentHistory({ userId, status, startDate, endDate, search, userEmail, limit = 100, offset = 0 }) {
  let query = `
    SELECT ph.*, 
           u.email, u.name as display_name,
           sp.name as plan_name, sp.name_he as plan_name_he
    FROM payment_history ph
    JOIN users u ON u.id = ph.user_id
    LEFT JOIN user_subscriptions us ON us.id = ph.subscription_id
    LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
    WHERE 1=1
  `;
  const params = [];
  let paramIdx = 1;
  
  if (userId) {
    query += ` AND ph.user_id = $${paramIdx++}`;
    params.push(userId);
  }
  if (userEmail) {
    query += ` AND u.email = $${paramIdx++}`;
    params.push(userEmail);
  }
  if (search) {
    query += ` AND (u.email ILIKE $${paramIdx} OR u.name ILIKE $${paramIdx})`;
    params.push(`%${search}%`);
    paramIdx++;
  }
  if (status) {
    query += ` AND ph.status = $${paramIdx++}`;
    params.push(status);
  }
  if (startDate) {
    query += ` AND ph.created_at >= $${paramIdx++}`;
    params.push(startDate);
  }
  if (endDate) {
    query += ` AND ph.created_at <= $${paramIdx++}`;
    params.push(endDate);
  }
  
  query += ` ORDER BY ph.created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx}`;
  params.push(limit, offset);
  
  const result = await pool.query(query, params);
  
  // Get total count
  let countQuery = `SELECT COUNT(*) FROM payment_history ph JOIN users u ON u.id = ph.user_id WHERE 1=1`;
  const countParams = [];
  paramIdx = 1;
  if (userId) {
    countQuery += ` AND ph.user_id = $${paramIdx++}`;
    countParams.push(userId);
  }
  if (userEmail) {
    countQuery += ` AND u.email = $${paramIdx++}`;
    countParams.push(userEmail);
  }
  if (search) {
    countQuery += ` AND (u.email ILIKE $${paramIdx} OR u.name ILIKE $${paramIdx})`;
    countParams.push(`%${search}%`);
    paramIdx++;
  }
  if (status) {
    countQuery += ` AND ph.status = $${paramIdx++}`;
    countParams.push(status);
  }
  if (startDate) {
    countQuery += ` AND ph.created_at >= $${paramIdx++}`;
    countParams.push(startDate);
  }
  if (endDate) {
    countQuery += ` AND ph.created_at <= $${paramIdx++}`;
    countParams.push(endDate);
  }
  
  const countResult = await pool.query(countQuery, countParams);
  
  return {
    payments: result.rows,
    total: parseInt(countResult.rows[0].count)
  };
}

/**
 * Process all pending charges for today
 */
async function processQueue() {
  console.log('[BillingQueue] Starting daily queue processing...');
  
  // Get all pending charges due today or earlier
  const pendingResult = await pool.query(
    `SELECT bq.*, 
            u.email, u.name as display_name,
            us.sumit_customer_id,
            us.invoice_name, us.receipt_email,
            upm.id as payment_method_id,
            sp.name as plan_name, sp.name_he as plan_name_he, sp.price as plan_price
     FROM billing_queue bq
     JOIN users u ON u.id = bq.user_id
     LEFT JOIN user_subscriptions us ON us.user_id = bq.user_id
     LEFT JOIN user_payment_methods upm ON upm.user_id = bq.user_id AND upm.is_active = true
     LEFT JOIN subscription_plans sp ON sp.id = bq.plan_id
     WHERE bq.status = 'pending' 
       AND bq.charge_date <= CURRENT_DATE
     ORDER BY bq.charge_date ASC
     FOR UPDATE SKIP LOCKED`
  );
  
  console.log(`[BillingQueue] Found ${pendingResult.rows.length} pending charges to process`);
  
  let processed = 0;
  let successful = 0;
  let failed = 0;
  
  for (const charge of pendingResult.rows) {
    processed++;
    
    try {
      // Skip 0 ILS charges - no need to send payment request for free
      const chargeAmount = parseFloat(charge.amount);
      if (chargeAmount <= 0) {
        console.log(`[BillingQueue] Skipping 0 ILS charge for user ${charge.user_id} (${charge.email})`);
        
        // Mark as completed without actually charging
        await pool.query(
          `UPDATE billing_queue 
           SET status = 'completed', 
               completed_at = NOW(),
               notes = 'סכום 0 - דולג ללא חיוב',
               updated_at = NOW() 
           WHERE id = $1`,
          [charge.id]
        );
        
        // Still handle the subscription update (extend period, etc.)
        await handleChargeSuccess(charge, { 
          success: true, 
          skipped: true,
          message: 'No charge - amount is 0'
        });
        
        successful++;
        continue;
      }
      
      // Mark as processing
      await pool.query(
        `UPDATE billing_queue SET status = 'processing', updated_at = NOW() WHERE id = $1`,
        [charge.id]
      );
      
      // Check if user has payment method
      if (!charge.sumit_customer_id) {
        await handleChargeFailure(charge, 'NO_PAYMENT_METHOD', 'למשתמש אין אמצעי תשלום מוגדר');
        failed++;
        continue;
      }
      
      // Execute charge via Sumit
      const description = charge.description || charge.plan_name_he || `מנוי ${charge.billing_type}`;
      const chargeResult = await sumitService.chargeOneTime({
        customerId: charge.sumit_customer_id,
        amount: chargeAmount,
        description,
        sendEmail: true
      });
      
      if (chargeResult.success) {
        await handleChargeSuccess(charge, chargeResult);
        successful++;
      } else {
        await handleChargeFailure(charge, chargeResult.status || 'CHARGE_FAILED', chargeResult.error, chargeResult.technicalError);
        failed++;
      }
      
    } catch (error) {
      console.error(`[BillingQueue] Error processing charge ${charge.id}:`, error);
      await handleChargeFailure(charge, 'SYSTEM_ERROR', error.message);
      failed++;
    }
  }
  
  console.log(`[BillingQueue] Queue processing complete. Processed: ${processed}, Successful: ${successful}, Failed: ${failed}`);
  
  return { processed, successful, failed };
}

/**
 * Process retry for failed charges
 */
async function retryFailedCharges() {
  console.log('[BillingQueue] Processing failed charge retries...');
  
  // Get failed charges that are due for retry
  const failedResult = await pool.query(
    `SELECT bq.*, 
            u.email, u.name as display_name,
            us.sumit_customer_id,
            us.invoice_name, us.receipt_email,
            sp.name as plan_name, sp.name_he as plan_name_he
     FROM billing_queue bq
     JOIN users u ON u.id = bq.user_id
     LEFT JOIN user_subscriptions us ON us.user_id = bq.user_id
     LEFT JOIN subscription_plans sp ON sp.id = bq.plan_id
     WHERE bq.status = 'failed' 
       AND bq.retry_count < bq.max_retries
       AND bq.next_retry_at <= CURRENT_DATE
     ORDER BY bq.next_retry_at ASC
     FOR UPDATE SKIP LOCKED`
  );
  
  console.log(`[BillingQueue] Found ${failedResult.rows.length} failed charges to retry`);
  
  let retried = 0;
  let successful = 0;
  
  for (const charge of failedResult.rows) {
    retried++;
    
    try {
      // Reset to pending for processing
      await pool.query(
        `UPDATE billing_queue 
         SET status = 'processing', 
             retry_count = retry_count + 1,
             updated_at = NOW() 
         WHERE id = $1`,
        [charge.id]
      );
      
      // Execute charge
      const description = charge.description || charge.plan_name_he || `מנוי ${charge.billing_type}`;
      const chargeResult = await sumitService.chargeOneTime({
        customerId: charge.sumit_customer_id,
        amount: parseFloat(charge.amount),
        description,
        sendEmail: true
      });
      
      if (chargeResult.success) {
        await handleChargeSuccess(charge, chargeResult);
        successful++;
      } else {
        // This was a retry that failed again
        const newRetryCount = charge.retry_count + 1;
        
        if (newRetryCount >= charge.max_retries) {
          // Max retries reached - downgrade user
          await handleMaxRetriesReached(charge, chargeResult.error);
        } else {
          // Schedule another retry
          await handleChargeFailure(charge, chargeResult.status || 'CHARGE_FAILED', chargeResult.error, chargeResult.technicalError);
        }
      }
      
    } catch (error) {
      console.error(`[BillingQueue] Error retrying charge ${charge.id}:`, error);
    }
  }
  
  console.log(`[BillingQueue] Retry processing complete. Retried: ${retried}, Successful: ${successful}`);
  
  return { retried, successful };
}

/**
 * Handle successful charge
 */
async function handleChargeSuccess(charge, chargeResult) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Mark charge as completed
    await client.query(
      `UPDATE billing_queue 
       SET status = 'completed', 
           processed_at = NOW(),
           updated_at = NOW() 
       WHERE id = $1`,
      [charge.id]
    );
    
    // Log to payment history
    await client.query(
      `INSERT INTO payment_history 
       (user_id, subscription_id, payment_method_id, amount, currency, status, 
        sumit_transaction_id, sumit_document_number, description, billing_queue_id, billing_type, plan_name, receipt_url)
       VALUES ($1, $2, $3, $4, $5, 'success', $6, $7, $8, $9, $10, $11, $12)`,
      [
        charge.user_id,
        charge.subscription_id,
        charge.payment_method_id,
        charge.amount,
        charge.currency,
        chargeResult.transactionId,
        chargeResult.documentNumber,
        charge.description || charge.plan_name_he,
        charge.id,
        charge.billing_type,
        charge.plan_name_he || charge.plan_name,
        chargeResult.documentURL || null
      ]
    );
    
    // Get current subscription with discount info
    const subResult = await client.query(
      `SELECT us.*, sp.price as plan_price, sp.name_he as plan_name_he
       FROM user_subscriptions us
       JOIN subscription_plans sp ON sp.id = us.plan_id
       WHERE us.user_id = $1`,
      [charge.user_id]
    );
    
    const sub = subResult.rows[0];
    
    // IMPORTANT: Always ensure subscription is active after successful payment
    // This handles reactivation, trial conversion, etc.
    if (sub && sub.status !== 'active') {
      console.log(`[BillingQueue] Updating subscription status from '${sub.status}' to 'active' for user ${charge.user_id}`);
    }
    
    // Decrement referral_months_remaining if using time-limited referral discount
    // (not for fixed_price mode or forever discounts)
    let shouldDecrementReferral = false;
    if (sub && sub.referral_months_remaining > 0 && sub.custom_discount_mode !== 'fixed_price') {
      shouldDecrementReferral = true;
    }
    
    // Calculate next charge date - use CURRENT_DATE if next_charge_date is NULL
    const billingPeriod = charge.billing_type === 'yearly' ? 'year' : 'month';
    const isYearly = charge.billing_type === 'yearly';
    
    // Handle different billing types for scheduling next charge
    const shouldScheduleNext = ['monthly', 'yearly', 'renewal', 'first_payment', 'trial_conversion', 'reactivation'].includes(charge.billing_type);
    
    if (shouldScheduleNext && charge.billing_type !== 'status_bot') {
      // Update subscription to active and set next charge date
      await client.query(
        `UPDATE user_subscriptions 
         SET status = 'active',
             is_manual = false,
             is_trial = false,
             trial_ends_at = NULL,
             next_charge_date = COALESCE(next_charge_date, CURRENT_DATE) + INTERVAL '1 ${billingPeriod}',
             expires_at = CASE WHEN $2 THEN COALESCE(expires_at, CURRENT_DATE) + INTERVAL '1 year' ELSE expires_at END,
             referral_months_remaining = CASE 
               WHEN $3 AND referral_months_remaining > 0 THEN referral_months_remaining - 1 
               ELSE referral_months_remaining 
             END,
             updated_at = NOW()
         WHERE user_id = $1`,
        [charge.user_id, isYearly, shouldDecrementReferral]
      );
      
      // IMPORTANT: Unlock bots after successful payment
      // Get the plan's bot limit
      const planLimitResult = await client.query(`
        SELECT sp.max_bots FROM subscription_plans sp 
        JOIN user_subscriptions us ON us.plan_id = sp.id 
        WHERE us.user_id = $1
      `, [charge.user_id]);
      const maxBots = planLimitResult.rows[0]?.max_bots || 1;
      
      if (maxBots !== 0) {
        const botLimit = maxBots === -1 ? 1000 : maxBots;
        
        // Unlock locked bots up to the limit (payment success = user can use their bots)
        const lockedBotsResult = await client.query(`
          SELECT id FROM bots 
          WHERE user_id = $1 AND locked_reason IN ('subscription_limit', 'payment_failed')
          ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
          LIMIT $2
        `, [charge.user_id, botLimit]);
        
        if (lockedBotsResult.rows.length > 0) {
          const botsToUnlock = lockedBotsResult.rows.map(b => b.id);
          await client.query(`
            UPDATE bots 
            SET locked_reason = NULL, locked_at = NULL, updated_at = NOW()
            WHERE id = ANY($1::uuid[])
          `, [botsToUnlock]);
          
          console.log(`[BillingQueue] Unlocked ${botsToUnlock.length} bots for user ${charge.user_id} after successful payment`);
        }
      }
      
      // Calculate next charge amount with discounts
      let nextAmount = parseFloat(sub?.plan_price || charge.amount);
      let description = `מנוי ${isYearly ? 'שנתי' : 'חודשי'} - ${sub?.plan_name_he || charge.plan_name_he}`;
      
      if (sub) {
        // Apply custom discount from admin (fixed price)
        if (sub.custom_discount_mode === 'fixed_price' && sub.custom_fixed_price) {
          nextAmount = parseFloat(sub.custom_fixed_price);
          if (isYearly) nextAmount *= 12;
          description += ' (מחיר מותאם)';
        } 
        // Apply admin percent discount
        else if (sub.custom_discount_mode === 'percent' && sub.referral_discount_percent) {
          if (isYearly) {
            nextAmount = nextAmount * 12 * 0.8; // Base yearly discount
          }
          nextAmount = Math.floor(nextAmount * (1 - sub.referral_discount_percent / 100));
          description += ` (${sub.referral_discount_percent}% הנחה)`;
        }
        // Apply referral discount if still active (check AFTER decrement)
        else if (sub.referral_discount_percent && sub.referral_months_remaining > 1) {
          // > 1 because we already decremented above
          if (isYearly) {
            nextAmount = nextAmount * 12 * 0.8;
          }
          nextAmount = Math.floor(nextAmount * (1 - sub.referral_discount_percent / 100));
          description += ` (${sub.referral_discount_percent}% הנחת הפניה)`;
        }
        // Apply yearly discount only
        else if (isYearly) {
          nextAmount = nextAmount * 12 * 0.8; // 20% yearly discount
          description += ' (20% הנחה שנתית)';
        }
      }
      
      // Schedule next charge
      const nextChargeDate = new Date();
      if (isYearly) {
        nextChargeDate.setFullYear(nextChargeDate.getFullYear() + 1);
      } else {
        nextChargeDate.setMonth(nextChargeDate.getMonth() + 1);
      }
      
      await client.query(
        `INSERT INTO billing_queue 
         (user_id, subscription_id, amount, charge_date, billing_type, plan_id, description, currency)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          charge.user_id,
          charge.subscription_id,
          nextAmount,
          nextChargeDate.toISOString().split('T')[0],
          isYearly ? 'yearly' : 'monthly',
          charge.plan_id,
          description,
          charge.currency
        ]
      );
    } else if (charge.billing_type === 'status_bot') {
      // Status Bot charge - update service subscription
      await client.query(
        `UPDATE user_service_subscriptions 
         SET status = 'active',
             next_charge_date = COALESCE(next_charge_date, CURRENT_DATE) + INTERVAL '1 month',
             updated_at = NOW()
         WHERE user_id = $1 AND service_id = (SELECT id FROM additional_services WHERE slug = 'status-bot')`,
        [charge.user_id]
      );
      
      // Schedule next status bot charge
      const nextChargeDate = new Date();
      nextChargeDate.setMonth(nextChargeDate.getMonth() + 1);
      
      await client.query(
        `INSERT INTO billing_queue 
         (user_id, subscription_id, amount, charge_date, billing_type, plan_id, description, currency)
         VALUES ($1, $2, $3, $4, 'status_bot', $5, $6, $7)`,
        [
          charge.user_id,
          charge.subscription_id,
          charge.amount, // Status bot price doesn't change
          nextChargeDate.toISOString().split('T')[0],
          charge.plan_id,
          charge.description || 'בוט העלאת סטטוסים - חודשי',
          charge.currency
        ]
      );
    }
    
    await client.query('COMMIT');
    
    console.log(`[BillingQueue] Charge ${charge.id} completed successfully. Transaction: ${chargeResult.transactionId}`);
    
    // Send success notification to user (async - don't block)
    sendSuccessNotification(charge, chargeResult).catch(err => 
      console.error('[BillingQueue] Error sending success notification:', err)
    );
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Send success notification to user after successful charge
 */
async function sendSuccessNotification(charge, chargeResult) {
  try {
    const userEmail = charge.receipt_email || charge.email;
    const userName = charge.invoice_name || charge.display_name || '';
    
    // Get next charge date for the message
    const nextChargeDate = new Date();
    if (charge.billing_type === 'yearly') {
      nextChargeDate.setFullYear(nextChargeDate.getFullYear() + 1);
    } else {
      nextChargeDate.setMonth(nextChargeDate.getMonth() + 1);
    }
    const formattedNextDate = nextChargeDate.toLocaleDateString('he-IL', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
    
    // Create in-app notification
    await pool.query(`
      INSERT INTO notifications (user_id, notification_type, title, message, metadata)
      VALUES ($1, 'payment_success', 'התשלום בוצע בהצלחה', $2, $3)
    `, [
      charge.user_id,
      `חויבת בסכום של ₪${charge.amount} עבור ${charge.description || charge.plan_name_he}. החיוב הבא: ${formattedNextDate}`,
      JSON.stringify({
        amount: charge.amount,
        billing_type: charge.billing_type,
        transaction_id: chargeResult.transactionId,
        next_charge_date: nextChargeDate.toISOString(),
        receipt_url: chargeResult.documentURL
      })
    ]);
    
    // Send email notification
    if (userEmail) {
      await sendMail(
        userEmail,
        `התשלום בוצע בהצלחה - ₪${charge.amount}`,
        `
          <div dir="rtl" style="font-family: Arial, sans-serif;">
            <h2>שלום ${userName},</h2>
            <p>התשלום שלך בוצע בהצלחה! 🎉</p>
            <table style="border-collapse: collapse; margin: 20px 0;">
              <tr>
                <td style="padding: 8px 16px; border: 1px solid #ddd; background: #f9f9f9;"><strong>סכום:</strong></td>
                <td style="padding: 8px 16px; border: 1px solid #ddd;">₪${charge.amount}</td>
              </tr>
              <tr>
                <td style="padding: 8px 16px; border: 1px solid #ddd; background: #f9f9f9;"><strong>תיאור:</strong></td>
                <td style="padding: 8px 16px; border: 1px solid #ddd;">${charge.description || charge.plan_name_he}</td>
              </tr>
              <tr>
                <td style="padding: 8px 16px; border: 1px solid #ddd; background: #f9f9f9;"><strong>חיוב הבא:</strong></td>
                <td style="padding: 8px 16px; border: 1px solid #ddd;">${formattedNextDate}</td>
              </tr>
            </table>
            ${chargeResult.documentURL ? `
              <p><a href="${chargeResult.documentURL}" style="background: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">צפה בקבלה</a></p>
            ` : ''}
            <p style="color: #666; font-size: 12px; margin-top: 20px;">
              לניהול המנוי שלך: <a href="${process.env.FRONTEND_URL}/settings/billing">לחץ כאן</a>
            </p>
          </div>
        `
      );
    }
    
    console.log(`[BillingQueue] Sent success notification to ${userEmail}`);
  } catch (error) {
    console.error('[BillingQueue] Error sending success notification:', error);
  }
}

/**
 * Handle charge failure
 */
async function handleChargeFailure(charge, errorCode, errorMessage, technicalError = null) {
  const retryCount = (charge.retry_count || 0) + 1;
  const maxRetries = charge.max_retries || 2;
  
  // Calculate next retry date (tomorrow)
  const nextRetryDate = new Date();
  nextRetryDate.setDate(nextRetryDate.getDate() + 1);
  const formattedRetryDate = nextRetryDate.toLocaleDateString('he-IL', {
    weekday: 'long', month: 'long', day: 'numeric'
  });
  
  // Update charge status
  await pool.query(
    `UPDATE billing_queue 
     SET status = 'failed',
         retry_count = $2,
         last_error = $3,
         last_error_code = $4,
         last_attempt_at = NOW(),
         next_retry_at = $5,
         updated_at = NOW()
     WHERE id = $1`,
    [charge.id, retryCount, errorMessage, errorCode, nextRetryDate.toISOString().split('T')[0]]
  );
  
  // Log to payment history
  await pool.query(
    `INSERT INTO payment_history 
     (user_id, subscription_id, amount, currency, status, error_message, 
      description, billing_queue_id, billing_type, failure_reason, failure_code)
     VALUES ($1, $2, $3, $4, 'failed', $5, $6, $7, $8, $9, $10)`,
    [
      charge.user_id,
      charge.subscription_id,
      charge.amount,
      charge.currency,
      errorMessage,
      charge.description || charge.plan_name_he,
      charge.id,
      charge.billing_type,
      technicalError || errorMessage,
      errorCode
    ]
  );
  
  // Create in-app notification for user
  const isLastRetry = retryCount >= maxRetries;
  await pool.query(`
    INSERT INTO notifications (user_id, notification_type, title, message, metadata, priority)
    VALUES ($1, 'payment_failed', $2, $3, $4, $5)
  `, [
    charge.user_id,
    isLastRetry ? '⚠️ בעיה בתשלום - נדרשת פעולה מיידית!' : 'בעיה בחיוב החודשי',
    isLastRetry 
      ? `לא הצלחנו לחייב את אמצעי התשלום שלך (₪${charge.amount}). זהו הניסיון האחרון - אנא עדכן את פרטי התשלום כדי למנוע הפסקת שירות.`
      : `לא הצלחנו לחייב את אמצעי התשלום שלך (₪${charge.amount}). ננסה שוב ב-${formattedRetryDate}.`,
    JSON.stringify({
      amount: charge.amount,
      error_code: errorCode,
      retry_count: retryCount,
      max_retries: maxRetries,
      next_retry_date: nextRetryDate.toISOString(),
      is_last_retry: isLastRetry
    }),
    isLastRetry ? 'high' : 'normal'
  ]);
  
  console.log(`[BillingQueue] Charge ${charge.id} failed: ${errorCode} - ${errorMessage}. Retry ${retryCount}/${maxRetries}`);
  
  // Send email notifications
  await sendFailureNotifications(charge, errorCode, errorMessage, retryCount, maxRetries);
}

/**
 * Handle when max retries are reached - downgrade user
 */
async function handleMaxRetriesReached(charge, lastError) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Mark charge as failed (final)
    await client.query(
      `UPDATE billing_queue 
       SET status = 'failed',
           last_error = $2,
           last_attempt_at = NOW(),
           next_retry_at = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [charge.id, `MAX_RETRIES_REACHED: ${lastError}`]
    );
    
    // Get free plan
    const freePlanResult = await client.query(
      `SELECT id, max_bots FROM subscription_plans WHERE price = 0 AND is_active = true LIMIT 1`
    );
    
    if (freePlanResult.rows[0]) {
      const freePlan = freePlanResult.rows[0];
      
      // Downgrade to free plan
      await client.query(
        `UPDATE user_subscriptions 
         SET plan_id = $1,
             status = 'expired',
             is_manual = false,
             expires_at = NULL,
             next_charge_date = NULL,
             admin_notes = COALESCE(admin_notes, '') || E'\n[' || NOW()::text || '] הורד לתוכנית חינמית עקב כשלון בחיוב',
             updated_at = NOW()
         WHERE user_id = $2`,
        [freePlan.id, charge.user_id]
      );
      
      // IMPORTANT: Keep only the allowed number of bots UNLOCKED (same as expiry.service)
      const freeBotLimit = freePlan.max_bots || 1;
      
      if (freeBotLimit > 0 && freeBotLimit !== -1) {
        // Get the most recently updated bots up to the limit
        const botsToKeep = await client.query(`
          SELECT id, name FROM bots 
          WHERE user_id = $1 AND pending_deletion = false
          ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
          LIMIT $2
        `, [charge.user_id, freeBotLimit]);
        
        const keepBotIds = botsToKeep.rows.map(b => b.id);
        
        if (keepBotIds.length > 0) {
          const keepBotName = botsToKeep.rows[0].name;
          
          // LOCK all bots EXCEPT the ones we're keeping
          await client.query(`
            UPDATE bots 
            SET is_active = false,
                locked_reason = 'payment_failed',
                locked_at = NOW(),
                updated_at = NOW()
            WHERE user_id = $1 AND id != ALL($2::uuid[])
          `, [charge.user_id, keepBotIds]);
          
          // Make sure kept bots are unlocked, first one active
          await client.query(`
            UPDATE bots 
            SET locked_reason = NULL,
                locked_at = NULL,
                is_active = CASE WHEN id = $2 THEN true ELSE false END,
                updated_at = NOW()
            WHERE id = ANY($1::uuid[])
          `, [keepBotIds, keepBotIds[0]]);
          
          console.log(`[BillingQueue] Kept ${keepBotIds.length} bots unlocked for user ${charge.user_id}, locked others`);
        } else {
          // No bots to keep - lock all
          await client.query(`
            UPDATE bots 
            SET is_active = false,
                locked_reason = 'payment_failed',
                locked_at = NOW(),
                updated_at = NOW()
            WHERE user_id = $1
          `, [charge.user_id]);
        }
      } else if (freeBotLimit === 0) {
        // Free plan allows 0 bots - lock all
        await client.query(`
          UPDATE bots 
          SET is_active = false,
              locked_reason = 'payment_failed',
              locked_at = NOW(),
              updated_at = NOW()
          WHERE user_id = $1
        `, [charge.user_id]);
      }
      // If freeBotLimit is -1, don't touch bots (unlimited)
    }
    
    // Cancel any other pending charges for this user
    await client.query(
      `UPDATE billing_queue 
       SET status = 'cancelled', updated_at = NOW()
       WHERE user_id = $1 AND status = 'pending'`,
      [charge.user_id]
    );
    
    // Create in-app notification
    await client.query(`
      INSERT INTO notifications (user_id, notification_type, title, message, metadata)
      VALUES ($1, 'subscription_downgraded', 'המנוי שלך הורד לתוכנית חינמית', $2, $3)
    `, [
      charge.user_id,
      'לא הצלחנו לחייב את אמצעי התשלום שלך. החשבון הורד לתוכנית החינמית.',
      JSON.stringify({ reason: 'payment_failed', last_error: lastError })
    ]);
    
    await client.query('COMMIT');
    
    console.log(`[BillingQueue] User ${charge.user_id} downgraded to free plan after max retries`);
    
    // Send final notification
    await sendDowngradeNotification(charge);
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Send failure notifications to admin and user
 */
async function sendFailureNotifications(charge, errorCode, errorMessage, retryCount, maxRetries) {
  try {
    // Get admin email from system settings
    const settingsResult = await pool.query(
      `SELECT config FROM system_settings WHERE key = 'site_config'`
    );
    const siteConfig = settingsResult.rows[0]?.config || {};
    const adminEmail = siteConfig.admin_email || process.env.ADMIN_EMAIL;
    
    // Send to admin
    if (adminEmail) {
      await sendMail(
        adminEmail,
        `⚠️ כשלון בחיוב - ${charge.display_name || charge.email}`,
        `
          <div dir="rtl" style="font-family: Arial, sans-serif;">
            <h2>כשלון בחיוב אוטומטי</h2>
            <table style="border-collapse: collapse; width: 100%;">
              <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>משתמש:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${charge.display_name || 'לא ידוע'}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>אימייל:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${charge.email}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>סכום:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">₪${charge.amount}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>סוג חיוב:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${charge.billing_type}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>קוד שגיאה:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${errorCode}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>הודעת שגיאה:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${errorMessage}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>ניסיון:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${retryCount} מתוך ${maxRetries}</td></tr>
            </table>
            ${retryCount < maxRetries ? 
              `<p style="color: orange;">יבוצע ניסיון נוסף מחר.</p>` : 
              `<p style="color: red;"><strong>זהו הניסיון האחרון - המשתמש יורד לתוכנית חינמית!</strong></p>`
            }
            <p><a href="${process.env.FRONTEND_URL}/admin?tab=users">צפה בפרופיל המשתמש</a></p>
          </div>
        `
      );
    }
    
    // Send to user (use receipt_email if set, otherwise user's email)
    const userEmail = charge.receipt_email || charge.email;
    if (userEmail) {
      await sendMail(
        userEmail,
        'בעיה בחיוב החודשי שלך - נדרשת פעולה',
        `
          <div dir="rtl" style="font-family: Arial, sans-serif;">
            <h2>שלום ${charge.display_name || ''},</h2>
            <p>לא הצלחנו לחייב את אמצעי התשלום שלך עבור המנוי.</p>
            <p><strong>סיבה:</strong> ${errorMessage}</p>
            <p>אנא עדכן את פרטי התשלום שלך כדי למנוע הפסקת שירות:</p>
            <p><a href="${process.env.FRONTEND_URL}/settings/billing" style="background: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">עדכן פרטי תשלום</a></p>
            ${retryCount < maxRetries ? 
              `<p style="color: orange;">ננסה לחייב שוב מחר.</p>` : 
              `<p style="color: red;"><strong>זהו הניסיון האחרון - אם החיוב יכשל שוב, תועבר לתוכנית החינמית.</strong></p>`
            }
          </div>
        `
      );
    }
    
  } catch (error) {
    console.error('[BillingQueue] Error sending failure notifications:', error);
  }
}

/**
 * Send downgrade notification
 */
async function sendDowngradeNotification(charge) {
  try {
    // Get admin email
    const settingsResult = await pool.query(
      `SELECT config FROM system_settings WHERE key = 'site_config'`
    );
    const siteConfig = settingsResult.rows[0]?.config || {};
    const adminEmail = siteConfig.admin_email || process.env.ADMIN_EMAIL;
    
    // Notify admin
    if (adminEmail) {
      await sendMail(
        adminEmail,
        `🔻 משתמש הורד לתוכנית חינמית - ${charge.email}`,
        `
          <div dir="rtl" style="font-family: Arial, sans-serif;">
            <h2>משתמש הורד לתוכנית חינמית</h2>
            <p>לאחר ${charge.max_retries || 2} ניסיונות חיוב כושלים, המשתמש הועבר לתוכנית החינמית.</p>
            <table style="border-collapse: collapse;">
              <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>משתמש:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${charge.display_name || 'לא ידוע'}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>אימייל:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${charge.email}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>שגיאה אחרונה:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${charge.last_error}</td></tr>
            </table>
          </div>
        `
      );
    }
    
    // Notify user
    if (charge.email) {
      await sendMail(
        charge.email,
        'המנוי שלך הועבר לתוכנית החינמית',
        `
          <div dir="rtl" style="font-family: Arial, sans-serif;">
            <h2>שלום ${charge.display_name || ''},</h2>
            <p>לצערנו, לא הצלחנו לחייב את אמצעי התשלום שלך למרות מספר ניסיונות.</p>
            <p>המנוי שלך הועבר לתוכנית החינמית.</p>
            <p>אם ברצונך לחדש את המנוי, אנא עדכן את פרטי התשלום ובחר תוכנית חדשה:</p>
            <p><a href="${process.env.FRONTEND_URL}/pricing" style="background: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">צפה בתוכניות</a></p>
          </div>
        `
      );
    }
    
  } catch (error) {
    console.error('[BillingQueue] Error sending downgrade notification:', error);
  }
}

/**
 * Manually charge a user now
 */
async function chargeNow(queueId) {
  const chargeResult = await pool.query(
    `SELECT bq.*, 
            u.email, u.name as display_name,
            us.sumit_customer_id,
            upm.id as payment_method_id,
            sp.name as plan_name, sp.name_he as plan_name_he
     FROM billing_queue bq
     JOIN users u ON u.id = bq.user_id
     LEFT JOIN user_subscriptions us ON us.user_id = bq.user_id
     LEFT JOIN user_payment_methods upm ON upm.user_id = bq.user_id AND upm.is_active = true
     LEFT JOIN subscription_plans sp ON sp.id = bq.plan_id
     WHERE bq.id = $1`,
    [queueId]
  );
  
  const charge = chargeResult.rows[0];
  if (!charge) {
    return { success: false, error: 'Charge not found' };
  }
  
  if (!charge.sumit_customer_id) {
    return { success: false, error: 'User has no payment method' };
  }
  
  // Execute charge
  const description = charge.description || charge.plan_name_he || `מנוי ${charge.billing_type}`;
  const result = await sumitService.chargeOneTime({
    customerId: charge.sumit_customer_id,
    amount: parseFloat(charge.amount),
    description,
    sendEmail: true
  });
  
  if (result.success) {
    await handleChargeSuccess(charge, result);
    return { success: true, transactionId: result.transactionId };
  } else {
    await handleChargeFailure(charge, result.status || 'CHARGE_FAILED', result.error, result.technicalError);
    return { success: false, error: result.error };
  }
}

/**
 * Get billing stats for dashboard
 */
async function getBillingStats() {
  const stats = await pool.query(`
    SELECT 
      (SELECT COUNT(*) FROM billing_queue WHERE status = 'pending') as pending_count,
      (SELECT COUNT(*) FROM billing_queue WHERE status = 'failed') as failed_count,
      (SELECT COUNT(*) FROM billing_queue WHERE status = 'completed' AND processed_at >= CURRENT_DATE - INTERVAL '30 days') as completed_30d,
      (SELECT COALESCE(SUM(amount), 0) FROM billing_queue WHERE status = 'completed' AND processed_at >= CURRENT_DATE - INTERVAL '30 days') as revenue_30d,
      (SELECT COUNT(*) FROM billing_queue WHERE status = 'pending' AND charge_date <= CURRENT_DATE + INTERVAL '7 days') as upcoming_7d
  `);
  
  return stats.rows[0];
}

module.exports = {
  scheduleCharge,
  cancelCharge,
  cancelUserCharges,
  getUpcomingCharges,
  getFailedCharges,
  getPaymentHistory,
  processQueue,
  retryFailedCharges,
  chargeNow,
  getBillingStats,
  handleChargeSuccess,
  handleChargeFailure
};
