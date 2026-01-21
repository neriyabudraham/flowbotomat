const axios = require('axios');

/**
 * Create WAHA API client
 */
function createClient(baseUrl, apiKey) {
  return axios.create({
    baseURL: baseUrl,
    headers: {
      'X-Api-Key': apiKey,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });
}

module.exports = { createClient };
