const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const authMiddleware = require('../middlewares/auth.middleware');
const { adminMiddleware, superadminMiddleware } = require('../middlewares/admin.middleware');
const statusBotController = require('../controllers/statusBot/statusBot.controller');

// Configure multer for status bot uploads
const uploadsDir = path.join(__dirname, '../../uploads/status-bot');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueId = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${uniqueId}${ext}`);
  }
});

const statusUpload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'video/mp4', 'video/webm', 'video/quicktime',
      'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/mp4', 'audio/aac'
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`סוג קובץ לא נתמך: ${file.mimetype}`), false);
    }
  }
}).single('file');

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
router.post('/status/image', authMiddleware, statusUpload, statusBotController.uploadImageStatus);
router.post('/status/video', authMiddleware, statusUpload, statusBotController.uploadVideoStatus);
router.post('/status/voice', authMiddleware, statusUpload, statusBotController.uploadVoiceStatus);
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
