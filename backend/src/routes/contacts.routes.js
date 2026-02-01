const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const { listContacts, getContact, getLidMappings } = require('../controllers/contacts/list.controller');
const { getMessages } = require('../controllers/contacts/messages.controller');
const { toggleBot, toggleBlock, deleteContact, takeoverConversation, bulkDeleteContacts, exportContacts, createOrUpdateContact, getDisabledBots, toggleBotForContact } = require('../controllers/contacts/update.controller');
const { sendMessage } = require('../controllers/contacts/send.controller');
const { getVariables, setVariable, deleteVariable } = require('../controllers/contacts/variables.controller');
const { getAllTags, createTag, deleteTag, getContactTags, addTagToContact, removeTagFromContact, bulkAddTag } = require('../controllers/contacts/tags.controller');
const { getContactStats, getGlobalStats } = require('../controllers/contacts/stats.controller');

// All routes require authentication
router.use(authMiddleware);

// LID to phone/name mappings
router.get('/lid-mappings', getLidMappings);

// Global contacts stats
router.get('/stats', getGlobalStats);

// Export contacts (CSV)
router.get('/export', exportContacts);

// Tags (user level)
router.get('/tags', getAllTags);
router.post('/tags', createTag);
router.delete('/tags/:tagId', deleteTag);

// Bulk delete contacts
router.post('/bulk-delete', bulkDeleteContacts);

// Bulk add tag to contacts
router.post('/bulk-tag', bulkAddTag);

// Create or update single contact (for manual imports)
router.post('/create-or-update', createOrUpdateContact);

// List all contacts
router.get('/', listContacts);

// Get single contact
router.get('/:contactId', getContact);

// Get messages for contact
router.get('/:contactId/messages', getMessages);

// Get contact statistics
router.get('/:contactId/stats', getContactStats);

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

// Toggle bot for contact (global)
router.patch('/:contactId/bot', toggleBot);

// Get disabled bots for contact
router.get('/:contactId/disabled-bots', getDisabledBots);

// Toggle specific bot for contact
router.patch('/:contactId/bots/:botId', toggleBotForContact);

// Takeover conversation (disable bot temporarily)
router.post('/:contactId/takeover', takeoverConversation);

// Toggle block for contact
router.patch('/:contactId/block', toggleBlock);

// Delete contact
router.delete('/:contactId', deleteContact);

module.exports = router;
