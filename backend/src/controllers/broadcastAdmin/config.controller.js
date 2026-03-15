const db = require('../../config/database');
const broadcastAdminService = require('../../services/broadcastAdmin/approval.service');

/**
 * Get broadcast admin config for the current user
 */
async function getAdminConfig(req, res) {
  try {
    const userId = req.user.id;
    await broadcastAdminService.ensureAdminTables();

    const config = await broadcastAdminService.getAdminConfig(userId);
    res.json({ config: config || null });
  } catch (error) {
    console.error('[BroadcastAdmin] Get config error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת הגדרות מנהל' });
  }
}

/**
 * Set or update broadcast admin config for the current user
 * Only one admin per account is allowed
 */
async function setAdminConfig(req, res) {
  try {
    const userId = req.user.id;
    const { admin_phone, admin_name, require_approval, delete_delay_seconds, notify_sender_on_pending } = req.body;

    if (!admin_phone) {
      return res.status(400).json({ error: 'מספר טלפון המנהל נדרש' });
    }

    // Normalize phone
    const normalizedPhone = admin_phone.replace(/\D/g, '').replace(/^0+/, '');
    if (normalizedPhone.length < 9) {
      return res.status(400).json({ error: 'מספר טלפון לא תקין' });
    }

    await broadcastAdminService.ensureAdminTables();

    const result = await db.query(`
      INSERT INTO broadcast_admin_config (user_id, admin_phone, admin_name, require_approval, delete_delay_seconds, notify_sender_on_pending)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (user_id) DO UPDATE SET
        admin_phone = EXCLUDED.admin_phone,
        admin_name = EXCLUDED.admin_name,
        require_approval = EXCLUDED.require_approval,
        delete_delay_seconds = EXCLUDED.delete_delay_seconds,
        notify_sender_on_pending = EXCLUDED.notify_sender_on_pending,
        updated_at = NOW()
      RETURNING *
    `, [
      userId,
      normalizedPhone,
      admin_name || null,
      require_approval !== false,
      delete_delay_seconds || 2,
      notify_sender_on_pending !== false,
    ]);

    res.json({ config: result.rows[0] });
  } catch (error) {
    console.error('[BroadcastAdmin] Set config error:', error);
    res.status(500).json({ error: 'שגיאה בשמירת הגדרות מנהל' });
  }
}

/**
 * Delete broadcast admin config (remove admin)
 */
async function deleteAdminConfig(req, res) {
  try {
    const userId = req.user.id;
    await broadcastAdminService.ensureAdminTables();

    await db.query(
      'DELETE FROM broadcast_admin_config WHERE user_id = $1',
      [userId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('[BroadcastAdmin] Delete config error:', error);
    res.status(500).json({ error: 'שגיאה במחיקת הגדרות מנהל' });
  }
}

/**
 * Get pending approval requests for the current user
 */
async function getPendingApprovals(req, res) {
  try {
    const userId = req.user.id;
    await broadcastAdminService.ensureAdminTables();

    const result = await db.query(`
      SELECT baa.*, fj.message_type, fj.message_text, fj.total_targets, fj.forward_name
      FROM broadcast_admin_approvals baa
      JOIN forward_jobs fj ON fj.id = baa.job_id
      WHERE baa.user_id = $1 AND baa.status = 'pending'
      ORDER BY baa.created_at DESC
    `, [userId]);

    res.json({ approvals: result.rows });
  } catch (error) {
    console.error('[BroadcastAdmin] Get pending approvals error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת בקשות אישור' });
  }
}

module.exports = {
  getAdminConfig,
  setAdminConfig,
  deleteAdminConfig,
  getPendingApprovals
};
