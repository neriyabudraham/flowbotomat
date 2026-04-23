/**
 * Cloud API wrapper scoped to the Save Contact Bot WABA.
 * Uses SAVE_CONTACT_BOT_* env vars so it stays independent from the Status Bot's Cloud API integration.
 */

const axios = require('axios');

const GRAPH_API_VERSION = 'v24.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

function getCredentials() {
  return {
    phoneId: process.env.SAVE_CONTACT_BOT_PHONE_ID,
    accessToken: process.env.SAVE_CONTACT_BOT_ACCESS_TOKEN,
    verifyToken: process.env.SAVE_CONTACT_BOT_VERIFY_TOKEN,
    wabaId: process.env.SAVE_CONTACT_BOT_WABA_ID,
  };
}

function authHeaders() {
  const { accessToken } = getCredentials();
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

async function sendTextMessage(to, text, contextMessageId = null) {
  const { phoneId } = getCredentials();
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text, preview_url: false },
  };
  if (contextMessageId) payload.context = { message_id: contextMessageId };
  const { data } = await axios.post(`${GRAPH_API_BASE}/${phoneId}/messages`, payload, { headers: authHeaders() });
  console.log(`[SaveContactBot API] ✅ text → ${to}`);
  return data;
}

async function sendMediaMessage(to, type, mediaUrl, caption = '', filename = null) {
  const { phoneId } = getCredentials();
  if (!['image', 'video', 'audio', 'document'].includes(type)) {
    throw new Error(`Unsupported media type: ${type}`);
  }
  const mediaBody = { link: mediaUrl };
  if (caption && type !== 'audio') mediaBody.caption = caption;
  if (type === 'document' && filename) mediaBody.filename = filename;

  const payload = {
    messaging_product: 'whatsapp',
    to,
    type,
    [type]: mediaBody,
  };
  const { data } = await axios.post(`${GRAPH_API_BASE}/${phoneId}/messages`, payload, { headers: authHeaders() });
  console.log(`[SaveContactBot API] ✅ ${type} → ${to}`);
  return data;
}

/**
 * Send a WhatsApp contact card (vCard-like structured payload).
 */
async function sendContactCard(to, { fullName, phone }) {
  const { phoneId } = getCredentials();
  const cleanPhone = String(phone).replace(/\D/g, '');
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'contacts',
    contacts: [{
      name: {
        formatted_name: fullName,
        first_name: fullName,
      },
      phones: [{
        phone: `+${cleanPhone}`,
        wa_id: cleanPhone,
        type: 'CELL',
      }],
    }],
  };
  const { data } = await axios.post(`${GRAPH_API_BASE}/${phoneId}/messages`, payload, { headers: authHeaders() });
  console.log(`[SaveContactBot API] ✅ contact-card (${fullName}) → ${to}`);
  return data;
}

async function markAsRead(messageId) {
  const { phoneId } = getCredentials();
  try {
    await axios.post(
      `${GRAPH_API_BASE}/${phoneId}/messages`,
      { messaging_product: 'whatsapp', status: 'read', message_id: messageId },
      { headers: authHeaders() }
    );
  } catch (e) {
    // Non-fatal — just log
    console.warn(`[SaveContactBot API] markAsRead failed: ${e.response?.data?.error?.message || e.message}`);
  }
}

/**
 * Create a Click-to-WhatsApp short link (wa.me/message/XXX).
 * Returns { code, deep_link_url, qr_image_url, prefilled_message }.
 */
async function createQrdl(prefilledMessage, generateQrImage = 'PNG') {
  const { phoneId } = getCredentials();
  const url = `${GRAPH_API_BASE}/${phoneId}/message_qrdls`;
  const { data } = await axios.post(
    url,
    null,
    {
      headers: authHeaders(),
      params: {
        prefilled_message: prefilledMessage,
        generate_qr_image: generateQrImage,
      },
    }
  );
  console.log(`[SaveContactBot API] ✅ qrdl created: ${data.deep_link_url}`);
  return data;
}

async function updateQrdl(code, prefilledMessage) {
  const { phoneId } = getCredentials();
  const url = `${GRAPH_API_BASE}/${phoneId}/message_qrdls/${code}`;
  const { data } = await axios.post(url, null, {
    headers: authHeaders(),
    params: { prefilled_message: prefilledMessage },
  });
  console.log(`[SaveContactBot API] ✅ qrdl updated: ${code}`);
  return data;
}

async function deleteQrdl(code) {
  const { phoneId } = getCredentials();
  const url = `${GRAPH_API_BASE}/${phoneId}/message_qrdls/${code}`;
  const { data } = await axios.delete(url, { headers: authHeaders() });
  return data;
}

module.exports = {
  getCredentials,
  sendTextMessage,
  sendMediaMessage,
  sendContactCard,
  markAsRead,
  createQrdl,
  updateQrdl,
  deleteQrdl,
};
