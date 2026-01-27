const express = require('express');
const router = express.Router();

const { signup } = require('../controllers/auth/signup.controller');
const { verify } = require('../controllers/auth/verify.controller');
const { login } = require('../controllers/auth/login.controller');
const { refresh } = require('../controllers/auth/refresh.controller');
const { me } = require('../controllers/auth/me.controller');
const { resendVerification } = require('../controllers/auth/resend.controller');
const { googleAuth, googleCallback } = require('../controllers/auth/google.controller');
const { forgotPassword } = require('../controllers/auth/forgot-password.controller');
const { verifyResetToken, resetPassword } = require('../controllers/auth/reset-password.controller');
const authMiddleware = require('../middlewares/auth.middleware');

// Public routes
router.post('/signup', signup);
router.post('/verify', verify);
router.post('/login', login);
router.post('/refresh', refresh);
router.post('/resend-verification', resendVerification);
router.post('/google', googleAuth);
router.get('/google/callback', googleCallback);

// Password reset routes
router.post('/forgot-password', forgotPassword);
router.post('/verify-reset-token', verifyResetToken);
router.post('/reset-password', resetPassword);

// Protected routes
router.get('/me', authMiddleware, me);

module.exports = router;
