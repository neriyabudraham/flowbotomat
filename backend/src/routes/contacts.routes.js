const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const { listContacts, getContact, getLidMappings, getContactLimitStatus } = require('../controllers/contacts/list.controller');
const { getMessages } = require('../controllers/contacts/messages.controller');
const { toggleBot, toggleBlock, deleteContact, takeoverConversation, bulkDeleteContacts, exportContacts, createOrUpdateContact, getDisabledBots, toggleBotForContact } = require('../controllers/contacts/update.controller');
const { sendMessage } = require('../controllers/contacts/send.controller');
const { getVariables, setVariable, deleteVariable } = require('../controllers/contacts/variables.controller');
const { getAllTags, createTag, deleteTag, getContactTags, addTagToContact, removeTagFromContact, bulkAddTag } = require('../controllers/contacts/tags.controller');
const { getContactStats, getGlobalStats } = require('../controllers/contacts/stats.controller');
const cleanup = require('../controllers/contacts/cleanup.controller');
const gcleanup = require('../controllers/contacts/googleCleanup.controller');
const multer = require('multer');
const keepListUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// All routes require authentication
router.use(authMiddleware);

// LID to phone/name mappings
router.get('/lid-mappings', getLidMappings);

// Contact limit status
router.get('/limit', getContactLimitStatus);

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

// ─── Contact cleanup (non-viewers, keep-list, backups, safe delete) ───
router.post('/cleanup/list',          cleanup.listCleanupContacts);
router.get ('/cleanup/stats',         cleanup.getCleanupStats);
router.post('/cleanup/preview',       cleanup.previewSelection);
router.post('/cleanup/safe-delete',   cleanup.safeBulkDelete);
router.get ('/cleanup/deletion-log',  cleanup.getDeletionLog);

router.get   ('/cleanup/keep-list',    cleanup.listKeepList);
router.post  ('/cleanup/keep-list',    cleanup.addToKeepList);
router.delete('/cleanup/keep-list',    cleanup.removeFromKeepList);
router.post  ('/cleanup/keep-list/import', keepListUpload.single('file'), cleanup.importKeepListFile);

router.post  ('/cleanup/backups',                  cleanup.createBackup);
router.get   ('/cleanup/backups',                  cleanup.listBackups);
router.get   ('/cleanup/backups/:backupId/download', cleanup.downloadBackup);
router.delete('/cleanup/backups/:backupId',        cleanup.deleteBackup);
router.post  ('/cleanup/backups/restore',          cleanup.restoreBackup);

// ─── Google Contacts cleanup (per-slot, against People API) ───
router.get ('/cleanup/google/accounts',          gcleanup.listAccounts);
router.get ('/cleanup/google/labels',            gcleanup.listLabelsForSlot);
router.post('/cleanup/google/sync',              gcleanup.syncSlot);
router.get ('/cleanup/google/sync-status',       gcleanup.getSyncStatus);
router.post('/cleanup/google/list',              gcleanup.listGoogleContacts);
router.get ('/cleanup/google/stats',             gcleanup.getGoogleStats);
router.post('/cleanup/google/preview',           gcleanup.previewGoogleSelection);
router.post('/cleanup/google/safe-delete',       gcleanup.safeDeleteFromGoogle);
router.get ('/cleanup/google/delete-job/:jobId', gcleanup.getDeleteJobStatus);
router.post('/cleanup/google/check-backup-coverage', gcleanup.checkBackupCoverage);
router.get ('/cleanup/google/deletion-log',      gcleanup.getDeletionLog);
router.post('/cleanup/google/backups',                  gcleanup.createGoogleBackup);
router.get ('/cleanup/google/backups',                  gcleanup.listGoogleBackups);
router.get ('/cleanup/google/backups/:backupId/download', gcleanup.downloadGoogleBackup);
router.delete('/cleanup/google/backups/:backupId',      gcleanup.deleteGoogleBackup);

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
