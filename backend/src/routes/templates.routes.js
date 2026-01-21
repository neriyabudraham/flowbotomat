const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const { adminMiddleware } = require('../middlewares/admin.middleware');
const templatesController = require('../controllers/templates/templates.controller');

// Public routes (still need auth to track usage)
router.use(authMiddleware);

// User routes - IMPORTANT: Static routes must come before dynamic :id routes
router.get('/', templatesController.getTemplates);
router.get('/categories', templatesController.getCategories);
router.get('/my-templates', templatesController.getMyTemplates);
router.post('/submit', templatesController.submitTemplate);

// Dynamic :id routes must come AFTER static routes
router.get('/:id', templatesController.getTemplate);
router.get('/:id/my-rating', templatesController.getMyRating);
router.post('/:id/use', templatesController.useTemplate);
router.post('/:id/rate', templatesController.rateTemplate);

// Admin routes
router.get('/admin/all', adminMiddleware, templatesController.adminGetTemplates);
router.post('/admin', adminMiddleware, templatesController.createTemplate);
router.put('/admin/:id', adminMiddleware, templatesController.updateTemplate);
router.delete('/admin/:id', adminMiddleware, templatesController.deleteTemplate);
router.post('/admin/from-bot/:botId', adminMiddleware, templatesController.createFromBot);
router.post('/admin/:id/approve', adminMiddleware, templatesController.approveTemplate);
router.post('/admin/:id/reject', adminMiddleware, templatesController.rejectTemplate);

module.exports = router;
