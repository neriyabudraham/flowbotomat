const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const { createManaged, createExternal, checkExisting } = require('../controllers/whatsapp/connect.controller');
const { getStatus, getQR, requestCode } = require('../controllers/whatsapp/status.controller');
const { disconnect, deleteConnection } = require('../controllers/whatsapp/disconnect.controller');
const { getGroups } = require('../controllers/whatsapp/groups.controller');
const { getLabels } = require('../controllers/whatsapp/labels.controller');

// All routes require authentication
router.use(authMiddleware);

// Check if user has existing session in WAHA
router.get('/check-existing', checkExisting);

// Get connection status
router.get('/status', getStatus);

// Get QR code
router.get('/qr', getQR);

// Request pairing code (alternative to QR)
router.post('/request-code', requestCode);

// Get WhatsApp groups
router.get('/groups', getGroups);

// Get WhatsApp Business labels
router.get('/labels', getLabels);

// Create managed connection (system WAHA)
router.post('/connect/managed', createManaged);

// Create external connection (user's WAHA)
router.post('/connect/external', createExternal);

// Disconnect (soft - keeps WAHA session alive)
router.delete('/disconnect', disconnect);

// Delete connection completely (logout + delete WAHA session)
router.delete('/delete', deleteConnection);

module.exports = router;
