const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middlewares/auth.middleware');

const audiencesController = require('../controllers/broadcasts/audiences.controller');
const templatesController = require('../controllers/broadcasts/templates.controller');
const campaignsController = require('../controllers/broadcasts/campaigns.controller');
const importController = require('../controllers/broadcasts/import.controller');

// All routes require authentication
router.use(authenticate);

// For now, all broadcast features require admin (will be opened later)
router.use(requireAdmin);

// ============================================
// Audiences
// ============================================
router.get('/audiences', audiencesController.getAudiences);
router.get('/audiences/:id', audiencesController.getAudience);
router.post('/audiences', audiencesController.createAudience);
router.put('/audiences/:id', audiencesController.updateAudience);
router.delete('/audiences/:id', audiencesController.deleteAudience);
router.get('/audiences/:id/contacts', audiencesController.getAudienceContacts);
router.post('/audiences/:id/contacts', audiencesController.addContactsToAudience);
router.delete('/audiences/:id/contacts', audiencesController.removeContactsFromAudience);

// ============================================
// Templates
// ============================================
router.get('/templates', templatesController.getTemplates);
router.get('/templates/:id', templatesController.getTemplate);
router.post('/templates', templatesController.createTemplate);
router.put('/templates/:id', templatesController.updateTemplate);
router.delete('/templates/:id', templatesController.deleteTemplate);

// Template messages
router.post('/templates/:id/messages', templatesController.addMessage);
router.put('/templates/:templateId/messages/:messageId', templatesController.updateMessage);
router.delete('/templates/:templateId/messages/:messageId', templatesController.deleteMessage);
router.put('/templates/:id/messages/reorder', templatesController.reorderMessages);

// ============================================
// Campaigns
// ============================================
router.get('/campaigns', campaignsController.getCampaigns);
router.get('/campaigns/:id', campaignsController.getCampaign);
router.post('/campaigns', campaignsController.createCampaign);
router.put('/campaigns/:id', campaignsController.updateCampaign);
router.delete('/campaigns/:id', campaignsController.deleteCampaign);

// Campaign actions
router.post('/campaigns/:id/start', campaignsController.startCampaign);
router.post('/campaigns/:id/pause', campaignsController.pauseCampaign);
router.post('/campaigns/:id/resume', campaignsController.resumeCampaign);
router.post('/campaigns/:id/cancel', campaignsController.cancelCampaign);

// Campaign stats
router.get('/campaigns/:id/recipients', campaignsController.getCampaignRecipients);
router.get('/campaigns/:id/stats', campaignsController.getCampaignStats);

// ============================================
// Contact Import
// ============================================
router.post('/import/upload', importController.uploadFile);
router.get('/import/variables', importController.getVariables);
router.post('/import/variables', importController.createVariable);
router.post('/import/execute', importController.executeImport);
router.post('/import/cancel', importController.cancelImport);

module.exports = router;
