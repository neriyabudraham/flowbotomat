const express = require('express');
const router = express.Router();
const { uploadFile } = require('../controllers/upload/upload.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Upload file (requires authentication)
router.post('/', authMiddleware, uploadFile);

module.exports = router;
