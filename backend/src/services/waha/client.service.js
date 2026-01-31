const axios = require('axios');

/**
 * Create WAHA API client
 * Extended timeout to handle large media uploads (videos can take longer)
 */
function createClient(baseUrl, apiKey, customTimeout = 120000) {
  return axios.create({
    baseURL: baseUrl,
    headers: {
      'X-Api-Key': apiKey,
      'Content-Type': 'application/json',
    },
    timeout: customTimeout, // 2 minutes default, can be customized
  });
}

module.exports = { createClient };
