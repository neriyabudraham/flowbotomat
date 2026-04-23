/**
 * Admin Telegram notifications.
 *
 * Credentials are stored in system_settings:
 *   - telegram_bot_token     — the bot API token (neriy_monitor_bot)
 *   - telegram_admin_chat_id — admin's personal chat id
 *
 * All failures are swallowed (notifications must never break the main flow).
 */

const axios = require('axios');
const db = require('../../config/database');

let _cachedCreds = null;
let _cachedAt = 0;
const CRED_TTL_MS = 60_000; // refresh every minute in case admin rotated token

async function getCredentials() {
  if (_cachedCreds && Date.now() - _cachedAt < CRED_TTL_MS) return _cachedCreds;
  try {
    const r = await db.query(
      `SELECT key, value FROM system_settings WHERE key IN ('telegram_bot_token','telegram_admin_chat_id')`
    );
    const m = {};
    for (const row of r.rows) {
      // value is JSONB — if stored as a string, it comes back as a JS string
      m[row.key] = typeof row.value === 'string' ? row.value.replace(/^"|"$/g, '') : row.value;
    }
    _cachedCreds = {
      token: m.telegram_bot_token || null,
      chatId: m.telegram_admin_chat_id || null,
    };
    _cachedAt = Date.now();
  } catch {
    _cachedCreds = { token: null, chatId: null };
  }
  return _cachedCreds;
}

/**
 * Escape text for HTML parse mode — only the three chars Telegram requires.
 */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Format an Israeli phone number nicely: 972584254229 → 058-425-4229
 * Falls back to E.164 for non-Israeli numbers.
 */
function formatIsraeliPhone(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('972') && digits.length === 12) {
    const local = digits.slice(3); // 584254229
    return `0${local.slice(0, 2)}-${local.slice(2, 5)}-${local.slice(5)}`;
  }
  if (digits.length === 10 && digits.startsWith('0')) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return `+${digits}`;
}

/**
 * Fire-and-forget Telegram message to the admin.
 * - `text` is sent with parse_mode=HTML
 * - Returns true on success (ok:true), false otherwise. Never throws.
 */
async function sendToAdmin(text, { silent = false } = {}) {
  try {
    const { token, chatId } = await getCredentials();
    if (!token || !chatId) {
      console.warn('[Telegram] Missing bot token or chat id — message not sent');
      return false;
    }
    const res = await axios.post(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        disable_notification: !!silent,
      },
      { timeout: 10_000 }
    );
    return res.data?.ok === true;
  } catch (err) {
    console.warn(`[Telegram] sendToAdmin failed: ${err.response?.data?.description || err.message}`);
    return false;
  }
}

/**
 * Send a structured "partial send at 20 minutes" notification.
 */
async function notifyPartialAt20Min({ phoneNumber, userName, contactsSent, contactsTotal }) {
  const phonePretty = escapeHtml(formatIsraeliPhone(phoneNumber));
  const name = escapeHtml(userName || 'משתמש ללא שם');
  const sent = Number(contactsSent || 0).toLocaleString('he-IL');
  const total = Number(contactsTotal || 0).toLocaleString('he-IL');
  const text =
    `⚠️ <b>סטטוס לא הושלם</b>\n\n` +
    `לקוח: <b>${name}</b>\n` +
    `טלפון: <code>${phonePretty}</code>\n` +
    `נמסר: ${sent}/${total}\n\n` +
    `חלפו 20 דקות — המערכת ממשיכה לנסות ברקע ועוברת כרגע לסטטוס הבא בתור של הלקוח. ` +
    `ויתור סופי יקרה אחרי שעתיים.`;
  return sendToAdmin(text);
}

/**
 * Send a structured "partial send — final give-up after 2h" notification.
 */
async function notifyPartialFinalGiveup({ phoneNumber, userName, contactsSent, contactsTotal }) {
  const phonePretty = escapeHtml(formatIsraeliPhone(phoneNumber));
  const name = escapeHtml(userName || 'משתמש ללא שם');
  const sent = Number(contactsSent || 0).toLocaleString('he-IL');
  const total = Number(contactsTotal || 0).toLocaleString('he-IL');
  const text =
    `❌ <b>ויתור סופי על סטטוס</b>\n\n` +
    `לקוח: <b>${name}</b>\n` +
    `טלפון: <code>${phonePretty}</code>\n` +
    `נמסר סופית: ${sent}/${total}\n\n` +
    `חלפו שעתיים של ניסיונות חוזרים — המערכת ויתרה. הסטטוס סומן כ-failed.`;
  return sendToAdmin(text);
}

module.exports = {
  sendToAdmin,
  notifyPartialAt20Min,
  notifyPartialFinalGiveup,
  formatIsraeliPhone,
  escapeHtml,
};
