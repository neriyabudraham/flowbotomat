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
            sp.name as plan_name, sp.name_he as plan_name_he
     FROM billing_queue bq
     JOIN users u ON u.id = bq.user_id
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
        amount: parseFloat(charge.amount),
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
    
    // Update subscription next_charge_date
    if (charge.billing_type === 'monthly' || charge.billing_type === 'renewal') {
      await client.query(
        `UPDATE user_subscriptions 
         SET next_charge_date = next_charge_date + INTERVAL '1 month',
             updated_at = NOW()
         WHERE user_id = $1`,
        [charge.user_id]
      );
      
      // Get current subscription with discount info to calculate next charge
      const subResult = await client.query(
        `SELECT us.*, sp.price as plan_price, sp.name_he as plan_name_he
         FROM user_subscriptions us
         JOIN subscription_plans sp ON sp.id = us.plan_id
         WHERE us.user_id = $1`,
        [charge.user_id]
      );
      
      const sub = subResult.rows[0];
      let nextAmount = parseFloat(sub?.plan_price || charge.amount);
      let description = `מנוי חודשי - ${sub?.plan_name_he || charge.plan_name_he}`;
      
      if (sub) {
        // Apply custom discount from admin
        if (sub.custom_discount_mode === 'fixed_price' && sub.custom_fixed_price) {
          nextAmount = parseFloat(sub.custom_fixed_price);
          description += ' (מחיר מותאם)';
        } else if (sub.custom_discount_mode === 'percent' && sub.referral_discount_percent) {
          nextAmount = Math.floor(nextAmount * (1 - sub.referral_discount_percent / 100));
          description += ` (${sub.referral_discount_percent}% הנחה)`;
        }
        // Apply referral discount if still active
        else if (sub.referral_discount_percent && sub.referral_months_remaining > 0) {
          nextAmount = Math.floor(nextAmount * (1 - sub.referral_discount_percent / 100));
          description += ` (${sub.referral_discount_percent}% הנחת הפניה)`;
        }
      }
      
      // Schedule next month's charge
      const nextChargeDate = new Date();
      nextChargeDate.setMonth(nextChargeDate.getMonth() + 1);
      
      await client.query(
        `INSERT INTO billing_queue 
         (user_id, subscription_id, amount, charge_date, billing_type, plan_id, description, currency)
         VALUES ($1, $2, $3, $4, 'monthly', $5, $6, $7)`,
        [
          charge.user_id,
          charge.subscription_id,
          nextAmount,
          nextChargeDate.toISOString().split('T')[0],
          charge.plan_id,
          description,
          charge.currency
        ]
      );
    } else if (charge.billing_type === 'yearly') {
      await client.query(
        `UPDATE user_subscriptions 
         SET next_charge_date = next_charge_date + INTERVAL '1 year',
             expires_at = expires_at + INTERVAL '1 year',
             updated_at = NOW()
         WHERE user_id = $1`,
        [charge.user_id]
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
      let nextAmount = parseFloat(sub?.plan_price || charge.amount) * 12 * 0.8; // Yearly 20% discount
      let description = `מנוי שנתי - ${sub?.plan_name_he || charge.plan_name_he}`;
      
      if (sub) {
        // Apply custom discount from admin
        if (sub.custom_discount_mode === 'fixed_price' && sub.custom_fixed_price) {
          nextAmount = parseFloat(sub.custom_fixed_price) * 12;
          description += ' (מחיר מותאם)';
        } else if (sub.custom_discount_mode === 'percent' && sub.referral_discount_percent) {
          const baseYearly = parseFloat(sub.plan_price) * 12 * 0.8;
          nextAmount = Math.floor(baseYearly * (1 - sub.referral_discount_percent / 100));
          description += ` (${sub.referral_discount_percent}% הנחה)`;
        }
      }
      
      // Schedule next year's charge
      const nextChargeDate = new Date();
      nextChargeDate.setFullYear(nextChargeDate.getFullYear() + 1);
      
      await client.query(
        `INSERT INTO billing_queue 
         (user_id, subscription_id, amount, charge_date, billing_type, plan_id, description, currency)
         VALUES ($1, $2, $3, $4, 'yearly', $5, $6, $7)`,
        [
          charge.user_id,
          charge.subscription_id,
          nextAmount,
          nextChargeDate.toISOString().split('T')[0],
          charge.plan_id,
          description,
          charge.currency
        ]
      );
    }
    
    await client.query('COMMIT');
    
    console.log(`[BillingQueue] Charge ${charge.id} completed successfully. Transaction: ${chargeResult.transactionId}`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
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
  
  console.log(`[BillingQueue] Charge ${charge.id} failed: ${errorCode} - ${errorMessage}. Retry ${retryCount}/${maxRetries}`);
  
  // Send notifications
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
      `SELECT id FROM subscription_plans WHERE price = 0 AND is_active = true LIMIT 1`
    );
    
    if (freePlanResult.rows[0]) {
      // Downgrade to free plan
      await client.query(
        `UPDATE user_subscriptions 
         SET plan_id = $1,
             status = 'active',
             is_manual = false,
             admin_notes = COALESCE(admin_notes, '') || E'\n[' || NOW()::text || '] הורד לתוכנית חינמית עקב כשלון בחיוב',
             updated_at = NOW()
         WHERE user_id = $2`,
        [freePlanResult.rows[0].id, charge.user_id]
      );
    }
    
    // Cancel any other pending charges for this user
    await client.query(
      `UPDATE billing_queue 
       SET status = 'cancelled', updated_at = NOW()
       WHERE user_id = $1 AND status = 'pending'`,
      [charge.user_id]
    );
    
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
