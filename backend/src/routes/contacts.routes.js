const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const { listContacts, getContact } = require('../controllers/contacts/list.controller');
const { getMessages } = require('../controllers/contacts/messages.controller');
const { toggleBot, toggleBlock, deleteContact } = require('../controllers/contacts/update.controller');
const { sendMessage } = require('../controllers/contacts/send.controller');

// All routes require authentication
router.use(authMiddleware);

// List all contacts
router.get('/', listContacts);

// Get single contact
router.get('/:contactId', getContact);

// Get messages for contact
router.get('/:contactId/messages', getMessages);

// Send message to contact
router.post('/:contactId/messages', sendMessage);

// Toggle bot for contact
router.patch('/:contactId/bot', toggleBot);

// Toggle block for contact
router.patch('/:contactId/block', toggleBlock);

// Delete contact
router.delete('/:contactId', deleteContact);

module.exports = router;
