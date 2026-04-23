/**
 * Save Contact Bot Webhook Controller
 * Dedicated webhook for the contact-saving bot (phone 972527428547).
 * Separate from the status bot's Cloud API webhook.
 */

const crypto = require('crypto');
const saveContactBotService = require('../../services/saveContactBot/saveContactBot.service');

async function verifyWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const expected = process.env.SAVE_CONTACT_BOT_VERIFY_TOKEN;

  console.log('[SaveContactBot Webhook] Verify request:', { mode, tokenMatches: token === expected });

  if (mode === 'subscribe' && token === expected) {
    return res.status(200).send(challenge);
  }
  return res.status(403).send('Forbidden');
}

// Verify Meta's X-Hub-Signature-256 header. Returns true if valid, false otherwise.
// If SAVE_CONTACT_BOT_APP_SECRET is not configured, logs a warning and returns true
// (back-compat so we don't lock out an un-configured deployment).
function verifySignature(req) {
  const appSecret = process.env.SAVE_CONTACT_BOT_APP_SECRET;
  if (!appSecret) {
    console.warn('[SaveContactBot Webhook] SAVE_CONTACT_BOT_APP_SECRET not set — signature verification DISABLED');
    return true;
  }
  const header = req.get('x-hub-signature-256') || '';
  if (!header.startsWith('sha256=')) return false;
  const raw = req.rawBody;
  if (!raw || !raw.length) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(raw).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  } catch {
    return false;
  }
}

async function handleWebhook(req, res) {
  if (!verifySignature(req)) {
    console.warn('[SaveContactBot Webhook] rejected — invalid signature');
    return res.status(403).send('Forbidden');
  }
  res.status(200).send('OK');

  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue;
        const value = change.value || {};
        const phoneNumberId = value.metadata?.phone_number_id;
        const waContacts = value.contacts || [];

        for (const message of value.messages || []) {
          const from = message.from;
          const type = message.type;
          const text = message.text?.body || '';
          const waContact = waContacts.find((c) => c.wa_id === from);
          const waName = waContact?.profile?.name || null;
          console.log(`[SaveContactBot Webhook] 📩 INBOUND phone_number_id=${phoneNumberId} from=${from} waName=${JSON.stringify(waName)} type=${type} text=${JSON.stringify(text)}`);

          if (type === 'text' && text) {
            saveContactBotService
              .handleInboundMessage({ from, waName, text, messageId: message.id })
              .catch((err) => console.error('[SaveContactBot Webhook] handleInboundMessage error:', err.message));
          }
        }

        for (const status of value.statuses || []) {
          console.log(`[SaveContactBot Webhook] 📬 STATUS id=${status.id} status=${status.status}`);
        }
      }
    }
  } catch (error) {
    console.error('[SaveContactBot Webhook] Error:', error);
  }
}

module.exports = { verifyWebhook, handleWebhook };
