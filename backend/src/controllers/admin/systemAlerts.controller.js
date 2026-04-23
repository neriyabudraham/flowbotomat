const pool = require('../../config/database');
const watchdog = require('../../services/statusBot/healthWatchdog.service');

// ─────────────────────────────────────────────────────────────────────
// Admin API for system alerts (status bot delivery health surface).
// All endpoints require admin role (enforced at routing layer).
// ─────────────────────────────────────────────────────────────────────

async function listAlerts(req, res) {
  try {
    const status = ['open', 'resolved', 'all'].includes(req.query.status) ? req.query.status : 'open';
    const severity = req.query.severity || null;
    const limit = Math.min(500, parseInt(req.query.limit) || 100);

    const where = [];
    const params = [];
    let i = 1;
    if (status !== 'all') { where.push(`status = $${i++}`); params.push(status); }
    if (severity) { where.push(`severity = $${i++}`); params.push(severity); }

    const sql = `
      SELECT a.id, a.severity, a.alert_type, a.user_id, a.connection_id, a.queue_id,
             a.title, a.message, a.payload, a.status, a.auto_resolved, a.dedup_key,
             a.created_at, a.resolved_at,
             u.name AS user_name, u.email AS user_email,
             c.phone_number AS conn_phone
      FROM system_alerts a
      LEFT JOIN users u ON u.id = a.user_id
      LEFT JOIN status_bot_connections c ON c.id = a.connection_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY
        CASE a.severity WHEN 'high' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
        a.created_at DESC
      LIMIT $${i}
    `;
    params.push(limit);
    const r = await pool.query(sql, params);

    const counts = await pool.query(`
      SELECT severity, COUNT(*)::int AS n
      FROM system_alerts WHERE status = 'open'
      GROUP BY severity
    `);
    const summary = { open: 0, high: 0, warning: 0, info: 0 };
    for (const row of counts.rows) {
      summary[row.severity] = row.n;
      summary.open += row.n;
    }

    res.json({ alerts: r.rows, summary });
  } catch (err) {
    console.error('[SystemAlerts] listAlerts error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת התראות' });
  }
}

async function resolveAlert(req, res) {
  try {
    const { alertId } = req.params;
    const r = await pool.query(
      `UPDATE system_alerts SET status = 'resolved', resolved_at = NOW(), auto_resolved = false
       WHERE id = $1 RETURNING id`,
      [alertId]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'התראה לא נמצאה' });
    res.json({ success: true });
  } catch (err) {
    console.error('[SystemAlerts] resolveAlert error:', err);
    res.status(500).json({ error: 'שגיאה' });
  }
}

async function resolveAllOfType(req, res) {
  try {
    const { type } = req.body;
    if (!type) return res.status(400).json({ error: 'type נדרש' });
    const r = await pool.query(
      `UPDATE system_alerts SET status = 'resolved', resolved_at = NOW(), auto_resolved = false
       WHERE alert_type = $1 AND status = 'open' RETURNING id`,
      [type]
    );
    res.json({ success: true, resolved: r.rows.length });
  } catch (err) {
    console.error('[SystemAlerts] resolveAllOfType error:', err);
    res.status(500).json({ error: 'שגיאה' });
  }
}

async function getDeliveryHealth(req, res) {
  try {
    const userId = req.query.userId || null;
    const params = [];
    let where = `q.created_at > NOW() - INTERVAL '24 hours'`;
    if (userId) {
      where += ` AND c.user_id = $1`;
      params.push(userId);
    }

    const sql = `
      SELECT
        c.id AS connection_id, c.user_id, c.phone_number,
        u.name AS user_name, u.email AS user_email,
        COUNT(*)::int AS total_jobs,
        COUNT(*) FILTER (WHERE q.queue_status = 'sent')::int AS sent_jobs,
        COUNT(*) FILTER (WHERE q.queue_status = 'failed')::int AS failed_jobs,
        COUNT(*) FILTER (WHERE q.sent_timed_out = true)::int AS timeout_jobs,
        SUM(q.contacts_total)::int AS total_recipients,
        SUM(q.contacts_sent)::int AS sent_recipients,
        AVG(NULLIF((q.delivery_summary->>'lids_unresolvable')::numeric, 0))::int AS avg_lid_drop
      FROM status_bot_queue q
      JOIN status_bot_connections c ON c.id = q.connection_id
      LEFT JOIN users u ON u.id = c.user_id
      WHERE ${where}
      GROUP BY c.id, c.user_id, c.phone_number, u.name, u.email
      ORDER BY total_recipients DESC NULLS LAST
      LIMIT 100
    `;
    const r = await pool.query(sql, params);
    res.json({ health: r.rows });
  } catch (err) {
    console.error('[SystemAlerts] getDeliveryHealth error:', err);
    res.status(500).json({ error: 'שגיאה' });
  }
}

async function runWatchdogNow(req, res) {
  try {
    await watchdog.tick();
    res.json({ success: true });
  } catch (err) {
    console.error('[SystemAlerts] runWatchdogNow error:', err);
    res.status(500).json({ error: 'שגיאה בהרצת watchdog' });
  }
}

module.exports = {
  listAlerts,
  resolveAlert,
  resolveAllOfType,
  getDeliveryHealth,
  runWatchdogNow,
};
