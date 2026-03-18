const db = require('../../config/database');
const { encrypt, decrypt } = require('../crypto/encrypt.service');

async function listSources() {
  const result = await db.query(`
    SELECT ws.id, ws.name, ws.base_url, ws.webhook_base_url, ws.is_active, ws.priority, ws.created_at, ws.updated_at,
      COUNT(wc.id) FILTER (WHERE wc.status NOT IN ('disconnected','failed')) AS session_count
    FROM waha_sources ws
    LEFT JOIN whatsapp_connections wc ON wc.waha_source_id = ws.id
    GROUP BY ws.id
    ORDER BY ws.priority ASC, ws.created_at ASC
  `);
  return result.rows;
}

async function getSourceById(id) {
  const result = await db.query(`SELECT * FROM waha_sources WHERE id = $1`, [id]);
  return result.rows[0] || null;
}

async function createSource({ name, baseUrl, apiKey, webhookBaseUrl, priority, createdBy }) {
  const result = await db.query(`
    INSERT INTO waha_sources (name, base_url, api_key_enc, webhook_base_url, priority, created_by)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, name, base_url, webhook_base_url, is_active, priority, created_at
  `, [name, baseUrl, encrypt(apiKey), webhookBaseUrl || null, priority ?? 0, createdBy || null]);
  return result.rows[0];
}

async function updateSource(id, { name, baseUrl, apiKey, webhookBaseUrl, isActive, priority }) {
  const fields = [];
  const values = [];
  let idx = 1;
  if (name !== undefined)           { fields.push(`name = $${idx++}`);            values.push(name); }
  if (baseUrl !== undefined)        { fields.push(`base_url = $${idx++}`);         values.push(baseUrl); }
  if (apiKey !== undefined && apiKey !== '') { fields.push(`api_key_enc = $${idx++}`); values.push(encrypt(apiKey)); }
  if (webhookBaseUrl !== undefined) { fields.push(`webhook_base_url = $${idx++}`); values.push(webhookBaseUrl || null); }
  if (isActive !== undefined)       { fields.push(`is_active = $${idx++}`);        values.push(isActive); }
  if (priority !== undefined)       { fields.push(`priority = $${idx++}`);         values.push(priority); }
  fields.push(`updated_at = NOW()`);
  values.push(id);
  const result = await db.query(
    `UPDATE waha_sources SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, name, base_url, webhook_base_url, is_active, priority, updated_at`,
    values
  );
  return result.rows[0] || null;
}

async function deactivateSource(id) {
  const result = await db.query(
    `UPDATE waha_sources SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id, name, base_url, is_active`,
    [id]
  );
  return result.rows[0] || null;
}

async function getSessionCountForSource(sourceId) {
  const r = await db.query(
    `SELECT COUNT(*) FROM whatsapp_connections WHERE waha_source_id = $1`,
    [sourceId]
  );
  return parseInt(r.rows[0].count) || 0;
}

/**
 * Pick the active WAHA source with the fewest active sessions (load balancing)
 */
async function pickSourceForNewSession() {
  const result = await db.query(`
    SELECT ws.id, ws.base_url, ws.api_key_enc, ws.webhook_base_url,
      COUNT(wc.id) FILTER (WHERE wc.status NOT IN ('disconnected','failed')) AS session_count
    FROM waha_sources ws
    LEFT JOIN whatsapp_connections wc ON wc.waha_source_id = ws.id
    WHERE ws.is_active = true
    GROUP BY ws.id
    ORDER BY session_count ASC, ws.priority ASC, ws.created_at ASC
    LIMIT 1
  `);
  if (result.rows.length === 0) return null;
  const src = result.rows[0];
  return { id: src.id, baseUrl: src.base_url, apiKey: decrypt(src.api_key_enc), webhookBaseUrl: src.webhook_base_url };
}

async function getCredentialsForSource(sourceId) {
  const result = await db.query(`SELECT * FROM waha_sources WHERE id = $1`, [sourceId]);
  if (result.rows.length === 0) return null;
  const src = result.rows[0];
  return { baseUrl: src.base_url, apiKey: decrypt(src.api_key_enc), webhookBaseUrl: src.webhook_base_url };
}

module.exports = {
  listSources,
  getSourceById,
  createSource,
  updateSource,
  deactivateSource,
  getSessionCountForSource,
  pickSourceForNewSession,
  getCredentialsForSource,
};
