const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const listController = require('../controllers/groupForwards/list.controller');
const manageController = require('../controllers/groupForwards/manage.controller');
const jobsController = require('../controllers/groupForwards/jobs.controller');

// All routes require authentication
router.use(authMiddleware);

// =============================================
// List & View
// =============================================
router.get('/', listController.listGroupForwards);
router.get('/groups', listController.getAvailableGroups); // Get WhatsApp groups
router.get('/limit', listController.checkGroupForwardLimit);
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
// Jobs (Forwarding tasks)
// =============================================
router.get('/jobs/active', jobsController.getActiveJobs);
router.get('/jobs/history', jobsController.getAllJobHistory); // All job history for user
router.get('/:forwardId/jobs', jobsController.getForwardJobHistory);
router.post('/:forwardId/jobs', jobsController.createForwardJob);
router.get('/jobs/:jobId', jobsController.getJobStatus);
router.post('/jobs/:jobId/confirm', jobsController.confirmForwardJob);
router.post('/jobs/:jobId/stop', jobsController.stopForwardJob);
router.post('/jobs/:jobId/cancel', jobsController.cancelForwardJob);

module.exports = router;
