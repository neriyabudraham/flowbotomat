const express = require('express');
const router = express.Router();
const {
  getStatus, getWhatsappQR, getGoogleContactsUrl, getGoogleSheetsUrl, requestWhatsappCode,
  listGoogleContactsAccounts, setGoogleContactsPrimary, disconnectGoogleContactsSlot,
} = require('../controllers/public/onboarding.controller');

// All routes are public (no auth middleware)
router.get('/:userId/status', getStatus);
router.get('/:userId/whatsapp/qr', getWhatsappQR);
router.post('/:userId/whatsapp/request-code', requestWhatsappCode);
router.get('/:userId/google-contacts/url', getGoogleContactsUrl);
router.get('/:userId/google-contacts/accounts', listGoogleContactsAccounts);
router.post('/:userId/google-contacts/accounts/:slot/primary', setGoogleContactsPrimary);
router.delete('/:userId/google-contacts/accounts/:slot', disconnectGoogleContactsSlot);
router.get('/:userId/google-sheets/url', getGoogleSheetsUrl);

module.exports = router;
