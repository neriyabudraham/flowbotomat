const express = require('express');
const router = express.Router();

// Placeholder controllers - will be implemented
// const signupController = require('../controllers/auth/signup.controller');
// const loginController = require('../controllers/auth/login.controller');

// POST /api/auth/signup
router.post('/signup', (req, res) => {
  res.json({ message: 'Signup endpoint - TODO' });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  res.json({ message: 'Login endpoint - TODO' });
});

// POST /api/auth/verify
router.post('/verify', (req, res) => {
  res.json({ message: 'Verify endpoint - TODO' });
});

// POST /api/auth/refresh
router.post('/refresh', (req, res) => {
  res.json({ message: 'Refresh endpoint - TODO' });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  res.json({ message: 'Me endpoint - TODO' });
});

module.exports = router;
