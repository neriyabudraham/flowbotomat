const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const listController = require('../controllers/groupTransfers/list.controller');
const manageController = require('../controllers/groupTransfers/manage.controller');
const jobsController = require('../controllers/groupTransfers/jobs.controller');

// All routes require authentication
router.use(authMiddleware);

// =============================================
// List & View
// =============================================
router.get('/', listController.listGroupTransfers);
router.get('/groups', listController.getAvailableGroups);
router.get('/limit', listController.checkGroupTransferLimit);
router.get('/:transferId', listController.getGroupTransfer);

// =============================================
// Create, Update, Delete
// =============================================
router.post('/', manageController.createGroupTransfer);
router.put('/:transferId', manageController.updateGroupTransfer);
router.delete('/:transferId', manageController.deleteGroupTransfer);
router.post('/:transferId/duplicate', manageController.duplicateGroupTransfer);
router.post('/:transferId/toggle', manageController.toggleTransferActive);

// =============================================
// Targets & Senders
// =============================================
router.put('/:transferId/targets', manageController.updateTargets);
router.put('/:transferId/senders', manageController.updateAuthorizedSenders);

// =============================================
// Jobs (Transfer tasks)
// =============================================
router.get('/jobs/active', jobsController.getActiveJobs);
router.get('/jobs/pending', jobsController.getPendingJobs);
router.get('/jobs/history', jobsController.getAllJobHistory);
router.get('/:transferId/jobs', jobsController.getTransferJobHistory);
router.post('/:transferId/jobs', jobsController.createTransferJob);
router.get('/jobs/:jobId', jobsController.getJobStatus);
router.post('/jobs/:jobId/confirm', jobsController.confirmTransferJob);
router.post('/jobs/:jobId/stop', jobsController.stopTransferJob);
router.post('/jobs/:jobId/cancel', jobsController.cancelTransferJob);
router.post('/jobs/:jobId/retry-failed', jobsController.retryFailedMessages);
router.post('/jobs/:jobId/resume', jobsController.resumeTransferJob);
router.delete('/jobs/:jobId', jobsController.deleteJob);

module.exports = router;
