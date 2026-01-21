const express = require('express');
const router = express.Router();
const axios = require('axios');
const { authenticateToken } = require('../middleware/auth.middleware');

// Test API call (for flow builder)
router.post('/test-api', authenticateToken, async (req, res) => {
  try {
    const { method, url, headers, body } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    
    const config = {
      method: method || 'GET',
      url,
      headers: headers || {},
      timeout: 10000
    };
    
    if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
      config.data = body;
      if (!config.headers['Content-Type']) {
        config.headers['Content-Type'] = 'application/json';
      }
    }
    
    const response = await axios(config);
    
    res.json({
      status: response.status,
      data: response.data
    });
  } catch (error) {
    if (error.response) {
      res.status(200).json({
        status: error.response.status,
        data: error.response.data
      });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

module.exports = router;
