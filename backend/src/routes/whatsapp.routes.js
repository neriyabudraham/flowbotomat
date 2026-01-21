const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const { createManaged, createExternal } = require('../controllers/whatsapp/connect.controller');
const { getStatus, getQR } = require('../controllers/whatsapp/status.controller');
const { disconnect } = require('../controllers/whatsapp/disconnect.controller');

// All routes require authentication
router.use(authMiddleware);

// Get connection status
router.get('/status', getStatus);

// Get QR code
router.get('/qr', getQR);

// Create managed connection (system WAHA)
router.post('/connect/managed', createManaged);

// Create external connection (user's WAHA)
router.post('/connect/external', createExternal);

// Disconnect
router.delete('/disconnect', disconnect);

module.exports = router;
