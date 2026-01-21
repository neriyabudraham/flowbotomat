const express = require('express');
const router = express.Router();
const { handleWebhook } = require('../controllers/webhook/waha.controller');

// WAHA webhook endpoint - no auth required (WAHA calls this)
// URL format: /api/webhook/waha/:userId
router.post('/waha/:userId', handleWebhook);

module.exports = router;
