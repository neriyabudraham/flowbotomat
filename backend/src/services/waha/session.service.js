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

module.exports = {
  createSession,
  startSession,
  stopSession,
  deleteSession,
  getSessionStatus,
  getQRCode,
};
