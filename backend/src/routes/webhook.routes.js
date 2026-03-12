const express = require('express');
const router = express.Router();
const { handleWebhook } = require('../controllers/webhook/waha.controller');
const cloudApiController = require('../controllers/webhook/cloudApi.controller');
const { handleBotWebhook } = require('../controllers/webhook/botWebhook.controller');

// WAHA webhook endpoint - no auth required (WAHA calls this)
// URL format: /api/webhook/waha/:userId
router.post('/waha/:userId', handleWebhook);

// WhatsApp Cloud API webhook - no auth required (Meta calls this)
// URL format: /api/webhook/whatsapp
router.get('/whatsapp', cloudApiController.verifyWebhook);
router.post('/whatsapp', cloudApiController.handleWebhook);

// Bot webhook trigger - no auth required (external callers use secret key)
// URL format: GET|POST /api/webhook/bot/:secret
router.get('/bot/:secret', handleBotWebhook);
router.post('/bot/:secret', handleBotWebhook);

module.exports = router;
