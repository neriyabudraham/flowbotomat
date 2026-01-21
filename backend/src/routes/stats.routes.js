const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const { getDashboardStats } = require('../controllers/stats/dashboard.controller');

router.use(authMiddleware);

router.get('/dashboard', getDashboardStats);

module.exports = router;
