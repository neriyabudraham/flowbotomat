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
 * Sync proxy_ip from the proxy API into our DB.
 * Reads /api/v1/proxies/all, builds phone→ip map, updates matching connections.
 */
async function syncFromProxyAPI(req, res) {
  try {
    const phoneMap = await proxyService.buildPhoneProxyMap();
    const phones = Object.keys(phoneMap);
    if (phones.length === 0) {
      return res.json({ success: true, updated: 0, message: 'לא נמצאו שיוכים ב-API הפרוקסי' });
    }

    let updated = 0;
    for (const [phone, ip] of Object.entries(phoneMap)) {
      const r = await db.query(
        `UPDATE status_bot_connections SET proxy_ip = $1 WHERE phone_number = $2 AND (proxy_ip IS NULL OR proxy_ip != $1) RETURNING id`,
        [ip, phone]
      );
      updated += r.rowCount;
    }

    res.json({ success: true, updated, phones: phones.length, message: `עודכנו ${updated} חיבורים מה-API (${phones.length} טלפונים ב-API)` });
  } catch (e) {
    console.error('[ProxySources] syncFromProxyAPI error:', e);
    res.status(500).json({ error: 'שגיאה בסנכרון מה-API' });
  }
}

/**
 * Manually assign (or re-assign) proxy to a specific connection.
 */
async function assignConnection(req, res) {
  try {
    const { id } = req.params;
    const connResult = await db.query(
      'SELECT id, phone_number FROM status_bot_connections WHERE id = $1',
      [id]
    );
    if (connResult.rows.length === 0) return res.status(404).json({ error: 'חיבור לא נמצא' });
    const conn = connResult.rows[0];
    if (!conn.phone_number) return res.status(400).json({ error: 'אין מספר טלפון לחיבור זה' });

    const proxyIp = await proxyService.assignProxy(conn.phone_number);
    if (!proxyIp) return res.status(502).json({ error: 'שירות הפרוקסי לא הצליח לשייך' });

    await db.query(`UPDATE status_bot_connections SET proxy_ip = $1 WHERE id = $2`, [proxyIp, id]);
    res.json({ success: true, proxyIp });
  } catch (e) {
    console.error('[ProxySources] assignConnection error:', e);
    res.status(500).json({ error: 'שגיאה בשיוך' });
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

module.exports = { list, create, update, deactivate, syncExisting, syncFromProxyAPI, assignConnection, listConnections };
