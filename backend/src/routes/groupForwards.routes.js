const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const listController = require('../controllers/groupForwards/list.controller');
const manageController = require('../controllers/groupForwards/manage.controller');
const jobsController = require('../controllers/groupForwards/jobs.controller');
const scheduledController = require('../controllers/groupForwards/scheduled.controller');

// All routes require authentication
router.use(authMiddleware);

// =============================================
// List & View (specific routes first)
// =============================================
router.get('/', listController.listGroupForwards);
router.get('/groups', listController.getAvailableGroups); // Get WhatsApp groups
router.get('/limit', listController.checkGroupForwardLimit);

// =============================================
// Scheduled Forwards (MUST come before /:forwardId routes)
// =============================================
router.get('/scheduled', scheduledController.getScheduledForwards);
router.post('/scheduled', scheduledController.createScheduledForward);
router.put('/scheduled/:id', scheduledController.updateScheduledForward);
router.delete('/scheduled/:id', scheduledController.deleteScheduledForward);

// =============================================
// Jobs (Forwarding tasks) - specific routes first
// =============================================
router.get('/jobs/active', jobsController.getActiveJobs);
router.get('/jobs/pending', jobsController.getPendingJobs);
router.get('/jobs/history', jobsController.getAllJobHistory);
router.get('/jobs/:jobId', jobsController.getJobStatus);
router.post('/jobs/:jobId/confirm', jobsController.confirmForwardJob);
router.post('/jobs/:jobId/stop', jobsController.stopForwardJob);
router.post('/jobs/:jobId/cancel', jobsController.cancelForwardJob);
router.post('/jobs/:jobId/retry-failed', jobsController.retryFailedMessages);
router.post('/jobs/:jobId/resume', jobsController.resumeForwardJob);
router.delete('/jobs/:jobId', jobsController.deleteJob);

// =============================================
// Single Forward by ID (MUST come after specific routes)
// =============================================
router.get('/:forwardId', listController.getGroupForward);

// =============================================
// Create, Update, Delete
// =============================================
router.post('/', manageController.createGroupForward);
router.put('/:forwardId', manageController.updateGroupForward);
router.delete('/:forwardId', manageController.deleteGroupForward);
router.post('/:forwardId/duplicate', manageController.duplicateGroupForward);
router.post('/:forwardId/toggle', manageController.toggleForwardActive);

// =============================================
// Targets & Senders
// =============================================
router.put('/:forwardId/targets', manageController.updateTargets);
router.put('/:forwardId/senders', manageController.updateAuthorizedSenders);

// =============================================
// Forward-specific jobs
// =============================================
router.get('/:forwardId/jobs', jobsController.getForwardJobHistory);
router.post('/:forwardId/jobs', jobsController.createForwardJob);

module.exports = router;
