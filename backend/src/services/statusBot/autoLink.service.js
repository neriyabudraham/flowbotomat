/**
 * Auto-link the status bot to the user's existing main WhatsApp session.
 *
 * Triggered in two scenarios:
 *   1. Webhook reports main WA session became 'connected' and the user
 *      already has an active status-bot subscription.
 *   2. User just purchased a status-bot subscription and their main WA
 *      session is already connected.
 *
 * Idempotent: if status_bot_connections already exists and is already
 * connected to the same session, it's a no-op. Won't cause duplicate
 * WAHA webhook registrations (WAHA de-dupes by URL on add).
 *
 * Returns the status_bot_connections row on success, or null on skip/error.
 */

const db = require('../../config/database');
const wahaSession = require('../waha/session.service');
const { getWahaCredentialsForConnection } = require('../settings/system.service');
const { assignProxy } = require('../proxy/proxy.service');

const WEBHOOK_EVENTS = [
  'message', 'message.ack', 'session.status', 'call.received', 'call.accepted', 'call.rejected',
  'label.upsert', 'label.deleted', 'label.chat.added', 'label.chat.deleted',
  'poll.vote.failed', 'poll.vote', 'group.leave', 'group.join', 'group.v2.participants',
  'group.v2.update', 'group.v2.leave', 'group.v2.join', 'presence.update', 'message.reaction',
  'message.any', 'message.ack.group', 'message.waiting', 'message.revoked', 'message.edited',
  'chat.archive', 'event.response', 'event.response.failed',
];

/**
 * Check whether the user has an active status-bot subscription (active | trial).
 */
async function userHasStatusBotAccess(userId) {
  try {
    const r = await db.query(`
      SELECT 1
      FROM user_service_subscriptions uss
      JOIN additional_services asvc ON asvc.id = uss.service_id
      WHERE uss.user_id = $1
        AND asvc.slug = 'status-bot'
        AND uss.status IN ('active', 'trial')
      LIMIT 1
    `, [userId]);
    return r.rows.length > 0;
  } catch {
    return false;
  }
}

/**
 * Perform the link. Returns { linked: bool, connection?, reason? }.
 *
 * options.force=true   — link even without an active subscription (for admin ops)
 * options.source       — free-form label for logging ('webhook_connect' | 'post_purchase' | 'manual')
 */
async function autoLinkStatusBotToMain(userId, options = {}) {
  const source = options.source || 'auto';
  const force = options.force === true;

  try {
    // 0. Verify license unless forced
    if (!force) {
      const hasAccess = await userHasStatusBotAccess(userId);
      if (!hasAccess) return { linked: false, reason: 'no_status_bot_subscription' };
    }

    // 1. Must have a connected main WA session to reuse
    const mainConnResult = await db.query(
      "SELECT * FROM whatsapp_connections WHERE user_id = $1 AND status = 'connected' LIMIT 1",
      [userId]
    );
    if (mainConnResult.rows.length === 0) {
      return { linked: false, reason: 'no_connected_main_wa' };
    }
    const mainConn = mainConnResult.rows[0];

    // 2. Check if status_bot_connections already exists & is already connected to same session
    const existing = await db.query(
      'SELECT * FROM status_bot_connections WHERE user_id = $1',
      [userId]
    );
    if (
      existing.rows.length > 0 &&
      existing.rows[0].connection_status === 'connected' &&
      existing.rows[0].session_name === mainConn.session_name
    ) {
      return { linked: false, reason: 'already_linked', connection: existing.rows[0] };
    }

    // 3. Add webhook on the shared WAHA session (safe — WAHA de-dupes by URL)
    const { baseUrl, apiKey } = await getWahaCredentialsForConnection(mainConn);
    const webhookUrl = `${process.env.APP_URL}/api/webhook/waha/${userId}`;
    try {
      await wahaSession.addWebhook(baseUrl, apiKey, mainConn.session_name, webhookUrl, WEBHOOK_EVENTS);
    } catch (err) {
      console.warn(`[StatusBot AutoLink] Webhook setup warning (non-fatal) for user ${userId}: ${err.message}`);
    }

    // 4. Assign proxy (if the session has a phone number and no proxy yet)
    let proxyIp = existing.rows[0]?.proxy_ip || null;
    if (mainConn.phone_number && !proxyIp) {
      try {
        proxyIp = await assignProxy(mainConn.phone_number, {
          baseUrl, apiKey, sessionName: mainConn.session_name,
        });
      } catch (err) {
        console.warn(`[StatusBot AutoLink] Proxy assignment warning for user ${userId}: ${err.message}`);
      }
    }

    // 5. Compute restriction — main-bot-coupled connections get the shorter one
    const restrictionMinsResult = await db.query(
      `SELECT value FROM system_settings WHERE key = 'statusbot_restriction_with_main_bot_minutes'`
    ).catch(() => ({ rows: [] }));
    const restrictionMins = restrictionMinsResult.rows.length > 0
      ? parseFloat(JSON.parse(restrictionMinsResult.rows[0].value)) || 30
      : 30;
    const newRestrictionUntil = new Date(Date.now() + restrictionMins * 60_000);

    // 6. Upsert status_bot_connections
    let result;
    if (existing.rows.length > 0) {
      result = await db.query(`
        UPDATE status_bot_connections
        SET session_name = $2,
            connection_status = 'connected',
            phone_number = COALESCE($3, phone_number),
            display_name = COALESCE($4, display_name),
            proxy_ip = COALESCE($5, proxy_ip),
            waha_source_id = $6,
            first_connected_at = COALESCE(first_connected_at, NOW()),
            last_connected_at = NOW(),
            restriction_until = GREATEST(COALESCE(restriction_until, NOW() - interval '1 second'), $7),
            updated_at = NOW()
        WHERE user_id = $1
        RETURNING *
      `, [userId, mainConn.session_name, mainConn.phone_number, mainConn.display_name,
          proxyIp, mainConn.waha_source_id, newRestrictionUntil]);
    } else {
      result = await db.query(`
        INSERT INTO status_bot_connections
        (user_id, session_name, connection_status, phone_number, display_name, proxy_ip, first_connected_at, last_connected_at, waha_source_id, restriction_until)
        VALUES ($1, $2, 'connected', $3, $4, $5, NOW(), NOW(), $6, $7)
        RETURNING *
      `, [userId, mainConn.session_name, mainConn.phone_number, mainConn.display_name,
          proxyIp, mainConn.waha_source_id, newRestrictionUntil]);
    }

    console.log(`[StatusBot AutoLink] ✅ Linked user ${userId} via ${source} (session=${mainConn.session_name})`);
    return { linked: true, connection: result.rows[0], reason: 'linked' };
  } catch (err) {
    console.error(`[StatusBot AutoLink] Error for user ${userId} (${source}):`, err.message);
    return { linked: false, reason: 'error', error: err.message };
  }
}

module.exports = {
  autoLinkStatusBotToMain,
  userHasStatusBotAccess,
};
