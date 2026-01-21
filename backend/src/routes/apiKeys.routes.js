const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const { 
  getApiKeys, 
  createApiKey, 
  updateApiKey, 
  deleteApiKey, 
  getApiStats,
  regenerateApiKey
} = require('../controllers/api/keys.controller');

// All routes require authentication
router.use(authMiddleware);

// List all API keys
router.get('/', getApiKeys);

// Create new API key
router.post('/', createApiKey);

// Get API key stats
router.get('/:keyId/stats', getApiStats);

// Update API key
router.patch('/:keyId', updateApiKey);

// Regenerate API key
router.post('/:keyId/regenerate', regenerateApiKey);

// Delete API key
router.delete('/:keyId', deleteApiKey);

module.exports = router;
