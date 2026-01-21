const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const { adminMiddleware } = require('../middlewares/admin.middleware');
const templatesController = require('../controllers/templates/templates.controller');

// Public routes (still need auth to track usage)
router.use(authMiddleware);

// User routes
router.get('/', templatesController.getTemplates);
router.get('/categories', templatesController.getCategories);
router.get('/:id', templatesController.getTemplate);
router.post('/:id/use', templatesController.useTemplate);

// Admin routes
router.get('/admin/all', adminMiddleware, templatesController.adminGetTemplates);
router.post('/admin', adminMiddleware, templatesController.createTemplate);
router.put('/admin/:id', adminMiddleware, templatesController.updateTemplate);
router.delete('/admin/:id', adminMiddleware, templatesController.deleteTemplate);
router.post('/admin/from-bot/:botId', adminMiddleware, templatesController.createFromBot);

module.exports = router;
