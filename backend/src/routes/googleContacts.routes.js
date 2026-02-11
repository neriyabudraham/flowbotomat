const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const controller = require('../controllers/integrations/googleContacts.controller');

// OAuth callback - NO auth middleware (user redirected from Google)
router.get('/callback', controller.handleCallback);

// All other routes require authentication
router.use(authMiddleware);

// Connection management
router.get('/auth-url', controller.getAuthUrl);
router.get('/status', controller.getStatus);
router.post('/disconnect', controller.disconnect);

// Contact operations
router.get('/search', controller.searchContacts);
router.get('/list', controller.listContacts);
router.get('/find/phone/:phone', controller.findByPhone);
router.get('/find/email/:email', controller.findByEmail);
router.post('/exists', controller.checkExists);
router.post('/create', controller.createContact);
router.post('/find-or-create', controller.findOrCreate);

// Contact CRUD with resource names (people/c123456)
router.put('/(people/*)', controller.updateContact);
router.delete('/(people/*)', controller.deleteContact);

// Label operations
router.get('/labels', controller.listLabels);
router.post('/labels', controller.createLabel);
router.post('/labels/(contactGroups/*)/add', controller.addToLabel);
router.post('/labels/(contactGroups/*)/remove', controller.removeFromLabel);
router.get('/labels/(contactGroups/*)/contacts', controller.getContactsInLabel);

module.exports = router;
