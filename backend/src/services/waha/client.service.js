const axios = require('axios');

/**
 * Create WAHA API client
 * Extended timeout to handle large media uploads (videos can take longer)
 */
function createClient(baseUrl, apiKey, customTimeout = 600000) {
  return axios.create({
    baseURL: baseUrl,
    headers: {
      'X-Api-Key': apiKey,
      'Content-Type': 'application/json',
    },
    timeout: customTimeout, // 10 minutes default for large uploads
  });
}

module.exports = { createClient };
