const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const { adminMiddleware, superadminMiddleware } = require('../middlewares/admin.middleware');
const statusBotController = require('../controllers/statusBot/statusBot.controller');

// ============================================
// PUBLIC WEBHOOK (no auth)
// ============================================

// WAHA webhook endpoint
router.post('/webhook/:userId', statusBotController.handleWebhook);

// ============================================
// USER ROUTES (auth required)
// ============================================

// Connection management
router.get('/connection', authMiddleware, statusBotController.getConnection);
router.get('/check-existing', authMiddleware, statusBotController.checkExisting);
router.post('/connect', authMiddleware, statusBotController.startConnection);
router.get('/qr', authMiddleware, statusBotController.getQR);
router.post('/disconnect', authMiddleware, statusBotController.disconnect);

// Authorized numbers
router.get('/authorized-numbers', authMiddleware, statusBotController.getAuthorizedNumbers);
router.post('/authorized-numbers', authMiddleware, statusBotController.addAuthorizedNumber);
router.delete('/authorized-numbers/:numberId', authMiddleware, statusBotController.removeAuthorizedNumber);

// Status upload
router.post('/status/text', authMiddleware, statusBotController.uploadTextStatus);
router.post('/status/image', authMiddleware, statusBotController.uploadImageStatus);
router.post('/status/video', authMiddleware, statusBotController.uploadVideoStatus);
router.post('/status/voice', authMiddleware, statusBotController.uploadVoiceStatus);
router.delete('/status/:statusId', authMiddleware, statusBotController.deleteStatus);

// History
router.get('/history', authMiddleware, statusBotController.getStatusHistory);
router.get('/history/:statusId', authMiddleware, statusBotController.getStatusDetails);

// Queue
router.get('/queue', authMiddleware, statusBotController.getQueueStatus);

// ============================================
// ADMIN ROUTES
// ============================================

router.get('/admin/users', authMiddleware, adminMiddleware, statusBotController.adminGetUsers);
router.get('/admin/stats', authMiddleware, adminMiddleware, statusBotController.adminGetStats);
router.post('/admin/lift-restriction/:connectionId', authMiddleware, superadminMiddleware, statusBotController.adminLiftRestriction);

module.exports = router;
