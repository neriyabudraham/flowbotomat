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
const validationsRoutes = require('./validations.routes');
const adminRoutes = require('./admin.routes');
const sharingRoutes = require('./sharing.routes');
const notificationsRoutes = require('./notifications.routes');
const expertsRoutes = require('./experts.routes');
const subscriptionsRoutes = require('./subscriptions.routes');
const paymentRoutes = require('./payment.routes');
const uploadRoutes = require('./upload.routes');
const apiKeysRoutes = require('./apiKeys.routes');
const publicApiRoutes = require('./publicApi.routes');

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
router.use('/validations', validationsRoutes);
router.use('/admin', adminRoutes);
router.use('/sharing', sharingRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/experts', expertsRoutes);
router.use('/subscriptions', subscriptionsRoutes);
router.use('/payment', paymentRoutes);
router.use('/upload', uploadRoutes);
router.use('/api-keys', apiKeysRoutes);

// Public API (v1)
router.use('/v1', publicApiRoutes);

// API Info at root /api
router.get('/', (req, res) => {
  res.json({
    name: 'FlowBotomat API',
    version: '1.0.0',
    documentation: 'https://flow.botomat.co.il/api',
    endpoints: {
      messages: {
        text: 'POST /api/v1/messages/text',
        image: 'POST /api/v1/messages/image',
        video: 'POST /api/v1/messages/video',
        document: 'POST /api/v1/messages/document',
        audio: 'POST /api/v1/messages/audio',
        list: 'POST /api/v1/messages/list',
        location: 'POST /api/v1/messages/location',
      },
      contacts: {
        list: 'GET /api/v1/contacts',
        messages: 'GET /api/v1/contacts/:phone/messages',
      },
      status: 'GET /api/v1/status',
    },
    authentication: 'Bearer token in Authorization header',
    baseUrl: 'https://flow.botomat.co.il/api/v1',
  });
});

module.exports = router;
