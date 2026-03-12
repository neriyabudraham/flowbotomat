const db = require('../../config/database');
const botEngine = require('../../services/botEngine.service');

// Listening sessions: botId -> { payload: null | object, expiresAt: number }
const listeningSessions = new Map();

function startListening(botId, timeoutMs = 60000) {
  listeningSessions.set(String(botId), { payload: null, expiresAt: Date.now() + timeoutMs });
}

function getListenStatus(botId) {
  const key = String(botId);
  const session = listeningSessions.get(key);
  if (!session) return { status: 'not_listening' };
  if (Date.now() > session.expiresAt) {
    listeningSessions.delete(key);
    return { status: 'timeout' };
  }
  if (session.payload) {
    const payload = session.payload;
    listeningSessions.delete(key);
    return { status: 'captured', payload };
  }
  return { status: 'waiting', remainingMs: session.expiresAt - Date.now() };
}

function normalizePhone(phone) {
  let p = String(phone).replace(/[\s\-\(\)\.]/g, '');
  if (p.startsWith('+')) p = p.substring(1);
  if (p.startsWith('00')) p = p.substring(2);
  if (p.startsWith('0') && p.replace(/\D/g, '').length === 10) p = '972' + p.substring(1);
  p = p.replace(/\D/g, '');
  return p + '@c.us';
}

async function handleBotWebhook(req, res) {
  const { secret } = req.params;

  try {
    await db.query(`ALTER TABLE bots ADD COLUMN IF NOT EXISTS webhook_secret VARCHAR(64)`).catch(() => {});

    const botResult = await db.query(
      `SELECT id, user_id, name, is_active, locked_reason, flow_data FROM bots WHERE webhook_secret = $1`,
      [secret]
    );

    if (botResult.rows.length === 0) {
      return res.status(404).json({ error: 'webhook not found' });
    }

    const bot = botResult.rows[0];
    const payload = { ...req.query, ...(req.body || {}) };

    // Check allowed HTTP method from trigger condition
    const flowData = bot.flow_data || {};
    const nodes = flowData.nodes || [];
    const triggerNode = nodes.find(n => n.type === 'trigger');
    const webhookCondition = triggerNode?.data?.triggerGroups
      ?.flatMap(g => g.conditions || [])
      ?.find(c => c.type === 'webhook');
    const allowedMethod = webhookCondition?.webhookMethod || 'POST';
    const reqMethod = req.method.toUpperCase();
    const methodAllowed = allowedMethod === 'POST+GET' || allowedMethod === reqMethod;
    if (!methodAllowed) {
      return res.status(405).json({ error: `method not allowed, this webhook accepts ${allowedMethod}` });
    }

    // If bot is in listen mode, capture the payload (even if bot is inactive)
    const listenSession = listeningSessions.get(String(bot.id));
    if (listenSession && Date.now() < listenSession.expiresAt && !listenSession.payload) {
      listenSession.payload = payload;
      return res.json({ ok: true, captured: true });
    }

    if (!bot.is_active || bot.locked_reason) {
      return res.status(403).json({ error: 'bot is inactive' });
    }

    const phone = payload.phone || payload.contact || payload.from;
    if (!phone) {
      return res.status(400).json({ error: 'missing phone parameter', hint: 'Pass ?phone=972501234567 or include "phone" in POST body' });
    }

    const normalizedPhone = normalizePhone(phone);
    console.log(`[BotWebhook] Triggered bot ${bot.id} (${bot.name}) for user ${bot.user_id}, phone=${normalizedPhone}`);

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

module.exports = { handleBotWebhook, startListening, getListenStatus };
