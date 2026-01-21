const express = require('express');
const router = express.Router();

const { signup } = require('../controllers/auth/signup.controller');
const { verify } = require('../controllers/auth/verify.controller');
const { login } = require('../controllers/auth/login.controller');
const { refresh } = require('../controllers/auth/refresh.controller');
const { me } = require('../controllers/auth/me.controller');
const { resendVerification } = require('../controllers/auth/resend.controller');
const authMiddleware = require('../middlewares/auth.middleware');

// Public routes
router.post('/signup', signup);
router.post('/verify', verify);
router.post('/login', login);
router.post('/refresh', refresh);
router.post('/resend-verification', resendVerification);

// Protected routes
router.get('/me', authMiddleware, me);

module.exports = router;
