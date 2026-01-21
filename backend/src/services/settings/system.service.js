/**
 * Get WAHA system credentials from environment variables
 */
function getWahaCredentials() {
  return {
    baseUrl: process.env.WAHA_BASE_URL,
    apiKey: process.env.WAHA_API_KEY,
  };
}

module.exports = {
  getWahaCredentials,
};
