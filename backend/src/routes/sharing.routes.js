const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const sharesController = require('../controllers/sharing/shares.controller');

// All routes require authentication
router.use(authMiddleware);

// Get bots shared with me
router.get('/shared-with-me', sharesController.getSharedWithMe);

// Get shares for a specific bot
router.get('/bot/:botId', sharesController.getBotShares);

// Check if user can activate a shared bot
router.get('/can-activate/:botId', sharesController.canActivateSharedBot);

// Share a bot
router.post('/bot/:botId', sharesController.shareBot);

// Update share permission
router.put('/:shareId', sharesController.updateShare);

// Remove share
router.delete('/:shareId', sharesController.removeShare);

// Accept invitation
router.post('/invitation/:token/accept', sharesController.acceptInvitation);

module.exports = router;
