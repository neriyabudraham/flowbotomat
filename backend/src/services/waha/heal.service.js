/**
 * WAHA Session Heal Service
 *
 * When a user's WhatsApp session has been migrated to a different WAHA server,
 * existing DB records still point to the old server. This module scans ALL
 * active WAHA servers to find the live session by user email, then updates
 * whatsapp_connections (and optionally status_bot_connections) with the
 * correct server.
 *
 * Returns { baseUrl, apiKey, sessionName } or null if session not found.
 */

const db = require('../../config/database');
const { decrypt } = require('../crypto/encrypt.service');
const wahaSession = require('./session.service');

/**
 * Find a user's live WAHA session by scanning all active servers.
 * Updates whatsapp_connections with the correct server if found.
 *
 * @param {string} userId - user ID
 * @returns {{ baseUrl, apiKey, sessionName } | null}
 */
async function healWahaConnectionByUserId(userId) {
  try {
    // Get user's email + current connection id
    const userRes = await db.query(
      `SELECT u.email, wc.id as wc_id
       FROM users u
       LEFT JOIN whatsapp_connections wc ON wc.user_id = u.id AND wc.status = 'connected'
       WHERE u.id = $1 LIMIT 1`,
      [userId]
    );

    if (!userRes.rows.length) {
      console.log(`[Heal] No user found for userId ${userId}`);
      return null;
    }

    const { email, wc_id } = userRes.rows[0];
    return await healWahaConnectionByEmail(email, wc_id);
  } catch (err) {
    console.error(`[Heal] healWahaConnectionByUserId error: ${err.message}`);
    return null;
  }
}

/**
 * Find a live WAHA session by email on any active server.
 * If wc_id is provided, also updates whatsapp_connections.
 *
 * @param {string} email
 * @param {string|null} wc_id - whatsapp_connections row id to update
 * @returns {{ baseUrl, apiKey, sessionName } | null}
 */
async function healWahaConnectionByEmail(email, wc_id = null) {
  try {
    const sourcesRes = await db.query(
      `SELECT id, base_url, api_key_enc FROM waha_sources WHERE is_active = true ORDER BY priority ASC, created_at ASC`
    );

    let foundSession = null, foundSourceId = null, foundBaseUrl = null, foundApiKey = null;

    for (const src of sourcesRes.rows) {
      let srcApiKey;
      try { srcApiKey = decrypt(src.api_key_enc); } catch { continue; }

      try {
        const session = await wahaSession.findSessionByEmail(src.base_url, srcApiKey, email);
        if (session) {
          foundSession = session;
          foundSourceId = src.id;
          foundBaseUrl = src.base_url;
          foundApiKey = srcApiKey;
          break;
        }
      } catch { /* server unreachable, try next */ }
    }

    if (!foundSession) {
      console.log(`[Heal] No live WAHA session found for ${email} on any server`);
      return null;
    }

    const sessionName = foundSession.name;
    console.log(`[Heal] ✅ Found live session for ${email}: ${sessionName} on source ${foundSourceId}`);

    // Update whatsapp_connections if we have the row id
    if (wc_id) {
      await db.query(
        `UPDATE whatsapp_connections SET session_name = $1, waha_source_id = $2, updated_at = NOW() WHERE id = $3`,
        [sessionName, foundSourceId, wc_id]
      );
      console.log(`[Heal] Updated whatsapp_connections ${wc_id}: ${sessionName} → source ${foundSourceId}`);
    }

    return { baseUrl: foundBaseUrl, apiKey: foundApiKey, sessionName };
  } catch (err) {
    console.error(`[Heal] healWahaConnectionByEmail error: ${err.message}`);
    return null;
  }
}

module.exports = { healWahaConnectionByUserId, healWahaConnectionByEmail };
