const { createClient } = require('./client.service');

/**
 * Create a new WAHA session
 */
async function createSession(baseUrl, apiKey, sessionName) {
  const client = createClient(baseUrl, apiKey);
  const response = await client.post('/api/sessions', {
    name: sessionName,
    config: {
      webhooks: [],
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

module.exports = {
  createSession,
  startSession,
  stopSession,
  deleteSession,
  getSessionStatus,
  getQRCode,
  addWebhook,
};
