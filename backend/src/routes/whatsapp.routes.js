const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const { createManaged, createExternal, checkExisting } = require('../controllers/whatsapp/connect.controller');
const { getStatus, getQR, requestCode, getUserStatuses } = require('../controllers/whatsapp/status.controller');
const { disconnect, deleteConnection } = require('../controllers/whatsapp/disconnect.controller');
const { getGroups } = require('../controllers/whatsapp/groups.controller');
const { getChannels } = require('../controllers/whatsapp/channels.controller');
const { getLabels } = require('../controllers/whatsapp/labels.controller');
const { checkAndSync, pullWhatsAppContacts, getGroupParticipants, importGroupParticipants } = require('../controllers/whatsapp/contacts.controller');

// All routes require authentication
router.use(authMiddleware);

// Check if user has existing session in WAHA
router.get('/check-existing', checkExisting);

// WhatsApp contacts sync - automatic check on app load
router.get('/contacts/check-sync', checkAndSync);

// Pull WhatsApp contacts and import to system
router.post('/contacts/pull', pullWhatsAppContacts);

// Get group participants
router.get('/groups/:groupId/participants', getGroupParticipants);

// Import group participants to contacts
router.post('/groups/:groupId/participants/import', importGroupParticipants);

// Get user's recently posted statuses (for specific status triggers)
router.get('/statuses', getUserStatuses);

// Get connection status
router.get('/status', getStatus);

// Get QR code
router.get('/qr', getQR);

// Request pairing code (alternative to QR)
router.post('/request-code', requestCode);

// Get WhatsApp groups
router.get('/groups', getGroups);

// Get WhatsApp channels (newsletters)
router.get('/channels', getChannels);

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
