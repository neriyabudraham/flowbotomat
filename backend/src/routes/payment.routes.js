const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const paymentController = require('../controllers/payment/payment.controller');
const promotionsController = require('../controllers/admin/promotions.controller');

// Public routes (no auth required)
router.get('/promotions/active', promotionsController.getActivePromotions);

// Routes that require authentication
router.use(authMiddleware);

// Payment methods
router.get('/methods', paymentController.getPaymentMethods);
router.post('/methods', paymentController.savePaymentMethod);
router.get('/methods/check', paymentController.checkPaymentMethod);
router.delete('/methods/remove-all', paymentController.removeAllPaymentMethods); // Must be before :methodId
router.delete('/methods/:methodId', paymentController.deletePaymentMethod);

// Subscription
router.post('/subscribe', paymentController.subscribe);
router.post('/cancel', paymentController.cancelSubscription);
router.post('/reactivate', paymentController.reactivateSubscription);

// Plan change (upgrade/downgrade)
router.post('/plan/calculate', paymentController.calculatePlanChange);
router.post('/plan/change', paymentController.changePlan);

// Payment history
router.get('/history', paymentController.getPaymentHistory);

// Coupon validation (requires auth to check user status)
router.post('/coupon/validate', promotionsController.validateCoupon);

// Referral system (user)
router.get('/referral/my', promotionsController.getUserReferral);
router.post('/referral/redeem', promotionsController.redeemCredits);

module.exports = router;
