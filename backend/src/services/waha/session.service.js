const { createClient } = require('./client.service');

/**
 * Create a new WAHA session
 * @param {string} baseUrl - WAHA base URL
 * @param {string} apiKey - WAHA API key
 * @param {string} sessionName - Session name (alphanumeric + underscore only)
 * @param {object} metadata - Optional metadata (e.g., { "user.email": "example@gmail.com" })
 */
async function createSession(baseUrl, apiKey, sessionName, metadata = {}) {
  const client = createClient(baseUrl, apiKey);
  const response = await client.post('/api/sessions', {
    name: sessionName,
    config: {
      webhooks: [],
      metadata: metadata,
    },
  });
  return response.data;
}

/**
 * Start an existing session
 */
async function startSession(baseUrl, apiKey, sessionName) {
  const client = createClient(baseUrl, apiKey);
  const response = await client.post(`/api/sessions/${sessionName}/start`);
  return response.data;
}

/**
 * Stop a session
 */
async function stopSession(baseUrl, apiKey, sessionName) {
  const client = createClient(baseUrl, apiKey);
  const response = await client.post(`/api/sessions/${sessionName}/stop`);
  return response.data;
}

/**
 * Delete a session
 */
async function deleteSession(baseUrl, apiKey, sessionName) {
  const client = createClient(baseUrl, apiKey);
  const response = await client.delete(`/api/sessions/${sessionName}`);
  return response.data;
}

/**
 * Logout from WhatsApp (disconnect but keep session)
 */
async function logoutSession(baseUrl, apiKey, sessionName) {
  const client = createClient(baseUrl, apiKey);
  const response = await client.post(`/api/sessions/${sessionName}/logout`);
  return response.data;
}

/**
 * Get session status
 */
async function getSessionStatus(baseUrl, apiKey, sessionName) {
  const client = createClient(baseUrl, apiKey);
  const response = await client.get(`/api/sessions/${sessionName}`);
  return response.data;
}

/**
 * Get QR code for session
 */
async function getQRCode(baseUrl, apiKey, sessionName) {
  const client = createClient(baseUrl, apiKey);
  const response = await client.get(`/api/${sessionName}/auth/qr`, {
    params: { format: 'raw' },
  });
  return response.data;
}

/**
 * Get all sessions from WAHA
 */
async function getAllSessions(baseUrl, apiKey) {
  const client = createClient(baseUrl, apiKey);
  const response = await client.get('/api/sessions');
  return response.data;
}

/**
 * Find session by user.email in metadata
 * @returns session object or null
 */
async function findSessionByEmail(baseUrl, apiKey, email) {
  console.log(`[WAHA] Searching for session with email: ${email}`);
  
  const sessions = await getAllSessions(baseUrl, apiKey);
  console.log(`[WAHA] Found ${sessions.length} total sessions`);
  
  for (const session of sessions) {
    const metadata = session.config?.metadata || {};
    console.log(`[WAHA] Session "${session.name}" metadata:`, JSON.stringify(metadata));
    
    if (metadata['user.email'] === email) {
      console.log(`[WAHA] ✅ Match found: ${session.name}`);
      return session;
    }
  }
  
  console.log(`[WAHA] ❌ No session found with email: ${email}`);
  return null;
}

/**
 * Add webhook to session (keeps ALL existing config)
 */
async function addWebhook(baseUrl, apiKey, sessionName, webhookUrl, events) {
  const client = createClient(baseUrl, apiKey);
  
  // Get current session config
  const sessionInfo = await client.get(`/api/sessions/${sessionName}`);
  const currentConfig = sessionInfo.data?.config || {};
  const currentWebhooks = currentConfig.webhooks || [];
  
  // Check if webhook already exists
  const exists = currentWebhooks.some(wh => wh.url === webhookUrl);
  if (exists) {
    console.log(`[WAHA] Webhook already exists: ${webhookUrl}`);
    return sessionInfo.data;
  }
  
  // Add new webhook to existing list
  const updatedWebhooks = [
    ...currentWebhooks,
    {
      url: webhookUrl,
      events: events,
      retries: {
        delaySeconds: 2,
        attempts: 2,
        policy: 'constant',
      },
    },
  ];
  
  // Update session - keep ALL existing config, only update webhooks
  const response = await client.put(`/api/sessions/${sessionName}`, {
    config: {
      ...currentConfig,
      webhooks: updatedWebhooks,
    },
  });
  
  console.log(`[WAHA] Webhook added. Total: ${updatedWebhooks.length}`);
  return response.data;
}

/**
 * Send text message
 */
async function sendMessage(connection, phone, text) {
  const client = createClient(connection.base_url, connection.api_key);
  const chatId = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
  
  const response = await client.post(`/api/sendText`, {
    session: connection.session_name,
    chatId: chatId,
    text: text,
  });
  
  console.log(`[WAHA] Sent message to ${phone}`);
  return response.data;
}

/**
 * Send image
 */
async function sendImage(connection, phone, imageUrl, caption = '') {
  const client = createClient(connection.base_url, connection.api_key);
  const chatId = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
  
  const response = await client.post(`/api/sendImage`, {
    session: connection.session_name,
    chatId: chatId,
    file: { url: imageUrl },
    caption: caption,
  });
  
  console.log(`[WAHA] Sent image to ${phone}`);
  return response.data;
}

/**
 * Send file
 */
async function sendFile(connection, phone, fileUrl, filename = 'file') {
  const client = createClient(connection.base_url, connection.api_key);
  const chatId = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
  
  const response = await client.post(`/api/sendFile`, {
    session: connection.session_name,
    chatId: chatId,
    file: { url: fileUrl },
    fileName: filename,
  });
  
  console.log(`[WAHA] Sent file to ${phone}`);
  return response.data;
}

/**
 * Send video
 */
async function sendVideo(connection, phone, videoUrl, caption = '') {
  const client = createClient(connection.base_url, connection.api_key);
  const chatId = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
  
  const response = await client.post(`/api/sendVideo`, {
    session: connection.session_name,
    chatId: chatId,
    file: { url: videoUrl },
    caption: caption,
  });
  
  console.log(`[WAHA] Sent video to ${phone}`);
  return response.data;
}

/**
 * Send list message
 */
async function sendList(connection, phone, listData) {
  const client = createClient(connection.base_url, connection.api_key);
  const chatId = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
  
  const rows = (listData.buttons || []).map((btn, i) => {
    const row = {
      title: (btn.title || `אפשרות ${i + 1}`).substring(0, 24), // Max 24 chars
      rowId: String(i), // Simple index to match frontend handles: "0", "1", "2"
    };
    if (btn.description) {
      row.description = btn.description.substring(0, 72); // Max 72 chars
    }
    return row;
  });
  
  const payload = {
    session: connection.session_name,
    chatId: chatId,
    message: {
      title: (listData.title || '').substring(0, 60),
      description: listData.body || 'בחר אפשרות',
      footer: (listData.footer || '').substring(0, 60),
      button: (listData.buttonText || 'בחר').substring(0, 20),
      sections: [
        {
          title: 'אפשרויות',
          rows: rows,
        },
      ],
    },
  };
  
  console.log('[WAHA] Sending list payload:', JSON.stringify(payload, null, 2));
  
  const response = await client.post(`/api/sendList`, payload);
  
  console.log(`[WAHA] Sent list to ${phone}`);
  return response.data;
}

module.exports = {
  createSession,
  startSession,
  stopSession,
  deleteSession,
  logoutSession,
  getSessionStatus,
  getQRCode,
  getAllSessions,
  findSessionByEmail,
  addWebhook,
  sendMessage,
  sendImage,
  sendFile,
  sendVideo,
  sendList,
};
