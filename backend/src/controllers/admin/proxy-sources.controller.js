const proxyService = require('../../services/proxy/proxy.service');
const db = require('../../config/database');

async function list(req, res) {
  try {
    const sources = await proxyService.listSources();
    // Also fetch live proxy list from active source
    const proxies = await proxyService.listAllProxies();
    res.json({ sources, proxies });
  } catch (e) {
    console.error('[ProxySources] list error:', e);
    res.status(500).json({ error: 'שגיאה בטעינת מקורות פרוקסי' });
  }
}

async function create(req, res) {
  try {
    const baseUrl = (req.body.baseUrl || req.body.base_url || '').trim();
    const apiKey = (req.body.apiKey || req.body.api_key || '').trim();
    const name = (req.body.name || baseUrl).trim();

    if (!baseUrl || !apiKey) {
      return res.status(400).json({ error: 'כתובת ו-API key הם שדות חובה' });
    }
    const source = await proxyService.createSource({ name, baseUrl, apiKey, createdBy: req.user?.id });
    res.json({ success: true, source });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'כתובת זו כבר קיימת במערכת' });
    console.error('[ProxySources] create error:', e);
    res.status(500).json({ error: 'שגיאה ביצירת מקור פרוקסי' });
  }
}

async function update(req, res) {
  try {
    const { id } = req.params;
    const baseUrl = (req.body.baseUrl || req.body.base_url || '').trim() || undefined;
    const apiKey = (req.body.apiKey || req.body.api_key || '').trim() || undefined;
    const name = req.body.name;
    const isActive = req.body.isActive !== undefined ? req.body.isActive : req.body.is_active;

    const source = await proxyService.updateSource(id, { name, baseUrl, apiKey, isActive });
    if (!source) return res.status(404).json({ error: 'מקור לא נמצא' });
    res.json({ success: true, source });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'כתובת זו כבר קיימת במערכת' });
    console.error('[ProxySources] update error:', e);
    res.status(500).json({ error: 'שגיאה בעדכון מקור פרוקסי' });
  }
}

async function deactivate(req, res) {
  try {
    const { id } = req.params;
    const source = await proxyService.deactivateSource(id);
    if (!source) return res.status(404).json({ error: 'מקור לא נמצא' });
    res.json({ success: true, source });
  } catch (e) {
    console.error('[ProxySources] deactivate error:', e);
    res.status(500).json({ error: 'שגיאה בנטרול מקור פרוקסי' });
  }
}

/**
 * List all status bot connections with their proxy assignment status.
 */
async function listConnections(req, res) {
  try {
    const result = await db.query(`
      SELECT
        sbc.id,
        sbc.phone_number,
        sbc.display_name,
        sbc.connection_status,
        sbc.proxy_ip,
        sbc.updated_at,
        u.id   AS user_id,
        u.name AS user_name,
        u.email AS user_email
      FROM status_bot_connections sbc
      JOIN users u ON u.id = sbc.user_id
      ORDER BY sbc.connection_status ASC, sbc.updated_at DESC
    `);
    res.json({ connections: result.rows });
  } catch (e) {
    console.error('[ProxySources] listConnections error:', e);
    res.status(500).json({ error: 'שגיאה בטעינת חיבורים' });
  }
}

/**
 * Bulk-assign proxies to all connected status bot users who don't have one yet.
 */
async function syncExisting(req, res) {
  try {
    const result = await db.query(`
      SELECT id, phone_number
      FROM status_bot_connections
      WHERE connection_status = 'connected'
        AND phone_number IS NOT NULL
        AND (proxy_ip IS NULL OR proxy_ip = '')
    `);

    const connections = result.rows;
    if (connections.length === 0) {
      return res.json({ success: true, assigned: 0, message: 'כל המשתמשים המחוברים כבר משויכים לפרוקסי' });
    }

    let assigned = 0;
    let failed = 0;

    for (const conn of connections) {
      try {
        const proxyIp = await proxyService.assignProxy(conn.phone_number);
        if (proxyIp) {
          await db.query(`UPDATE status_bot_connections SET proxy_ip = $1 WHERE id = $2`, [proxyIp, conn.id]);
          assigned++;
        } else {
          failed++;
        }
      } catch (err) {
        console.error(`[ProxySources] sync failed for ${conn.phone_number}:`, err.message);
        failed++;
      }
    }

    res.json({
      success: true,
      total: connections.length,
      assigned,
      failed,
      message: `שויכו ${assigned} מתוך ${connections.length} משתמשים`,
    });
  } catch (e) {
    console.error('[ProxySources] syncExisting error:', e);
    res.status(500).json({ error: 'שגיאה בסנכרון' });
  }
}

module.exports = { list, create, update, deactivate, syncExisting, listConnections };
