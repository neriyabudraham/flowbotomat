const billingQueueService = require('../../services/payment/billingQueue.service');
const { pool } = require('../../config/database');

/**
 * Get upcoming charges for admin dashboard
 */
async function getUpcomingCharges(req, res) {
  try {
    const { days = 7, limit = 100 } = req.query;
    const charges = await billingQueueService.getUpcomingCharges(parseInt(days), parseInt(limit));
    res.json({ charges });
  } catch (error) {
    console.error('[AdminBilling] Get upcoming charges error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת חיובים קרובים' });
  }
}

/**
 * Get failed charges for admin dashboard
 */
async function getFailedCharges(req, res) {
  try {
    const { limit = 100 } = req.query;
    const charges = await billingQueueService.getFailedCharges(parseInt(limit));
    res.json({ charges });
  } catch (error) {
    console.error('[AdminBilling] Get failed charges error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת חיובים שנכשלו' });
  }
}

/**
 * Get payment history with filters
 */
async function getPaymentHistory(req, res) {
  try {
    const { userId, status, startDate, endDate, search, userEmail, limit = 100, offset = 0 } = req.query;
    
    const result = await billingQueueService.getPaymentHistory({
      userId,
      status,
      startDate,
      endDate,
      search,
      userEmail,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
    res.json(result);
  } catch (error) {
    console.error('[AdminBilling] Get payment history error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת היסטוריית תשלומים' });
  }
}

/**
 * Get billing stats for dashboard
 */
async function getBillingStats(req, res) {
  try {
    const stats = await billingQueueService.getBillingStats();
    res.json({ stats });
  } catch (error) {
    console.error('[AdminBilling] Get billing stats error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת סטטיסטיקות' });
  }
}

/**
 * Manual charge - execute a pending charge now
 */
async function chargeNow(req, res) {
  try {
    const { id } = req.params;
    const adminId = req.user.id;
    
    console.log(`[AdminBilling] Admin ${adminId} initiating manual charge for ${id}`);
    
    const result = await billingQueueService.chargeNow(id);
    
    if (result.success) {
      // Log admin action
      await pool.query(`
        INSERT INTO admin_audit_log (admin_id, action, entity_type, entity_id, details)
        VALUES ($1, 'manual_charge', 'billing_queue', $2, $3)
      `, [adminId, id, JSON.stringify({ transactionId: result.transactionId })]);
      
      res.json({ success: true, transactionId: result.transactionId });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('[AdminBilling] Charge now error:', error);
    res.status(500).json({ error: 'שגיאה בביצוע חיוב' });
  }
}

/**
 * Cancel a pending charge
 */
async function cancelCharge(req, res) {
  try {
    const { id } = req.params;
    const adminId = req.user.id;
    
    console.log(`[AdminBilling] Admin ${adminId} cancelling charge ${id}`);
    
    const result = await billingQueueService.cancelCharge(id);
    
    if (result) {
      // Log admin action
      await pool.query(`
        INSERT INTO admin_audit_log (admin_id, action, entity_type, entity_id, details)
        VALUES ($1, 'cancel_charge', 'billing_queue', $2, $3)
      `, [adminId, id, JSON.stringify({ userId: result.user_id, amount: result.amount })]);
      
      res.json({ success: true, charge: result });
    } else {
      res.status(404).json({ error: 'חיוב לא נמצא או כבר בוטל' });
    }
  } catch (error) {
    console.error('[AdminBilling] Cancel charge error:', error);
    res.status(500).json({ error: 'שגיאה בביטול חיוב' });
  }
}

/**
 * Retry a failed charge
 */
async function retryCharge(req, res) {
  try {
    const { id } = req.params;
    const adminId = req.user.id;
    
    console.log(`[AdminBilling] Admin ${adminId} retrying charge ${id}`);
    
    // Reset the charge status to pending for immediate processing
    const resetResult = await pool.query(`
      UPDATE billing_queue 
      SET status = 'pending', 
          charge_date = CURRENT_DATE,
          updated_at = NOW()
      WHERE id = $1 AND status = 'failed'
      RETURNING *
    `, [id]);
    
    if (resetResult.rows.length === 0) {
      return res.status(404).json({ error: 'חיוב לא נמצא או לא במצב כשלון' });
    }
    
    // Execute the charge
    const result = await billingQueueService.chargeNow(id);
    
    // Log admin action
    await pool.query(`
      INSERT INTO admin_audit_log (admin_id, action, entity_type, entity_id, details)
      VALUES ($1, 'retry_charge', 'billing_queue', $2, $3)
    `, [adminId, id, JSON.stringify({ success: result.success, error: result.error })]);
    
    if (result.success) {
      res.json({ success: true, transactionId: result.transactionId });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('[AdminBilling] Retry charge error:', error);
    res.status(500).json({ error: 'שגיאה בניסיון חוזר' });
  }
}

/**
 * Schedule a manual charge for a user
 */
async function scheduleManualCharge(req, res) {
  try {
    const { userId, amount, description, chargeDate } = req.body;
    const adminId = req.user.id;
    
    if (!userId || !amount) {
      return res.status(400).json({ error: 'נדרש מזהה משתמש וסכום' });
    }
    
    console.log(`[AdminBilling] Admin ${adminId} scheduling manual charge for user ${userId}`);
    
    // Get user's subscription ID
    const subResult = await pool.query(
      `SELECT id, plan_id FROM user_subscriptions WHERE user_id = $1`,
      [userId]
    );
    
    const charge = await billingQueueService.scheduleCharge({
      userId,
      subscriptionId: subResult.rows[0]?.id,
      amount: parseFloat(amount),
      chargeDate: chargeDate || new Date().toISOString().split('T')[0],
      billingType: 'manual',
      planId: subResult.rows[0]?.plan_id,
      description: description || 'חיוב ידני',
    });
    
    // Log admin action
    await pool.query(`
      INSERT INTO admin_audit_log (admin_id, action, entity_type, entity_id, details)
      VALUES ($1, 'schedule_manual_charge', 'billing_queue', $2, $3)
    `, [adminId, charge.id, JSON.stringify({ userId, amount, description })]);
    
    res.json({ success: true, charge });
  } catch (error) {
    console.error('[AdminBilling] Schedule manual charge error:', error);
    res.status(500).json({ error: 'שגיאה בתזמון חיוב' });
  }
}

/**
 * Get a single charge details
 */
async function getChargeDetails(req, res) {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT bq.*, 
             u.email, u.name as display_name,
             sp.name as plan_name, sp.name_he as plan_name_he
      FROM billing_queue bq
      JOIN users u ON u.id = bq.user_id
      LEFT JOIN subscription_plans sp ON sp.id = bq.plan_id
      WHERE bq.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'חיוב לא נמצא' });
    }
    
    res.json({ charge: result.rows[0] });
  } catch (error) {
    console.error('[AdminBilling] Get charge details error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת פרטי חיוב' });
  }
}

/**
 * Process billing queue manually (trigger cron job)
 */
async function processBillingQueue(req, res) {
  try {
    const adminId = req.user.id;
    console.log(`[AdminBilling] Admin ${adminId} triggering manual billing queue processing`);
    
    const queueResult = await billingQueueService.processQueue();
    const retryResult = await billingQueueService.retryFailedCharges();
    
    // Log admin action
    await pool.query(`
      INSERT INTO admin_audit_log (admin_id, action, entity_type, entity_id, details)
      VALUES ($1, 'process_billing_queue', 'billing_queue', NULL, $2)
    `, [adminId, JSON.stringify({ queueResult, retryResult })]);
    
    res.json({ 
      success: true, 
      queueResult, 
      retryResult 
    });
  } catch (error) {
    console.error('[AdminBilling] Process billing queue error:', error);
    res.status(500).json({ error: 'שגיאה בעיבוד תור החיובים' });
  }
}

/**
 * Skip the next charge - push charge_date forward by 1 month
 */
async function skipCharge(req, res) {
  try {
    const { id } = req.params;
    const adminId = req.user.id;

    const result = await pool.query(`
      UPDATE billing_queue
      SET charge_date = charge_date + INTERVAL '1 month',
          updated_at = NOW()
      WHERE id = $1 AND status = 'pending'
      RETURNING *
    `, [id]);

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'חיוב לא נמצא או לא ממתין' });
    }

    await pool.query(`
      INSERT INTO admin_audit_log (admin_id, action, entity_type, entity_id, details)
      VALUES ($1, 'skip_charge', 'billing_queue', $2, $3)
    `, [adminId, id, JSON.stringify({ newDate: result.rows[0].charge_date })]);

    res.json({ success: true, charge: result.rows[0] });
  } catch (error) {
    console.error('[AdminBilling] Skip charge error:', error);
    res.status(500).json({ error: 'שגיאה בדילוג על החיוב' });
  }
}

/**
 * Update charge amount - for this charge and optionally future ones
 * applyToNext: 0 = only this, N = next N charges, -1 = all future
 */
async function updateChargeAmount(req, res) {
  try {
    const { id } = req.params;
    const { amount, applyToNext = 0 } = req.body;
    const adminId = req.user.id;

    if (!amount || parseFloat(amount) < 0) {
      return res.status(400).json({ error: 'סכום לא תקין' });
    }

    const chargeResult = await pool.query(
      `SELECT * FROM billing_queue WHERE id = $1`,
      [id]
    );
    const charge = chargeResult.rows[0];
    if (!charge) {
      return res.status(404).json({ error: 'חיוב לא נמצא' });
    }

    const newAmount = parseFloat(amount);

    // Update this charge
    await pool.query(
      `UPDATE billing_queue SET amount = $1, updated_at = NOW() WHERE id = $2`,
      [newAmount, id]
    );

    let updatedCount = 1;

    // Apply to future pending charges for this user
    if (applyToNext !== 0) {
      const limitClause = applyToNext === -1 ? '' : `LIMIT ${parseInt(applyToNext)}`;
      const futureResult = await pool.query(`
        UPDATE billing_queue SET amount = $1, updated_at = NOW()
        WHERE id IN (
          SELECT id FROM billing_queue
          WHERE user_id = $2 AND status = 'pending' AND id != $3
          ORDER BY charge_date ASC
          ${limitClause}
        )
        RETURNING id
      `, [newAmount, charge.user_id, id]);
      updatedCount += futureResult.rowCount;
    }

    await pool.query(`
      INSERT INTO admin_audit_log (admin_id, action, entity_type, entity_id, details)
      VALUES ($1, 'update_charge_amount', 'billing_queue', $2, $3)
    `, [adminId, id, JSON.stringify({ newAmount, applyToNext, updatedCount })]);

    res.json({ success: true, updatedCount });
  } catch (error) {
    console.error('[AdminBilling] Update charge amount error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון סכום' });
  }
}

/**
 * Get payment history for a specific user (for the actions modal)
 */
async function getUserPaymentHistory(req, res) {
  try {
    const { userId } = req.params;

    const result = await pool.query(`
      SELECT id, amount, status, created_at,
             sumit_transaction_id, description, error_message,
             failure_code, receipt_url, billing_type, plan_name_he
      FROM (
        SELECT ph.id, ph.amount, ph.status, ph.created_at,
               ph.sumit_transaction_id, ph.description, ph.error_message,
               ph.failure_code, ph.receipt_url, ph.billing_type,
               sp.name_he as plan_name_he
        FROM payment_history ph
        LEFT JOIN user_subscriptions us ON us.id = ph.subscription_id
        LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
        WHERE ph.user_id = $1

        UNION ALL

        SELECT sph.id, sph.amount, sph.status, sph.created_at,
               sph.sumit_transaction_id, sph.description, sph.error_message,
               NULL as failure_code, sph.receipt_url,
               COALESCE(sph.payment_type, 'status_bot') as billing_type,
               s.name_he as plan_name_he
        FROM service_payment_history sph
        JOIN additional_services s ON s.id = sph.service_id
        WHERE sph.user_id = $1
      ) combined
      ORDER BY created_at DESC
      LIMIT 30
    `, [userId]);

    res.json({ payments: result.rows });
  } catch (error) {
    console.error('[AdminBilling] Get user payment history error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת היסטוריה' });
  }
}

/**
 * Cancel a user's subscription - downgrade to free plan immediately (admin action)
 */
async function cancelSubscription(req, res) {
  try {
    const { userId } = req.params;
    const adminId = req.user.id;
    const { reason = '' } = req.body;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get free plan
      const freePlanResult = await client.query(
        `SELECT id, max_bots FROM subscription_plans WHERE price = 0 AND is_active = true ORDER BY max_bots DESC LIMIT 1`
      );
      if (!freePlanResult.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'לא נמצאה תוכנית חינמית במערכת' });
      }
      const freePlan = freePlanResult.rows[0];

      // Downgrade subscription
      const subResult = await client.query(
        `UPDATE user_subscriptions
         SET plan_id = $1,
             status = 'cancelled',
             is_manual = false,
             expires_at = NULL,
             next_charge_date = NULL,
             admin_notes = COALESCE(admin_notes, '') || E'\n[' || NOW()::text || '] בוטל ידנית על ידי אדמין. סיבה: ' || $3,
             updated_at = NOW()
         WHERE user_id = $2
         RETURNING id`,
        [freePlan.id, userId, reason || 'לא צוינה סיבה']
      );

      if (!subResult.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'לא נמצא מנוי למשתמש זה' });
      }

      // Cancel all pending billing queue entries
      await client.query(
        `UPDATE billing_queue SET status = 'cancelled', updated_at = NOW()
         WHERE user_id = $1 AND status IN ('pending', 'failed')`,
        [userId]
      );

      // Lock bots exceeding free plan limit
      const freeBotLimit = freePlan.max_bots || 1;
      if (freeBotLimit > 0 && freeBotLimit !== -1) {
        const botsToKeep = await client.query(
          `SELECT id FROM bots WHERE user_id = $1 AND pending_deletion = false
           ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST LIMIT $2`,
          [userId, freeBotLimit]
        );
        const keepIds = botsToKeep.rows.map(b => b.id);
        if (keepIds.length > 0) {
          await client.query(
            `UPDATE bots SET is_active = false, locked_reason = 'subscription_cancelled', locked_at = NOW(), updated_at = NOW()
             WHERE user_id = $1 AND id != ALL($2::uuid[])`,
            [userId, keepIds]
          );
          await client.query(
            `UPDATE bots SET locked_reason = NULL, locked_at = NULL, updated_at = NOW()
             WHERE id = ANY($1::uuid[])`,
            [keepIds]
          );
        } else {
          await client.query(
            `UPDATE bots SET is_active = false, locked_reason = 'subscription_cancelled', locked_at = NOW(), updated_at = NOW()
             WHERE user_id = $1`,
            [userId]
          );
        }
      } else if (freeBotLimit === 0) {
        await client.query(
          `UPDATE bots SET is_active = false, locked_reason = 'subscription_cancelled', locked_at = NOW(), updated_at = NOW()
           WHERE user_id = $1`,
          [userId]
        );
      }

      // Create in-app notification for user
      await client.query(
        `INSERT INTO notifications (user_id, notification_type, title, message, metadata)
         VALUES ($1, 'subscription_cancelled', 'המנוי שלך בוטל', 'המנוי שלך בוטל על ידי מנהל המערכת. החשבון עבר לתוכנית החינמית.', $2)`,
        [userId, JSON.stringify({ reason, cancelled_by: adminId })]
      );

      await client.query('COMMIT');

      await pool.query(
        `INSERT INTO admin_audit_log (admin_id, action, entity_type, entity_id, details)
         VALUES ($1, 'cancel_subscription', 'user_subscriptions', $2, $3)`,
        [adminId, subResult.rows[0].id, JSON.stringify({ userId, reason })]
      );

      console.log(`[AdminBilling] Admin ${adminId} cancelled subscription for user ${userId}`);
      res.json({ success: true });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[AdminBilling] Cancel subscription error:', error);
    res.status(500).json({ error: 'שגיאה בביטול המנוי' });
  }
}

/**
 * Void a payment record - marks it as voided without affecting Sumit
 */
async function voidPayment(req, res) {
  try {
    const { id } = req.params;
    const adminId = req.user.id;

    // Check in payment_history first
    let result = await pool.query(
      `UPDATE payment_history SET status = 'voided' WHERE id = $1 AND status != 'voided' RETURNING *`,
      [id]
    );

    // If not found there, try service_payment_history
    if (result.rows.length === 0) {
      result = await pool.query(
        `UPDATE service_payment_history SET status = 'voided' WHERE id = $1 AND status != 'voided' RETURNING *`,
        [id]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'תשלום לא נמצא או כבר מבוטל' });
    }

    await pool.query(
      `INSERT INTO admin_audit_log (admin_id, action, entity_type, entity_id, details) VALUES ($1, 'void_payment', 'payment_history', $2, $3)`,
      [adminId, id, JSON.stringify({ payment: result.rows[0] })]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('[AdminBilling] Void payment error:', error);
    res.status(500).json({ error: 'שגיאה בביטול התשלום' });
  }
}

module.exports = {
  getUpcomingCharges,
  getFailedCharges,
  getPaymentHistory,
  getBillingStats,
  chargeNow,
  cancelCharge,
  retryCharge,
  skipCharge,
  updateChargeAmount,
  getUserPaymentHistory,
  scheduleManualCharge,
  getChargeDetails,
  processBillingQueue,
  cancelSubscription,
  voidPayment
};
