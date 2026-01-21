const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const paymentController = require('../controllers/payment/payment.controller');

// All routes require authentication
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

// Payment history
router.get('/history', paymentController.getPaymentHistory);

module.exports = router;
