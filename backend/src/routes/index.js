const express = require('express');
const router = express.Router();

// Import route modules
const authRoutes = require('./auth.routes');

// Mount routes
router.use('/auth', authRoutes);

// Placeholder for future routes
// router.use('/flows', flowRoutes);
// router.use('/triggers', triggerRoutes);
// router.use('/contacts', contactRoutes);
// router.use('/instances', instanceRoutes);
// router.use('/chat', chatRoutes);
// router.use('/admin', adminRoutes);

module.exports = router;
