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
    try {
      return {
        baseUrl: decrypt(connection.external_base_url),
        apiKey: decrypt(connection.external_api_key),
        webhookBaseUrl: null,
      };
    } catch (err) {
      throw new Error(`שגיאה בפענוח אישורי external connection (id=${connection.id}): ${err.message}`);
    }
  }

  // Managed connection — if base_url is already cached on the connection row, use it directly
  if (connection.waha_source_id) {
    const { getCredentialsForSource } = require('../waha/sources.service');
    const creds = await getCredentialsForSource(connection.waha_source_id);
    if (creds) {
      // Prefer the cached base_url stamped by sync (more up-to-date for moved sessions)
      if (connection.waha_base_url) creds.baseUrl = connection.waha_base_url;
      return creds;
    }
  }
  // Fast-path: waha_base_url set but no source row (shouldn't happen, but handle gracefully)
  if (connection.waha_base_url) {
    return { baseUrl: connection.waha_base_url, apiKey: process.env.WAHA_API_KEY, webhookBaseUrl: null };
  }

  // Fallback to env vars
  return { ...getWahaCredentials(), webhookBaseUrl: null };
}

module.exports = {
  getWahaCredentials,
  getWahaCredentialsForConnection,
};
