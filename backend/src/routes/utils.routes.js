const express = require('express');
const router = express.Router();
const axios = require('axios');
const authMiddleware = require('../middlewares/auth.middleware');

// Test API call (for flow builder)
router.post('/test-api', authMiddleware, async (req, res) => {
  try {
    const { method, url, headers, body, bodyMode, bodyParams } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const config = {
      method: method || 'GET',
      url,
      headers: headers || {},
      timeout: 10000
    };

    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      if (bodyMode === 'formdata' && bodyParams && bodyParams.length > 0) {
        // Build multipart/form-data for testing
        const FormData = require('form-data');
        const form = new FormData();
        for (const param of bodyParams) {
          if (!param.key) continue;
          if (param.isFile && param.value) {
            try {
              const fileRes = await axios({ method: 'GET', url: param.value, responseType: 'stream', timeout: 10000 });
              const contentType = fileRes.headers['content-type'] || 'application/octet-stream';
              const path = require('path');
              const filename = path.basename(new URL(param.value).pathname) || 'file';
              form.append(param.key, fileRes.data, { filename, contentType });
            } catch {
              form.append(param.key, param.value);
            }
          } else {
            form.append(param.key, param.value || '');
          }
        }
        config.data = form;
        Object.assign(config.headers, form.getHeaders());
      } else if (body) {
        config.data = body;
        if (!config.headers['Content-Type']) {
          config.headers['Content-Type'] = 'application/json';
        }
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
