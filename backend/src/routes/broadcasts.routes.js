const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth.middleware');
const { checkLimit } = require('../controllers/subscriptions/subscriptions.controller');

const audiencesController = require('../controllers/broadcasts/audiences.controller');
const templatesController = require('../controllers/broadcasts/templates.controller');
const campaignsController = require('../controllers/broadcasts/campaigns.controller');
const automatedCampaignsController = require('../controllers/broadcasts/automatedCampaigns.controller');
const importController = require('../controllers/broadcasts/import.controller');

// All routes require authentication
router.use(authenticate);

// Check if user has broadcasts feature
const requireBroadcasts = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const featureCheck = await checkLimit(userId, 'allow_broadcasts');
    
    if (!featureCheck.allowed) {
      return res.status(403).json({ 
        error: 'התוכנית שלך לא כוללת שליחת הודעות תפוצה. שדרג את החבילה כדי להשתמש בתכונה זו.',
        code: 'FEATURE_NOT_ALLOWED',
        upgrade: true
      });
    }
    
    next();
  } catch (error) {
    console.error('[Broadcasts] Feature check error:', error);
    res.status(500).json({ error: 'שגיאה בבדיקת הרשאות' });
  }
};

// Feature check endpoint (before requireBroadcasts middleware)
router.get('/access', async (req, res) => {
  try {
    const userId = req.user.id;
    const featureCheck = await checkLimit(userId, 'allow_broadcasts');
    
    res.json({ 
      allowed: featureCheck.allowed,
      message: featureCheck.allowed ? 'יש לך גישה לשליחת הודעות תפוצה' : 'התוכנית שלך לא כוללת שליחת הודעות תפוצה'
    });
  } catch (error) {
    console.error('[Broadcasts] Access check error:', error);
    res.status(500).json({ error: 'שגיאה בבדיקת גישה' });
  }
});

// Apply feature check to all other routes
router.use(requireBroadcasts);

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

// Campaign stats & reports
router.get('/campaigns/:id/recipients', campaignsController.getCampaignRecipients);
router.get('/campaigns/:id/stats', campaignsController.getCampaignStats);
router.get('/campaigns/:id/progress', campaignsController.getCampaignProgress);
router.get('/campaigns/:id/report', campaignsController.getCampaignReport);

// ============================================
// Contact Import
// ============================================
router.post('/import/upload', importController.uploadFile);
router.post('/import/execute', importController.executeImport);
router.post('/import/cancel', importController.cancelImport);

// ============================================
// Automated Campaigns (Recurring/Scheduled)
// ============================================
router.get('/automated', automatedCampaignsController.getAutomatedCampaigns);
router.get('/automated/:id', automatedCampaignsController.getAutomatedCampaign);
router.post('/automated', automatedCampaignsController.createAutomatedCampaign);
router.get('/automated/executions', automatedCampaignsController.getActiveExecutions);
router.put('/automated/:id', automatedCampaignsController.updateAutomatedCampaign);
router.patch('/automated/:id/toggle', automatedCampaignsController.toggleAutomatedCampaign);
router.delete('/automated/:id', automatedCampaignsController.deleteAutomatedCampaign);
router.get('/automated/:id/runs', automatedCampaignsController.getCampaignRuns);
router.post('/automated/:id/run', automatedCampaignsController.runCampaignNow);

module.exports = router;
