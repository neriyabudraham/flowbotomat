const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const authMiddleware = require('../middlewares/auth.middleware');
const { adminMiddleware, superadminMiddleware } = require('../middlewares/admin.middleware');
const statusBotController = require('../controllers/statusBot/statusBot.controller');
const settingsController = require('../controllers/admin/settings.controller');
const importedContactsController = require('../controllers/statusBot/importedContacts.controller');

// In-memory upload for CSV/VCF parsing (20MB cap)
const contactsUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
}).single('file');

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
// PUBLIC ROUTES (no auth)
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
router.patch('/settings', authMiddleware, statusBotController.updateSettings);

// Authorized numbers
router.get('/authorized-numbers', authMiddleware, statusBotController.getAuthorizedNumbers);
router.post('/authorized-numbers', authMiddleware, statusBotController.addAuthorizedNumber);
router.delete('/authorized-numbers/:numberId', authMiddleware, statusBotController.removeAuthorizedNumber);
router.patch('/authorized-numbers/:numberId/can-import', authMiddleware, statusBotController.updateAuthorizedCanImport);

// Status upload
router.post('/status/text', authMiddleware, statusBotController.uploadTextStatus);
router.post('/status/image', authMiddleware, statusUpload, statusBotController.uploadImageStatus);
router.post('/status/video', authMiddleware, statusUpload, statusBotController.uploadVideoStatus);
router.post('/status/voice', authMiddleware, statusUpload, statusBotController.uploadVoiceStatus);
router.delete('/status/:statusId', authMiddleware, statusBotController.deleteStatus);

// Video processing (for split)
router.post('/video/analyze', authMiddleware, statusUpload, statusBotController.analyzeVideo);
router.post('/video/split', authMiddleware, statusUpload, statusBotController.processVideoSplit);

// History
router.get('/history', authMiddleware, statusBotController.getStatusHistory);
router.get('/history/:statusId', authMiddleware, statusBotController.getStatusDetails);
router.get('/status/:statusId/details', authMiddleware, statusBotController.getStatusDetails);

// Queue
router.get('/queue', authMiddleware, statusBotController.getQueueStatus);
router.delete('/queue/:queueId', authMiddleware, statusBotController.deleteQueueItem);
router.post('/queue/:queueId/send-now', authMiddleware, statusBotController.sendQueueItemNow);
router.patch('/queue/:queueId', authMiddleware, statusBotController.updateQueueItem);
router.post('/queue/reorder', authMiddleware, statusBotController.reorderQueueItems);

// Failed/cancelled statuses
router.get('/failed', authMiddleware, statusBotController.getFailedStatuses);
router.post('/failed/:queueId/retry', authMiddleware, statusBotController.retryFailedStatus);
router.put('/failed/:queueId', authMiddleware, statusBotController.updateAndRetryStatus);
router.delete('/failed/:queueId', authMiddleware, statusBotController.deleteFailedStatus);

// In-progress statuses
router.get('/in-progress', authMiddleware, statusBotController.getInProgressStatuses);
router.post('/in-progress/:queueId/cancel', authMiddleware, statusBotController.forceCancelProcessing);

// Pending statuses (from WhatsApp bot conversations)
router.get('/pending-statuses', authMiddleware, statusBotController.getPendingStatuses);
router.post('/pending-statuses/:statusId/send', authMiddleware, statusBotController.sendPendingStatus);
router.post('/pending-statuses/:statusId/schedule', authMiddleware, statusBotController.schedulePendingStatus);
router.delete('/pending-statuses/:statusId', authMiddleware, statusBotController.cancelPendingStatus);

// Contacts cache refresh
router.post('/contacts/refresh', authMiddleware, statusBotController.refreshContactsCache);

// Imported contacts (manual / CSV / VCF / Google) — only for contacts format
router.get('/imported-contacts', authMiddleware, importedContactsController.list);
router.post('/imported-contacts/preview', authMiddleware, contactsUpload, importedContactsController.preview);
router.post('/imported-contacts/import', authMiddleware, contactsUpload, importedContactsController.importContacts);
router.post('/imported-contacts/add', authMiddleware, importedContactsController.addOne);
router.delete('/imported-contacts/:id', authMiddleware, importedContactsController.removeOne);
router.delete('/imported-contacts', authMiddleware, importedContactsController.clearAll);
router.patch('/imported-contacts/toggle', authMiddleware, importedContactsController.toggleUse);
// Google Contacts sync
router.get('/imported-contacts/google/status', authMiddleware, importedContactsController.googleStatus);
router.post('/imported-contacts/google/preview', authMiddleware, importedContactsController.googlePreview);
router.post('/imported-contacts/google/import', authMiddleware, importedContactsController.googleImport);

// User colors management
router.get('/colors', authMiddleware, settingsController.getStatusBotColors);
router.put('/colors', authMiddleware, settingsController.updateStatusBotColors);
router.delete('/colors', authMiddleware, settingsController.resetStatusBotColors);

// ============================================
// ADMIN ROUTES
// ============================================

router.get('/admin/users', authMiddleware, adminMiddleware, statusBotController.adminGetUsers);
router.get('/admin/upload-stats', authMiddleware, adminMiddleware, statusBotController.adminGetUploadStats);
router.get('/admin/stats', authMiddleware, adminMiddleware, statusBotController.adminGetStats);
router.get('/admin/active-processes', authMiddleware, adminMiddleware, statusBotController.adminGetActiveProcesses);
router.post('/admin/lift-restriction/:connectionId', authMiddleware, superadminMiddleware, statusBotController.adminLiftRestriction);
router.post('/admin/reset-queue', authMiddleware, adminMiddleware, statusBotController.adminResetQueueLock);
router.post('/admin/cancel-item/:queueId', authMiddleware, adminMiddleware, statusBotController.adminForceCancelItem);
router.post('/admin/stop-item/:queueId', authMiddleware, adminMiddleware, statusBotController.adminForceStopItem);
router.post('/admin/resume-item/:queueId', authMiddleware, adminMiddleware, statusBotController.adminResumeQueueItem);
router.patch('/admin/retry-cancel/:queueId', authMiddleware, adminMiddleware, statusBotController.adminToggleRetryCancelled);
router.post('/admin/sync-phones', authMiddleware, adminMiddleware, statusBotController.adminSyncPhoneNumbers);
router.get('/admin/queue-settings', authMiddleware, adminMiddleware, statusBotController.adminGetQueueSettings);
router.patch('/admin/queue-settings', authMiddleware, adminMiddleware, statusBotController.adminUpdateQueueSettings);
router.patch('/admin/user/:connectionId/set-restriction', authMiddleware, superadminMiddleware, statusBotController.adminSetRestriction);
router.patch('/admin/user/:connectionId/send-format', authMiddleware, superadminMiddleware, statusBotController.adminSetSendFormat);
router.patch('/admin/user/:connectionId/viewers-first', authMiddleware, superadminMiddleware, statusBotController.adminSetViewersFirstMode);

// Admin status detail endpoints
router.get('/admin/status/:statusId/details', authMiddleware, adminMiddleware, statusBotController.adminGetStatusDetails);
router.get('/admin/queue-item/:queueId/details', authMiddleware, adminMiddleware, statusBotController.adminGetQueueItemDetails);

// Admin queue management (specific routes MUST come before :queueId param route)
router.get('/admin/queue/all', authMiddleware, adminMiddleware, statusBotController.adminGetAllQueueItems);
router.post('/admin/queue/bulk-cancel', authMiddleware, adminMiddleware, statusBotController.adminBulkCancelQueue);
router.get('/admin/queue/pause', authMiddleware, adminMiddleware, statusBotController.adminGetQueuePauseStatus);
router.post('/admin/queue/pause', authMiddleware, adminMiddleware, statusBotController.adminPauseQueue);
router.delete('/admin/queue/pause', authMiddleware, adminMiddleware, statusBotController.adminResumeQueue);
router.delete('/admin/queue/:queueId', authMiddleware, adminMiddleware, statusBotController.adminCancelQueueItem);
router.post('/admin/restrict-all-users', authMiddleware, superadminMiddleware, statusBotController.adminRestrictAllUsers);
router.post('/admin/unrestrict-all-users', authMiddleware, superadminMiddleware, statusBotController.adminUnrestrictAllUsers);

// User-specific admin routes
router.get('/admin/user/:connectionId/errors', authMiddleware, adminMiddleware, statusBotController.adminGetUserErrors);
router.get('/admin/user/:connectionId/details', authMiddleware, adminMiddleware, statusBotController.adminGetUserDetails);
router.delete('/admin/user/:connectionId/errors', authMiddleware, adminMiddleware, statusBotController.adminClearUserErrors);
router.post('/admin/user/:connectionId/retry-errors', authMiddleware, adminMiddleware, statusBotController.adminRetryUserErrors);

module.exports = router;
