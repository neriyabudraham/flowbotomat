const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const plansController = require('../controllers/subscriptions/plans.controller');
const subscriptionsController = require('../controllers/subscriptions/subscriptions.controller');

// Public routes
router.get('/plans', plansController.getPlans);
router.get('/plans/:planId', plansController.getPlan);

// Protected routes
router.use(authMiddleware);

// User subscription routes
router.get('/my', subscriptionsController.getMySubscription);
router.get('/my/usage', subscriptionsController.getMyUsage);

// Admin routes
router.get('/all', subscriptionsController.getAllSubscriptions);
router.post('/assign', subscriptionsController.assignSubscription);
router.delete('/:subscriptionId', subscriptionsController.cancelSubscription);

// Plan management (admin)
router.post('/plans', plansController.createPlan);
router.put('/plans/:planId', plansController.updatePlan);
router.delete('/plans/:planId', plansController.deletePlan);

module.exports = router;
