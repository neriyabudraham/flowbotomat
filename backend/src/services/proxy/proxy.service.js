const db = require('../../config/database');
const { encrypt, decrypt } = require('../crypto/encrypt.service');
const axios = require('axios');
const wahaSession = require('../waha/session.service');

async function getActiveSource() {
  const result = await db.query(
    'SELECT * FROM proxy_sources WHERE is_active = true ORDER BY created_at ASC LIMIT 1'
  );
  if (result.rows.length === 0) return null;
  const src = result.rows[0];
  return {
    id: src.id,
    baseUrl: src.base_url,
    apiKey: decrypt(src.api_key_enc),
    proxyUsername: src.proxy_username || null,
    proxyPassword: src.proxy_password_enc ? decrypt(src.proxy_password_enc) : null,
  };
}

/**
 * Assign a proxy to a phone number via the proxy service API.
 * Optionally updates the WAHA session config with the proxy.
 *
 * @param {string} phoneNumber
 * @param {{ baseUrl, apiKey, sessionName }} [wahaOpts] - If provided, updates WAHA session
 * @returns {string|null} proxyServer (ip:port) or null on failure
 */
async function assignProxy(phoneNumber, wahaOpts) {
  if (!phoneNumber) return null;
  const source = await getActiveSource();
  if (!source) {
    console.warn('[Proxy] No active proxy source configured — skipping proxy assignment');
    return null;
  }
  try {
    const resp = await axios.post(
      `${source.baseUrl}/api/v1/phone/assign`,
      { phone: phoneNumber },
      { headers: { 'x-api-key': source.apiKey }, timeout: 10000 }
    );
    const data = resp.data;
    // Build server string (ip:port)
    const proxyServer = data?.proxy ||
      (data?.ip && data?.port ? `${data.ip}:${data.port}` : data?.ip || null);

    if (!proxyServer) {
      console.error('[Proxy] assignProxy: no server returned from API', data);
      return null;
    }
    console.log(`[Proxy] ✅ Assigned proxy ${proxyServer} to phone ${phoneNumber}`);

    // Update WAHA session if credentials were provided
    if (wahaOpts?.baseUrl && wahaOpts?.apiKey && wahaOpts?.sessionName) {
      try {
        await wahaSession.updateSessionProxy(wahaOpts.baseUrl, wahaOpts.apiKey, wahaOpts.sessionName, {
          server: proxyServer,
          ...(source.proxyUsername ? { username: source.proxyUsername } : {}),
          ...(source.proxyPassword ? { password: source.proxyPassword } : {}),
        });
        console.log(`[Proxy] ✅ Updated WAHA session ${wahaOpts.sessionName} with proxy ${proxyServer}`);
      } catch (wahaErr) {
        console.error('[Proxy] updateSessionProxy error:', wahaErr.message);
      }
    }

    return proxyServer;
  } catch (err) {
    console.error('[Proxy] assignProxy error:', err.message);
    return null;
  }
}

/**
 * Remove proxy assignment for a phone number.
 * Optionally clears the proxy from the WAHA session config.
 *
 * @param {string} phoneNumber
 * @param {{ baseUrl, apiKey, sessionName }} [wahaOpts]
 */
async function removeProxy(phoneNumber, wahaOpts) {
  if (!phoneNumber) return;
  const source = await getActiveSource();
  if (!source) return;

  try {
    await axios.post(
      `${source.baseUrl}/api/v1/phone/remove`,
      { phone: phoneNumber },
      { headers: { 'x-api-key': source.apiKey }, timeout: 10000 }
    );
    console.log(`[Proxy] ✅ Removed proxy for phone ${phoneNumber}`);
  } catch (err) {
    console.error('[Proxy] removeProxy error:', err.message);
  }

  // Remove proxy from WAHA session
  if (wahaOpts?.baseUrl && wahaOpts?.apiKey && wahaOpts?.sessionName) {
    try {
      await wahaSession.updateSessionProxy(wahaOpts.baseUrl, wahaOpts.apiKey, wahaOpts.sessionName, null);
      console.log(`[Proxy] ✅ Cleared proxy from WAHA session ${wahaOpts.sessionName}`);
    } catch (wahaErr) {
      console.error('[Proxy] clearSessionProxy error:', wahaErr.message);
    }
  }
}

/**
 * List all proxies from the active source (for admin display).
 * Response format: [{ id, ip, port, serverName, phones: [...] }]
 */
async function listAllProxies() {
  const source = await getActiveSource();
  if (!source) return [];
  try {
    const resp = await axios.get(
      `${source.baseUrl}/api/v1/proxies/all`,
      { headers: { 'x-api-key': source.apiKey }, timeout: 10000 }
    );
    return Array.isArray(resp.data) ? resp.data : (resp.data?.proxies || []);
  } catch (err) {
    console.error('[Proxy] listAllProxies error:', err.message);
    return [];
  }
}

/**
 * Build a map of phone → proxyServer (ip:port) from the proxy service.
 */
async function buildPhoneProxyMap() {
  const proxies = await listAllProxies();
  const map = {};
  for (const proxy of proxies) {
    const ip = proxy.ip || proxy.proxyIp;
    const port = proxy.port;
    const server = proxy.proxy || (ip && port ? `${ip}:${port}` : ip);
    if (server && Array.isArray(proxy.phones)) {
      for (const phone of proxy.phones) {
        if (phone && !map[phone]) map[phone] = server;
      }
    }
  }
  return map;
}

// ─── DB CRUD for proxy_sources ───────────────────────────────────────────────

async function listSources() {
  const result = await db.query(
    'SELECT id, name, base_url, proxy_username, is_active, created_at FROM proxy_sources ORDER BY created_at ASC'
  );
  return result.rows;
}

async function createSource({ name, baseUrl, apiKey, proxyUsername, proxyPassword, createdBy }) {
  const result = await db.query(`
    INSERT INTO proxy_sources (name, base_url, api_key_enc, proxy_username, proxy_password_enc, created_by)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, name, base_url, proxy_username, is_active, created_at
  `, [
    name || baseUrl,
    baseUrl,
    encrypt(apiKey),
    proxyUsername || null,
    proxyPassword ? encrypt(proxyPassword) : null,
    createdBy || null,
  ]);
  return result.rows[0];
}

async function updateSource(id, { name, baseUrl, apiKey, proxyUsername, proxyPassword, isActive }) {
  const fields = [];
  const values = [];
  let idx = 1;
  if (name !== undefined)                       { fields.push(`name = $${idx++}`);               values.push(name); }
  if (baseUrl !== undefined)                    { fields.push(`base_url = $${idx++}`);            values.push(baseUrl); }
  if (apiKey !== undefined && apiKey !== '')     { fields.push(`api_key_enc = $${idx++}`);         values.push(encrypt(apiKey)); }
  if (proxyUsername !== undefined)              { fields.push(`proxy_username = $${idx++}`);      values.push(proxyUsername || null); }
  if (proxyPassword !== undefined && proxyPassword !== '') { fields.push(`proxy_password_enc = $${idx++}`); values.push(encrypt(proxyPassword)); }
  if (isActive !== undefined)                   { fields.push(`is_active = $${idx++}`);           values.push(isActive); }
  fields.push(`updated_at = NOW()`);
  values.push(id);
  const result = await db.query(
    `UPDATE proxy_sources SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, name, base_url, proxy_username, is_active, updated_at`,
    values
  );
  return result.rows[0] || null;
}

async function deactivateSource(id) {
  const result = await db.query(
    `UPDATE proxy_sources SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id, name, base_url, is_active`,
    [id]
  );
  return result.rows[0] || null;
}

module.exports = {
  assignProxy,
  removeProxy,
  listAllProxies,
  buildPhoneProxyMap,
  listSources,
  createSource,
  updateSource,
  deactivateSource,
};
