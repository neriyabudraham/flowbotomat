const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth.middleware');
const configController = require('../controllers/broadcastAdmin/config.controller');

// All routes require authentication
router.use(authenticate);

// Get admin config
router.get('/config', configController.getAdminConfig);

// Set/update admin config
router.post('/config', configController.setAdminConfig);

// Delete admin config
router.delete('/config', configController.deleteAdminConfig);

// Get pending approval requests
router.get('/approvals', configController.getPendingApprovals);

module.exports = router;
