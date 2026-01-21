const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const { listContacts, getContact } = require('../controllers/contacts/list.controller');
const { getMessages } = require('../controllers/contacts/messages.controller');
const { toggleBot, toggleBlock, deleteContact, takeoverConversation } = require('../controllers/contacts/update.controller');
const { sendMessage } = require('../controllers/contacts/send.controller');
const { getVariables, setVariable, deleteVariable } = require('../controllers/contacts/variables.controller');
const { getAllTags, createTag, deleteTag, getContactTags, addTagToContact, removeTagFromContact } = require('../controllers/contacts/tags.controller');

// All routes require authentication
router.use(authMiddleware);

// Tags (user level)
router.get('/tags', getAllTags);
router.post('/tags', createTag);
router.delete('/tags/:tagId', deleteTag);

// List all contacts
router.get('/', listContacts);

// Get single contact
router.get('/:contactId', getContact);

// Get messages for contact
router.get('/:contactId/messages', getMessages);

// Send message to contact
router.post('/:contactId/messages', sendMessage);

// Variables
router.get('/:contactId/variables', getVariables);
router.post('/:contactId/variables', setVariable);
router.delete('/:contactId/variables/:key', deleteVariable);

// Tags (contact level)
router.get('/:contactId/tags', getContactTags);
router.post('/:contactId/tags', addTagToContact);
router.delete('/:contactId/tags/:tagId', removeTagFromContact);

// Toggle bot for contact
router.patch('/:contactId/bot', toggleBot);

// Takeover conversation (disable bot temporarily)
router.post('/:contactId/takeover', takeoverConversation);

// Toggle block for contact
router.patch('/:contactId/block', toggleBlock);

// Delete contact
router.delete('/:contactId', deleteContact);

module.exports = router;
