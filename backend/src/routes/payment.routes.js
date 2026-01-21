const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const paymentController = require('../controllers/payment/payment.controller');

// All routes require authentication
router.use(authMiddleware);

// Payment methods
router.get('/methods', paymentController.getPaymentMethods);
router.post('/methods', paymentController.savePaymentMethod);
router.delete('/methods/:methodId', paymentController.deletePaymentMethod);
router.get('/methods/check', paymentController.checkPaymentMethod);

// Subscription
router.post('/subscribe', paymentController.subscribe);
router.post('/cancel', paymentController.cancelSubscription);

// Payment history
router.get('/history', paymentController.getPaymentHistory);

module.exports = router;
