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
    const { userId, status, startDate, endDate, limit = 100, offset = 0 } = req.query;
    
    const result = await billingQueueService.getPaymentHistory({
      userId,
      status,
      startDate,
      endDate,
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
             u.email, u.display_name, u.name,
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

module.exports = {
  getUpcomingCharges,
  getFailedCharges,
  getPaymentHistory,
  getBillingStats,
  chargeNow,
  cancelCharge,
  retryCharge,
  scheduleManualCharge,
  getChargeDetails,
  processBillingQueue
};
