/**
 * Get WAHA system credentials from environment variables (legacy fallback)
 */
function getWahaCredentials() {
  return {
    baseUrl: process.env.WAHA_BASE_URL,
    apiKey: process.env.WAHA_API_KEY,
  };
}

/**
 * Resolve WAHA credentials for a connection object.
 * Handles: external connections, managed with waha_source_id, managed fallback to env vars.
 */
async function getWahaCredentialsForConnection(connection) {
  if (!connection) return { ...getWahaCredentials(), webhookBaseUrl: null };

  if (connection.connection_type === 'external') {
    const { decrypt } = require('../crypto/encrypt.service');
    return {
      baseUrl: decrypt(connection.external_base_url),
      apiKey: decrypt(connection.external_api_key),
      webhookBaseUrl: null,
    };
  }

  // Managed connection — use waha_source_id if available
  if (connection.waha_source_id) {
    const { getCredentialsForSource } = require('../waha/sources.service');
    const creds = await getCredentialsForSource(connection.waha_source_id);
    if (creds) return creds;
  }

  // Fallback to env vars
  return { ...getWahaCredentials(), webhookBaseUrl: null };
}

module.exports = {
  getWahaCredentials,
  getWahaCredentialsForConnection,
};
