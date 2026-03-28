const { pool } = require('../../config/database');
const sumitService = require('./sumit.service');
const { sendMail } = require('../mail/transport.service');
const {
  wrapInLayout, ctaButton, alertBox, paragraph, greeting, dataTable,
  COLORS, FRONTEND_URL,
} = require('../mail/emailLayout.service');

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
     WHERE id = $1 AND status IN ('pending', 'failed')
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
            -- For service subscriptions, get name from additional_services
            COALESCE(sp.name_he, svc.name_he) as plan_name_he,
            COALESCE(sp.name, svc.name) as plan_name,
            us.sumit_customer_id,
            EXISTS(SELECT 1 FROM user_payment_methods pm WHERE pm.user_id = bq.user_id AND pm.is_active = true) as has_payment_method,
            (SELECT pm.card_last_digits FROM user_payment_methods pm WHERE pm.user_id = bq.user_id AND pm.is_active = true LIMIT 1) as card_last_digits
     FROM billing_queue bq
     JOIN users u ON u.id = bq.user_id
     LEFT JOIN user_subscriptions us ON us.user_id = bq.user_id
     LEFT JOIN subscription_plans sp ON sp.id = bq.plan_id
     LEFT JOIN user_service_subscriptions uss ON uss.id = bq.subscription_id AND bq.plan_id IS NULL
     LEFT JOIN additional_services svc ON svc.id = uss.service_id
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
            sp.name as plan_name, sp.name_he as plan_name_he,
            us.status as subscription_status,
            us.plan_id as current_plan_id,
            cur_sp.name_he as current_plan_name_he,
            cur_sp.price as current_plan_price
     FROM billing_queue bq
     JOIN users u ON u.id = bq.user_id
     LEFT JOIN subscription_plans sp ON sp.id = bq.plan_id
     LEFT JOIN user_subscriptions us ON us.user_id = bq.user_id
     LEFT JOIN subscription_plans cur_sp ON cur_sp.id = us.plan_id
     WHERE bq.status = 'failed'
     ORDER BY bq.last_attempt_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

/**
 * Get payment history with optional filters
 * Includes both main subscription payments (payment_history) and service payments (service_payment_history)
 */
async function getPaymentHistory({ userId, status, startDate, endDate, search, userEmail, limit = 100, offset = 0 }) {
  // Build shared WHERE conditions (same param indices used in both UNION parts)
  const params = [];
  let paramIdx = 1;
  const conditions = [];

  if (userId) { conditions.push(`user_id_filter = $${paramIdx++}`); params.push(userId); }
  if (userEmail) { conditions.push(`email_filter = $${paramIdx++}`); params.push(userEmail); }
  if (search) { conditions.push(`search_filter = $${paramIdx}`); params.push(`%${search}%`); paramIdx++; }
  if (status) { conditions.push(`status_filter = $${paramIdx++}`); params.push(status); }
  if (startDate) { conditions.push(`start_filter = $${paramIdx++}`); params.push(startDate); }
  if (endDate) { conditions.push(`end_filter = $${paramIdx++}`); params.push(endDate); }

  // Rebuild conditions into actual SQL for each subquery
  let phWhere = '1=1';
  let sphWhere = '1=1';
  let cIdx = 1;

  if (userId) {
    phWhere += ` AND ph.user_id = $${cIdx}`;
    sphWhere += ` AND sph.user_id = $${cIdx}`;
    cIdx++;
  }
  if (userEmail) {
    phWhere += ` AND u.email = $${cIdx}`;
    sphWhere += ` AND u.email = $${cIdx}`;
    cIdx++;
  }
  if (search) {
    phWhere += ` AND (u.email ILIKE $${cIdx} OR u.name ILIKE $${cIdx})`;
    sphWhere += ` AND (u.email ILIKE $${cIdx} OR u.name ILIKE $${cIdx})`;
    cIdx++;
  }
  if (status) {
    phWhere += ` AND ph.status = $${cIdx}`;
    sphWhere += ` AND sph.status = $${cIdx}`;
    cIdx++;
  }
  if (startDate) {
    phWhere += ` AND ph.created_at >= $${cIdx}`;
    sphWhere += ` AND sph.created_at >= $${cIdx}`;
    cIdx++;
  }
  if (endDate) {
    phWhere += ` AND ph.created_at <= $${cIdx}`;
    sphWhere += ` AND sph.created_at <= $${cIdx}`;
    cIdx++;
  }

  const limitParam = cIdx++;
  const offsetParam = cIdx;
  params.push(limit, offset);

  const query = `
    SELECT * FROM (
      SELECT ph.id, ph.user_id, ph.amount, ph.status, ph.created_at,
             ph.sumit_transaction_id, ph.description, ph.error_message,
             ph.failure_code, ph.receipt_url, ph.billing_type, ph.sumit_document_number,
             u.email, u.name as display_name,
             sp.name as plan_name, sp.name_he as plan_name_he
      FROM payment_history ph
      JOIN users u ON u.id = ph.user_id
      LEFT JOIN user_subscriptions us ON us.id = ph.subscription_id
      LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
      WHERE ${phWhere}

      UNION ALL

      SELECT sph.id, sph.user_id, sph.amount, sph.status, sph.created_at,
             sph.sumit_transaction_id, sph.description, sph.error_message,
             NULL as failure_code, sph.receipt_url,
             COALESCE(sph.payment_type, 'status_bot') as billing_type,
             sph.sumit_document_number,
             u.email, u.name as display_name,
             s.name as plan_name, s.name_he as plan_name_he
      FROM service_payment_history sph
      JOIN users u ON u.id = sph.user_id
      JOIN additional_services s ON s.id = sph.service_id
      WHERE ${sphWhere}
    ) combined
    ORDER BY created_at DESC
    LIMIT $${limitParam} OFFSET $${offsetParam}
  `;

  const result = await pool.query(query, params);

  // Count query (same UNION approach, no pagination)
  const countQuery = `
    SELECT COUNT(*) FROM (
      SELECT ph.id FROM payment_history ph
      JOIN users u ON u.id = ph.user_id
      WHERE ${phWhere}
      UNION ALL
      SELECT sph.id FROM service_payment_history sph
      JOIN users u ON u.id = sph.user_id
      WHERE ${sphWhere}
    ) combined
  `;
  // Count uses same params but without limit/offset
  const countParams = params.slice(0, params.length - 2);
  const countResult = await pool.query(countQuery, countParams);

  return {
    payments: result.rows,
    total: parseInt(countResult.rows[0].count)
  };
}

/**
 * Detect active subscriptions with no billing queue entry and create pending charges for them.
 * Also resets charges stuck in 'processing' state for more than 10 minutes back to 'failed'.
 */
async function detectMissingBillingEntries() {
  // 1. Fix stuck 'processing' charges (cron crashed mid-run)
  const stuckResult = await pool.query(`
    UPDATE billing_queue
    SET status = 'failed',
        last_error = 'חיוב נתקע במצב עיבוד - אופס אוטומטי',
        last_error_code = 'STUCK_PROCESSING',
        last_attempt_at = NOW(),
        next_retry_at = CURRENT_DATE,
        updated_at = NOW()
    WHERE status = 'processing'
      AND updated_at < NOW() - INTERVAL '10 minutes'
    RETURNING id, user_id
  `);
  if (stuckResult.rows.length > 0) {
    console.log(`[BillingQueue] Reset ${stuckResult.rows.length} stuck processing charges to failed`);
  }

  // 2. Find active paid subscriptions with overdue next_charge_date but no billing queue entry
  const missingResult = await pool.query(`
    SELECT us.user_id, us.id as subscription_id, us.plan_id, us.next_charge_date,
           us.billing_period, sp.price as plan_price, sp.name_he as plan_name_he
    FROM user_subscriptions us
    JOIN subscription_plans sp ON sp.id = us.plan_id
    WHERE us.status IN ('active', 'trial')
      AND sp.price > 0
      AND COALESCE(us.next_charge_date, us.trial_ends_at) IS NOT NULL
      AND COALESCE(us.next_charge_date, us.trial_ends_at) <= CURRENT_DATE
      AND NOT EXISTS (
        SELECT 1 FROM billing_queue bq
        WHERE bq.user_id = us.user_id
          AND bq.status IN ('pending', 'processing', 'failed')
      )
  `);

  let created = 0;
  for (const sub of missingResult.rows) {
    const billingType = sub.billing_period === 'yearly' ? 'yearly' : 'monthly';
    await pool.query(
      `INSERT INTO billing_queue
       (user_id, subscription_id, amount, charge_date, billing_type, plan_id, description, currency)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'ILS')`,
      [
        sub.user_id,
        sub.subscription_id,
        sub.plan_price,
        sub.next_charge_date,
        billingType,
        sub.plan_id,
        `מנוי ${billingType === 'yearly' ? 'שנתי' : 'חודשי'} - ${sub.plan_name_he}`
      ]
    );
    created++;
    console.log(`[BillingQueue] Created missing billing entry for user ${sub.user_id} (was due ${sub.next_charge_date})`);
  }

  // 2b. Find active service subscriptions (e.g. status bot) with overdue/upcoming expiry but no billing queue entry
  const missingServiceResult = await pool.query(`
    SELECT uss.user_id, uss.id as subscription_id, uss.service_id, uss.expires_at,
           s.price as service_price, s.name_he as service_name
    FROM user_service_subscriptions uss
    JOIN additional_services s ON s.id = uss.service_id
    WHERE uss.status = 'active'
      AND s.price > 0
      AND uss.expires_at IS NOT NULL
      AND uss.expires_at <= CURRENT_DATE + INTERVAL '30 days'
      AND NOT EXISTS (
        SELECT 1 FROM billing_queue bq
        WHERE bq.user_id = uss.user_id
          AND bq.status IN ('pending', 'processing', 'failed')
          AND bq.billing_type = 'status_bot'
      )
      AND EXISTS (
        SELECT 1 FROM user_payment_methods pm WHERE pm.user_id = uss.user_id AND pm.is_active = true
      )
  `);

  for (const sub of missingServiceResult.rows) {
    await pool.query(
      `INSERT INTO billing_queue
       (user_id, subscription_id, amount, charge_date, billing_type, description, currency)
       VALUES ($1, $2, $3, $4::date, 'status_bot', $5, 'ILS')
       ON CONFLICT DO NOTHING`,
      [sub.user_id, sub.subscription_id, sub.service_price, sub.expires_at, `${sub.service_name} - חודשי`]
    );
    created++;
    console.log(`[BillingQueue] Created missing service billing entry for user ${sub.user_id} (${sub.service_name}, expires ${sub.expires_at})`);
  }

  if (created > 0) {
    console.log(`[BillingQueue] Created ${created} missing billing queue entries`);
  }

  // 3. Find failed charges that exhausted retries but were never finalized (handleMaxRetriesReached not called)
  //    These are identifiable by: status='failed', retry_count >= max_retries, next_retry_at IS NOT NULL
  const unfinishedResult = await pool.query(`
    SELECT bq.*,
           u.email, u.name as display_name,
           COALESCE(us.sumit_customer_id, upm.sumit_customer_id) as sumit_customer_id,
           sp.name as plan_name, sp.name_he as plan_name_he
    FROM billing_queue bq
    JOIN users u ON u.id = bq.user_id
    LEFT JOIN user_subscriptions us ON us.id = bq.subscription_id
    LEFT JOIN user_payment_methods upm ON upm.user_id = bq.user_id AND upm.is_active = true
    LEFT JOIN subscription_plans sp ON sp.id = bq.plan_id
    WHERE bq.status = 'failed'
      AND bq.retry_count >= bq.max_retries
      AND bq.next_retry_at IS NOT NULL
  `);

  let finalized = 0;
  for (const charge of unfinishedResult.rows) {
    try {
      await handleMaxRetriesReached(charge, charge.last_error || 'MAX_RETRIES_EXHAUSTED');
      finalized++;
      console.log(`[BillingQueue] Finalized exhausted charge ${charge.id} for user ${charge.user_id}`);
    } catch (e) {
      console.error(`[BillingQueue] Error finalizing exhausted charge ${charge.id}:`, e);
    }
  }

  if (finalized > 0) {
    console.log(`[BillingQueue] Finalized ${finalized} exhausted failed charges`);
  }

  return { stuckFixed: stuckResult.rows.length, missingCreated: created, exhaustedFinalized: finalized };
}

/**
 * Process all pending charges for today
 */
async function processQueue() {
  console.log('[BillingQueue] Starting daily queue processing...');

  // First, detect and fix any missing entries or stuck charges
  await detectMissingBillingEntries();
  
  // Get all pending charges due today or earlier
  const pendingResult = await pool.query(
    `SELECT bq.*,
            u.email, u.name as display_name,
            COALESCE(us.sumit_customer_id, upm.sumit_customer_id) as sumit_customer_id,
            us.invoice_name, us.receipt_email,
            upm.id as payment_method_id,
            sp.name as plan_name, sp.name_he as plan_name_he, sp.price as plan_price
     FROM billing_queue bq
     JOIN users u ON u.id = bq.user_id
     LEFT JOIN user_subscriptions us ON us.id = bq.subscription_id
     LEFT JOIN user_payment_methods upm ON upm.user_id = bq.user_id AND upm.is_active = true
     LEFT JOIN subscription_plans sp ON sp.id = bq.plan_id
     WHERE bq.status = 'pending'
       AND bq.charge_date <= CURRENT_DATE
     ORDER BY bq.charge_date ASC
     FOR UPDATE OF bq SKIP LOCKED`
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
            COALESCE(us.sumit_customer_id, upm.sumit_customer_id) as sumit_customer_id,
            us.invoice_name, us.receipt_email,
            sp.name as plan_name, sp.name_he as plan_name_he
     FROM billing_queue bq
     JOIN users u ON u.id = bq.user_id
     LEFT JOIN user_subscriptions us ON us.id = bq.subscription_id
     LEFT JOIN user_payment_methods upm ON upm.user_id = bq.user_id AND upm.is_active = true
     LEFT JOIN subscription_plans sp ON sp.id = bq.plan_id
     WHERE bq.status = 'failed'
       AND bq.retry_count < bq.max_retries
       AND bq.next_retry_at <= CURRENT_DATE
     ORDER BY bq.next_retry_at ASC
     FOR UPDATE OF bq SKIP LOCKED`
  );
  
  console.log(`[BillingQueue] Found ${failedResult.rows.length} failed charges to retry`);
  
  let retried = 0;
  let successful = 0;
  
  for (const charge of failedResult.rows) {
    retried++;
    
    try {
      // Reset to processing
      await pool.query(
        `UPDATE billing_queue
         SET status = 'processing',
             retry_count = retry_count + 1,
             updated_at = NOW()
         WHERE id = $1`,
        [charge.id]
      );

      // newRetryCount reflects the value now stored in DB
      const newRetryCount = charge.retry_count + 1;

      // Check if user has a payment method (same guard as processQueue)
      if (!charge.sumit_customer_id) {
        if (newRetryCount >= charge.max_retries) {
          await handleMaxRetriesReached(charge, 'NO_PAYMENT_METHOD');
        } else {
          await handleChargeFailure(charge, 'NO_PAYMENT_METHOD', 'למשתמש אין אמצעי תשלום מוגדר');
        }
        continue;
      }

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
      // Properly finalize the charge so it isn't left stuck in 'processing'
      try {
        const newRetryCount = charge.retry_count + 1;
        if (newRetryCount >= (charge.max_retries || 3)) {
          await handleMaxRetriesReached(charge, error.message);
        } else {
          await handleChargeFailure(charge, 'SYSTEM_ERROR', error.message);
        }
      } catch (innerError) {
        console.error(`[BillingQueue] Error finalizing failed retry for charge ${charge.id}:`, innerError);
      }
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
        // Apply admin percent discount (compound: yearly base first, then percent)
        else if (sub.custom_discount_mode === 'percent' && sub.referral_discount_percent) {
          if (isYearly) nextAmount = nextAmount * 12 * 0.8;
          nextAmount = Math.floor(nextAmount * (1 - sub.referral_discount_percent / 100));
          description += ` (${sub.referral_discount_percent}% הנחה)`;
        }
        // Apply coupon/promo recurring discount (promo_price stored on subscription)
        // promo_months_remaining > 1 because it was already decremented when the previous charge was scheduled
        else if (sub.promo_price && (sub.promo_months_remaining > 1 || sub.promo_months_remaining === -1)) {
          nextAmount = parseFloat(sub.promo_price);
          description += ' (מחיר מבצע)';
          // Decrement promo_months_remaining for next cycle
          if (sub.promo_months_remaining > 1) {
            await client.query(
              `UPDATE user_subscriptions SET promo_months_remaining = promo_months_remaining - 1, updated_at = NOW() WHERE user_id = $1`,
              [charge.user_id]
            );
          }
        }
        // Apply referral discount if still active (compound)
        else if (sub.referral_discount_percent && sub.referral_months_remaining > 1) {
          if (isYearly) nextAmount = nextAmount * 12 * 0.8;
          nextAmount = Math.floor(nextAmount * (1 - sub.referral_discount_percent / 100));
          description += ` (${sub.referral_discount_percent}% הנחת הפניה)`;
        }
        // Apply yearly discount only
        else if (isYearly) {
          nextAmount = nextAmount * 12 * 0.8;
          description += ' (20% הנחה שנתית)';
        }
      }
      
      // Schedule next charge (only if no future pending charge already exists for this user)
      const nextChargeDate = new Date();
      if (isYearly) {
        nextChargeDate.setFullYear(nextChargeDate.getFullYear() + 1);
      } else {
        nextChargeDate.setMonth(nextChargeDate.getMonth() + 1);
      }

      const existingNext = await client.query(
        `SELECT id FROM billing_queue WHERE user_id = $1 AND status = 'pending' AND id != $2 LIMIT 1`,
        [charge.user_id, charge.id]
      );

      if (existingNext.rows.length === 0) {
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
      } else {
        console.log(`[BillingQueue] Skipping next charge creation for user ${charge.user_id} - pending charge already exists`);
      }
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
      const successContent = `
        ${greeting(userName)}
        ${alertBox('התשלום שלך בוצע בהצלחה!', 'success')}

        ${dataTable([
          ['סכום:', `₪${charge.amount}`, true],
          ['תיאור:', charge.description || charge.plan_name_he],
          ['חיוב הבא:', formattedNextDate],
        ])}

        ${chargeResult.documentURL
          ? ctaButton('צפה בקבלה', chargeResult.documentURL, COLORS.success, '#047857')
          : ''
        }

        ${paragraph(`<a href="${FRONTEND_URL}/settings?tab=subscription" style="color:${COLORS.primary};text-decoration:underline;">לניהול המנוי שלך</a>`, { size: '13', color: COLORS.textLight })}
      `;

      await sendMail(
        userEmail,
        `התשלום בוצע בהצלחה - ₪${charge.amount}`,
        wrapInLayout({
          content: successContent,
          headerTitle: 'התשלום בוצע בהצלחה',
          headerIcon: '✅',
          headerColor: '#10b981',
          headerColorEnd: COLORS.success,
          preheader: `התשלום על סך ₪${charge.amount} בוצע בהצלחה`,
        })
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
  const maxRetries = charge.max_retries || 3; // 3 days grace period

  // Calculate next retry date (tomorrow, skip Shabbat)
  const nextRetryDate = new Date();
  nextRetryDate.setDate(nextRetryDate.getDate() + 1);
  // If next retry falls on Saturday (6), push to Sunday
  if (nextRetryDate.getDay() === 6) {
    nextRetryDate.setDate(nextRetryDate.getDate() + 1);
  }
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
  const remainingDays = maxRetries - retryCount;
  await pool.query(`
    INSERT INTO notifications (user_id, notification_type, title, message, metadata, priority)
    VALUES ($1, 'payment_failed', $2, $3, $4, $5)
  `, [
    charge.user_id,
    isLastRetry ? '⚠️ ניסיון אחרון לחיוב - עדכן כרטיס עכשיו!' : `בעיה בחיוב - נותרו ${remainingDays} ימים`,
    isLastRetry
      ? `לא הצלחנו לחייב ₪${charge.amount}. זהו הניסיון האחרון! אנא עדכן את כרטיס האשראי שלך בהגדרות כדי למנוע הפסקת שירות.`
      : `לא הצלחנו לחייב ₪${charge.amount}. ננסה שוב ב-${formattedRetryDate}. נותרו ${remainingDays} ימים לעדכון כרטיס אשראי.`,
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
      `SELECT value FROM system_settings WHERE key = 'site_config'`
    );
    const raw = settingsResult.rows[0]?.value;
    const siteConfig = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
    const adminEmail = siteConfig.admin_email || process.env.ADMIN_EMAIL;

    const isLastRetry = retryCount >= maxRetries;

    // Send to admin
    if (adminEmail) {
      const chargeDateStr = charge.charge_date ? new Date(charge.charge_date).toLocaleDateString('he-IL') : 'לא ידוע';
      const daysPastDue = charge.charge_date ? Math.floor((Date.now() - new Date(charge.charge_date)) / (1000 * 60 * 60 * 24)) : 0;
      const overdueNote = daysPastDue > 0 ? `⏰ עבר ${daysPastDue} ${daysPastDue === 1 ? 'יום' : 'ימים'} מתאריך החיוב!` : '';

      const adminContent = `
        ${overdueNote ? alertBox(overdueNote, 'error') : ''}
        ${dataTable([
          ['משתמש:', charge.display_name || 'לא ידוע'],
          ['אימייל:', charge.email],
          ['סכום:', `₪${charge.amount}`],
          ['סוג חיוב:', charge.billing_type],
          ['תאריך חיוב:', chargeDateStr],
          ['קוד שגיאה:', errorCode],
          ['הודעת שגיאה:', errorMessage],
          ['ניסיון:', `${retryCount} מתוך ${maxRetries}`],
        ])}
        ${isLastRetry
          ? alertBox('זהו הניסיון האחרון - המשתמש ירד לתוכנית חינמית בניסיון הבא!', 'error')
          : alertBox(`ניסיון הבא: ${formattedRetryDate}`, 'warning')
        }
        ${ctaButton('צפה בניהול חיובים', `${FRONTEND_URL}/admin?tab=billing`, COLORS.primary, COLORS.primaryDark)}
      `;

      await sendMail(
        adminEmail,
        isLastRetry
          ? `🚨 ניסיון אחרון לחיוב - ${charge.display_name || charge.email} (₪${charge.amount})`
          : `⚠️ כשלון בחיוב - ${charge.display_name || charge.email} (ניסיון ${retryCount}/${maxRetries})`,
        wrapInLayout({
          content: adminContent,
          headerTitle: isLastRetry ? 'ניסיון אחרון לחיוב!' : 'כשלון בחיוב אוטומטי',
          headerIcon: isLastRetry ? '🚨' : '⚠️',
          headerColor: COLORS.error,
          headerColorEnd: '#b91c1c',
          showUnsubscribe: false,
        })
      );
    }

    // Send to user (use receipt_email if set, otherwise user's email)
    const userEmail = charge.receipt_email || charge.email;
    if (userEmail) {
      const remainingDays = maxRetries - retryCount;
      const graceDaysText = remainingDays > 0
        ? `נותרו לך עוד ${remainingDays} ${remainingDays === 1 ? 'יום' : 'ימים'} לעדכן את פרטי התשלום.`
        : 'זהו הניסיון האחרון. אם לא תעדכן את פרטי התשלום, המנוי שלך יופסק.';

      // Translate common Sumit errors to simple Hebrew
      let hebrewError = errorMessage;
      if (/declined|סירוב/i.test(errorMessage)) hebrewError = 'הכרטיס נדחה על ידי חברת האשראי';
      else if (/expired|תוקף/i.test(errorMessage)) hebrewError = 'פג תוקף כרטיס האשראי';
      else if (/insufficient|מספיק/i.test(errorMessage)) hebrewError = 'אין מספיק יתרה בכרטיס';
      else if (/credentials|מחובר/i.test(errorMessage)) hebrewError = 'בעיה באימות פרטי התשלום';

      const userContent = `
        ${greeting(charge.display_name)}
        ${paragraph(`ניסינו לחייב את אמצעי התשלום שלך על סך <strong>₪${charge.amount}</strong> עבור ${charge.description || charge.plan_name_he || 'המנוי שלך'}, אך החיוב נכשל.`)}
        ${alertBox(`<strong>סיבת הכשלון:</strong> ${hebrewError}`, 'error')}
        ${alertBox(graceDaysText, isLastRetry ? 'error' : 'warning')}
        ${paragraph('כדי למנוע הפסקת שירות, אנא עדכן את פרטי התשלום שלך (כרטיס אשראי חדש או תקף):')}
        ${ctaButton('עדכן פרטי תשלום', `${FRONTEND_URL}/settings?tab=subscription`, COLORS.primary, COLORS.primaryDark)}
        ${isLastRetry
          ? paragraph('<strong>שים לב:</strong> אם לא תעדכן את פרטי התשלום, המנוי יופסק והחשבון שלך יעבור לתוכנית החינמית. הבוטים שלך יושבתו.', { size: '13', color: COLORS.error })
          : paragraph(`ננסה לחייב שוב ב-${formattedRetryDate}. אם תעדכן את הכרטיס לפני כן, החיוב יצליח אוטומטית.`, { size: '13', color: COLORS.textLight })
        }
      `;

      await sendMail(
        userEmail,
        isLastRetry ? '⚠️ ניסיון אחרון לחיוב - נדרשת פעולה מיידית!' : 'בעיה בחיוב - נדרש עדכון כרטיס אשראי',
        wrapInLayout({
          content: userContent,
          headerTitle: isLastRetry ? 'ניסיון אחרון לחיוב!' : 'בעיה בחיוב',
          headerIcon: isLastRetry ? '⚠️' : '💳',
          headerColor: COLORS.error,
          headerColorEnd: '#b91c1c',
          preheader: `לא הצלחנו לחייב ₪${charge.amount} - ${graceDaysText}`,
        })
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
      `SELECT value FROM system_settings WHERE key = 'site_config'`
    );
    const raw2 = settingsResult.rows[0]?.value;
    const siteConfig = typeof raw2 === 'string' ? JSON.parse(raw2) : (raw2 || {});
    const adminEmail = siteConfig.admin_email || process.env.ADMIN_EMAIL;

    // Notify admin
    if (adminEmail) {
      const adminContent = `
        ${alertBox(`לאחר ${charge.max_retries || 2} ניסיונות חיוב כושלים, המשתמש הועבר לתוכנית החינמית.`, 'error')}
        ${dataTable([
          ['משתמש:', charge.display_name || 'לא ידוע'],
          ['אימייל:', charge.email],
          ['שגיאה אחרונה:', charge.last_error],
        ])}
      `;

      await sendMail(
        adminEmail,
        `🔻 משתמש הורד לתוכנית חינמית - ${charge.email}`,
        wrapInLayout({
          content: adminContent,
          headerTitle: 'משתמש הורד לתוכנית חינמית',
          headerIcon: '🔻',
          headerColor: COLORS.error,
          headerColorEnd: '#b91c1c',
          showUnsubscribe: false,
        })
      );
    }

    // Notify user
    if (charge.email) {
      const userContent = `
        ${greeting(charge.display_name)}
        ${alertBox('המנוי שלך הופסק עקב כשלון בחיוב.', 'error')}
        ${paragraph(`לצערנו, לא הצלחנו לחייב את אמצעי התשלום שלך (₪${charge.amount}) למרות ${charge.max_retries || 3} ניסיונות.`)}
        ${paragraph('<strong>מה השתנה?</strong>')}
        ${paragraph('• הבוטים שלך <strong>הושבתו</strong> (למעט בוט אחד בתוכנית החינמית)<br>• המנוי שלך הועבר לתוכנית החינמית<br>• שירותים נוספים הופסקו', { size: '14' })}
        ${paragraph('<strong>איך לחדש?</strong> עדכן את כרטיס האשראי שלך ובחר תוכנית חדשה:')}
        ${ctaButton('חדש מנוי עכשיו', `${FRONTEND_URL}/pricing`, COLORS.primary, COLORS.primaryDark)}
        ${paragraph('לעזרה נוספת ניתן לפנות אלינו.', { size: '13', color: COLORS.textLight })}
      `;

      await sendMail(
        charge.email,
        '❌ המנוי שלך הופסק - נדרש חידוש',
        wrapInLayout({
          content: userContent,
          headerTitle: 'המנוי שלך הופסק',
          headerIcon: '❌',
          headerColor: COLORS.error,
          headerColorEnd: '#b91c1c',
          preheader: 'המנוי שלך הופסק עקב כשלון בחיוב — חדש את המנוי כדי להפעיל מחדש',
        })
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
            COALESCE(us.sumit_customer_id, upm.sumit_customer_id) as sumit_customer_id,
            upm.id as payment_method_id,
            sp.name as plan_name, sp.name_he as plan_name_he
     FROM billing_queue bq
     JOIN users u ON u.id = bq.user_id
     LEFT JOIN user_subscriptions us ON us.id = bq.subscription_id
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
  handleChargeFailure,
  detectMissingBillingEntries
};
