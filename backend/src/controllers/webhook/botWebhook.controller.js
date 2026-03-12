const db = require('../../config/database');
const botEngine = require('../../services/botEngine.service');

/**
 * Public webhook endpoint for bot webhook triggers.
 * Supports both GET and POST.
 * URL: GET|POST /api/webhook/bot/:secret
 *
 * The caller can pass data via:
 *   - POST body (JSON)
 *   - Query string params (?name=John&phone=050...)
 *
 * One query param is special: `phone` (or `contact`) — used as the contact's
 * phone number so the bot knows who to send responses to.
 * If omitted, the bot runs in "webhook-only" mode with no outgoing messages.
 */
async function handleBotWebhook(req, res) {
  const { secret } = req.params;

  try {
    // Ensure column exists (lazy migration)
    await db.query(`ALTER TABLE bots ADD COLUMN IF NOT EXISTS webhook_secret VARCHAR(64)`).catch(() => {});

    // Find bot by secret
    const botResult = await db.query(
      `SELECT id, user_id, name, is_active, locked_reason FROM bots WHERE webhook_secret = $1`,
      [secret]
    );

    if (botResult.rows.length === 0) {
      return res.status(404).json({ error: 'webhook not found' });
    }

    const bot = botResult.rows[0];

    if (!bot.is_active || bot.locked_reason) {
      return res.status(403).json({ error: 'bot is inactive' });
    }

    // Merge query params + body into payload
    const payload = { ...req.query, ...(req.body || {}) };

    // Phone for the contact (required)
    const phone = payload.phone || payload.contact || payload.from;
    if (!phone) {
      return res.status(400).json({ error: 'missing phone parameter', hint: 'Pass ?phone=972501234567 or include "phone" in POST body' });
    }

    // Normalize phone — strip leading zeros, add 972 for Israeli numbers
    let normalizedPhone = String(phone).replace(/\D/g, '');
    if (normalizedPhone.startsWith('0') && normalizedPhone.length === 10) {
      normalizedPhone = '972' + normalizedPhone.substring(1);
    }
    normalizedPhone = normalizedPhone + '@c.us';

    console.log(`[BotWebhook] Triggered bot ${bot.id} (${bot.name}) for user ${bot.user_id}, phone=${normalizedPhone}`);

    // Process via bot engine's event system
    await botEngine.processEvent(bot.user_id, normalizedPhone, 'webhook', {
      payload,
      botId: bot.id,
    });

    res.json({ ok: true, bot: bot.name });
  } catch (error) {
    console.error('[BotWebhook] Error:', error.message);
    res.status(500).json({ error: 'internal error' });
  }
}

module.exports = { handleBotWebhook };
