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
const groupForwardsRoutes = require('./groupForwards.routes');
const broadcastsRoutes = require('./broadcasts.routes');

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
router.use('/group-forwards', groupForwardsRoutes);
router.use('/broadcasts', broadcastsRoutes);

// Public API (v1)
router.use('/v1', publicApiRoutes);

// Health check endpoint for deployment monitoring
router.get('/health', async (req, res) => {
  try {
    // Quick DB check
    const pool = require('../config/database');
    await pool.query('SELECT 1');
    
    res.json({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'unhealthy',
      error: error.message 
    });
  }
});

// System update alert - NO AUTH required (uses secret key)
// This endpoint is called by deploy script before server restart
router.post('/system/update-alert', async (req, res) => {
  try {
    const { secret, countdown } = req.body;
    
    // Verify secret key
    if (secret !== process.env.JWT_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { broadcastToAll } = require('../services/socket/manager.service');
    
    const sentTo = broadcastToAll('system_update', {
      title: 'עדכון מערכת',
      message: `המערכת תתעדכן בעוד ${countdown || 10} שניות. אנא שמור את העבודה שלך.`,
      countdown: countdown || 10,
      timestamp: new Date().toISOString()
    });
    
    console.log(`[System] Update alert sent to ${sentTo} users`);
    
    res.json({ 
      success: true, 
      sentTo,
      message: `Update alert sent to ${sentTo} online users`
    });
  } catch (error) {
    console.error('[System] Update alert error:', error);
    res.status(500).json({ error: 'Error sending update alert' });
  }
});

// Redirect /api to /developers (frontend page)
router.get('/', (req, res) => {
  res.redirect('/developers');
});

module.exports = router;
