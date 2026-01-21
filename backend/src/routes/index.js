const express = require('express');
const router = express.Router();

// Import route modules
const authRoutes = require('./auth.routes');
const whatsappRoutes = require('./whatsapp.routes');

// Mount routes
router.use('/auth', authRoutes);
router.use('/whatsapp', whatsappRoutes);

module.exports = router;
