const express = require('express');
const router = express.Router();

// Import route modules
const authRoutes = require('./auth.routes');
const whatsappRoutes = require('./whatsapp.routes');
const webhookRoutes = require('./webhook.routes');
const contactsRoutes = require('./contacts.routes');
const statsRoutes = require('./stats.routes');
const userRoutes = require('./user.routes');
const botsRoutes = require('./bots.routes');
const utilsRoutes = require('./utils.routes');
const variablesRoutes = require('./variables.routes');
const templatesRoutes = require('./templates.routes');

// Mount routes
router.use('/auth', authRoutes);
router.use('/whatsapp', whatsappRoutes);
router.use('/webhook', webhookRoutes);
router.use('/contacts', contactsRoutes);
router.use('/stats', statsRoutes);
router.use('/user', userRoutes);
router.use('/bots', botsRoutes);
router.use('/utils', utilsRoutes);
router.use('/variables', variablesRoutes);
router.use('/templates', templatesRoutes);

module.exports = router;
