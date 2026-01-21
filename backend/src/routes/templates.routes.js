const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const { 
  getTemplates, 
  getTemplate, 
  createTemplate, 
  installTemplate,
  deleteTemplate 
} = require('../controllers/templates/templates.controller');

// Public routes (with optional auth for personalization)
router.get('/', authMiddleware, getTemplates);
router.get('/:id', authMiddleware, getTemplate);

// Protected routes
router.post('/', authMiddleware, createTemplate);
router.post('/:id/install', authMiddleware, installTemplate);
router.delete('/:id', authMiddleware, deleteTemplate);

module.exports = router;
