const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const controller = require('../controllers/integrations/googleSheets.controller');

// OAuth callback - NO auth middleware (user redirected from Google)
router.get('/callback', controller.handleCallback);

// All other routes require authentication
router.use(authMiddleware);

// Connection management
router.get('/auth-url', controller.getAuthUrl);
router.get('/status', controller.getStatus);
router.post('/disconnect', controller.disconnect);

// Spreadsheet operations
router.get('/spreadsheets', controller.listSpreadsheets);
router.get('/spreadsheets/:id/sheets', controller.getSheets);
router.get('/spreadsheets/:id/headers', controller.getHeaders);
router.post('/spreadsheets/:id/read', controller.readRows);
router.post('/spreadsheets/:id/search', controller.searchRows);
router.post('/spreadsheets/:id/append', controller.appendRow);
router.post('/spreadsheets/:id/update', controller.updateRow);
router.post('/spreadsheets/:id/search-and-update', controller.searchAndUpdate);
router.post('/spreadsheets/:id/search-or-append', controller.searchOrAppend);

module.exports = router;
