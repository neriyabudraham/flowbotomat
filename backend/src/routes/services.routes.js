const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const { adminMiddleware, superadminMiddleware } = require('../middlewares/admin.middleware');
const servicesController = require('../controllers/services/services.controller');

// ============================================
// PUBLIC ROUTES
// ============================================

// Get all active services
router.get('/', servicesController.getServices);

// ============================================
// USER ROUTES (auth required)
// ============================================

// Get my service subscriptions
router.get('/my', authMiddleware, servicesController.getMyServices);

// Check access to a specific service by slug
router.get('/access/:slug', authMiddleware, servicesController.checkServiceAccess);

// Subscribe to a service
router.post('/:serviceId/subscribe', authMiddleware, servicesController.subscribeToService);

// Cancel subscription
router.post('/:serviceId/cancel', authMiddleware, servicesController.cancelSubscription);

// Get service usage
router.get('/:serviceId/usage', authMiddleware, servicesController.getServiceUsage);

// ============================================
// ADMIN ROUTES
// ============================================

// Get all services (including inactive)
router.get('/admin/all', authMiddleware, adminMiddleware, servicesController.adminGetServices);

// Create service (superadmin only)
router.post('/admin', authMiddleware, superadminMiddleware, servicesController.adminCreateService);

// Update service (superadmin only)
router.put('/admin/:serviceId', authMiddleware, superadminMiddleware, servicesController.adminUpdateService);

// Delete service (superadmin only)
router.delete('/admin/:serviceId', authMiddleware, superadminMiddleware, servicesController.adminDeleteService);

// Get service subscriptions
router.get('/admin/:serviceId/subscriptions', authMiddleware, adminMiddleware, servicesController.adminGetServiceSubscriptions);

// Grant custom trial to user
router.post('/admin/:serviceId/trial', authMiddleware, superadminMiddleware, servicesController.adminGrantTrial);

// Assign subscription to user
router.post('/admin/:serviceId/assign', authMiddleware, superadminMiddleware, servicesController.adminAssignSubscription);

// Cancel user's subscription (admin)
router.post('/admin/:serviceId/cancel/:userId', authMiddleware, superadminMiddleware, servicesController.adminCancelSubscription);

module.exports = router;
