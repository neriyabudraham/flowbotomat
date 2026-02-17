const express = require('express');
const router = express.Router();
const { handleWebhook } = require('../controllers/webhook/waha.controller');
const cloudApiController = require('../controllers/webhook/cloudApi.controller');

// WAHA webhook endpoint - no auth required (WAHA calls this)
// URL format: /api/webhook/waha/:userId
router.post('/waha/:userId', handleWebhook);

// WhatsApp Cloud API webhook - no auth required (Meta calls this)
// URL format: /api/webhook/whatsapp
router.get('/whatsapp', cloudApiController.verifyWebhook);
router.post('/whatsapp', cloudApiController.handleWebhook);

module.exports = router;
