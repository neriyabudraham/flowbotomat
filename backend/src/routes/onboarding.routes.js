const express = require('express');
const router = express.Router();
const { getStatus, getWhatsappQR, getGoogleContactsUrl, getGoogleSheetsUrl, requestWhatsappCode } = require('../controllers/public/onboarding.controller');

// All routes are public (no auth middleware)
router.get('/:userId/status', getStatus);
router.get('/:userId/whatsapp/qr', getWhatsappQR);
router.post('/:userId/whatsapp/request-code', requestWhatsappCode);
router.get('/:userId/google-contacts/url', getGoogleContactsUrl);
router.get('/:userId/google-sheets/url', getGoogleSheetsUrl);

module.exports = router;
