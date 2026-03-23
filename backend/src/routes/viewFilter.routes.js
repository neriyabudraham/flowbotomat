const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const c = require('../controllers/viewFilter/viewFilter.controller');

router.use(auth);

// Campaign
router.get('/campaign',       c.getCampaign);
router.post('/campaign/start', c.startCampaign);

// Stats & viewers
router.get('/stats',                         c.getDashboardStats);
router.get('/certificate',                   c.downloadUserCertificate);
router.get('/viewers',                       c.getViewers);
router.get('/viewers/:phone/certificate',    c.downloadViewerCertificate);
router.get('/viewers/:phone',                c.getViewerProfile);
router.get('/gray-checkmarks',               c.getGrayCheckmarks);
router.get('/daily-growth',                  c.getDailyGrowth);

// Downloads
router.get('/download/contacts',     c.downloadContacts);
router.get('/download/report',       c.downloadReport);

// Google Contacts sync
router.get('/google/accounts',       c.getGoogleAccounts);
router.get('/google/auth-url',       c.getGoogleAuthUrl);
router.post('/google/sync',          c.syncToGoogle);

// Renewal pricing
router.get('/renewal-info',          c.getRenewalInfo);

// Campaign management
router.get('/campaigns',                    c.getCampaigns);
router.post('/campaigns/:campaignId/set-primary', c.setPrimary);
router.delete('/campaigns/:campaignId',     c.closeCampaign);

module.exports = router;
