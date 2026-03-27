const express = require('express');
const router = express.Router();
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const authMiddleware = require('../middlewares/auth.middleware');

// Multer for temp file uploads (test API)
const tempUploadDir = path.join(__dirname, '../../uploads/temp');
if (!fs.existsSync(tempUploadDir)) fs.mkdirSync(tempUploadDir, { recursive: true });
const upload = multer({ dest: tempUploadDir, limits: { fileSize: 50 * 1024 * 1024 } });

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

// Upload a temp file for testing (returns URL that can be used in test API calls)
router.post('/upload-test-file', authMiddleware, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    // Rename to preserve original extension
    const ext = path.extname(req.file.originalname) || '';
    const newFilename = `${req.file.filename}${ext}`;
    const newPath = path.join(tempUploadDir, newFilename);
    fs.renameSync(req.file.path, newPath);

    const baseUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 3000}/api`;
    const fileUrl = `${baseUrl}/uploads/temp/${newFilename}`;
    res.json({ url: fileUrl, filename: req.file.originalname });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
