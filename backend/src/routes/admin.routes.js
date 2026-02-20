const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const { adminMiddleware, superadminMiddleware } = require('../middlewares/admin.middleware');

// Controllers
const usersController = require('../controllers/admin/users.controller');
const settingsController = require('../controllers/admin/settings.controller');
const backupsController = require('../controllers/admin/backups.controller');
const promotionsController = require('../controllers/admin/promotions.controller');

// All admin routes require auth + admin role
router.use(authMiddleware);
router.use(adminMiddleware);

// Dashboard stats
router.get('/stats', usersController.getStats);

// Users management
router.get('/users', usersController.getUsers);
router.get('/users/:id', usersController.getUser);
router.put('/users/:id', usersController.updateUser);
router.put('/users/:id/subscription', usersController.updateUserSubscription);
router.get('/users/:id/feature-overrides', usersController.getUserFeatureOverrides);
router.put('/users/:id/feature-overrides', superadminMiddleware, usersController.updateUserFeatureOverrides);
router.get('/users/:id/services', usersController.getUserServices);
router.delete('/users/:id', superadminMiddleware, usersController.deleteUser);

// Plans for admin
router.get('/plans', usersController.getPlans);

// System settings (superadmin only for updates)
router.get('/settings', settingsController.getSettings);
router.put('/settings/:key', superadminMiddleware, settingsController.updateSetting);

// Logs
router.get('/logs', settingsController.getLogs);

// Backups (superadmin only)
router.get('/backups', superadminMiddleware, backupsController.listBackups);
router.post('/backups', superadminMiddleware, backupsController.createBackup);
router.get('/backups/:filename', superadminMiddleware, backupsController.downloadBackup);
router.delete('/backups/:filename', superadminMiddleware, backupsController.deleteBackup);

// Promotions (מבצעים אוטומטיים)
router.get('/promotions', promotionsController.getAllPromotions);
router.post('/promotions', superadminMiddleware, promotionsController.createPromotion);
router.put('/promotions/:promotionId', superadminMiddleware, promotionsController.updatePromotion);
router.delete('/promotions/:promotionId', superadminMiddleware, promotionsController.deletePromotion);

// Coupons (קודי קופון)
router.get('/coupons', promotionsController.getAllCoupons);
router.post('/coupons', superadminMiddleware, promotionsController.createCoupon);
router.put('/coupons/:couponId', superadminMiddleware, promotionsController.updateCoupon);
router.delete('/coupons/:couponId', superadminMiddleware, promotionsController.deleteCoupon);
router.get('/coupons/:couponId/stats', promotionsController.getCouponStats);

// Affiliate program (תוכנית שותפים)
router.get('/affiliate/settings', promotionsController.getAffiliateSettings);
router.put('/affiliate/settings', superadminMiddleware, promotionsController.updateAffiliateSettings);
router.get('/affiliate/stats', promotionsController.getAffiliateStats);
router.get('/affiliates/list', promotionsController.listAffiliates);
router.put('/affiliate/:affiliateId', superadminMiddleware, promotionsController.updateAffiliate);
router.post('/affiliate/create-all', superadminMiddleware, promotionsController.createAffiliatesForAllUsers);
router.post('/affiliate/payouts/:payoutId/process', superadminMiddleware, promotionsController.processPayoutRequest);
router.get('/affiliate/terms', promotionsController.getAffiliateTerms);
router.put('/affiliate/terms', superadminMiddleware, promotionsController.updateAffiliateTerms);

// Broadcast notifications (שליחת התראות לכל המשתמשים)
const { sendBroadcastNotification } = require('../services/usageAlerts.service');
const { broadcastToAll, getConnectedUsersCount, getConnectedUsersInfo } = require('../services/socket/manager.service');
const db = require('../config/database');

router.post('/notifications/broadcast', superadminMiddleware, async (req, res) => {
  try {
    const { title, message, type, sendEmail, emailSubject } = req.body;
    
    if (!title || !message) {
      return res.status(400).json({ error: 'נדרש כותרת והודעה' });
    }
    
    const result = await sendBroadcastNotification(
      title, 
      message, 
      type || 'broadcast',
      sendEmail || false,
      emailSubject
    );
    
    res.json({ 
      success: true, 
      sentTo: result.sentTo,
      emailsSent: result.emailsSent || 0
    });
  } catch (error) {
    console.error('[Admin] Broadcast notification error:', error);
    res.status(500).json({ error: 'שגיאה בשליחת התראה' });
  }
});

// Real-time notification to online users only (via Socket.io)
router.post('/notifications/realtime', superadminMiddleware, async (req, res) => {
  try {
    const { title, message, type, autoDismiss } = req.body;
    
    if (!title || !message) {
      return res.status(400).json({ error: 'נדרש כותרת והודעה' });
    }
    
    const sentTo = broadcastToAll('system_alert', {
      title,
      message,
      type: type || 'info',
      autoDismiss: autoDismiss || false,
      timestamp: new Date().toISOString()
    });
    
    res.json({ 
      success: true, 
      sentTo,
      message: `ההתראה נשלחה ל-${sentTo} משתמשים מחוברים`
    });
  } catch (error) {
    console.error('[Admin] Realtime notification error:', error);
    res.status(500).json({ error: 'שגיאה בשליחת התראה' });
  }
});

// Get online users count
router.get('/notifications/online-count', adminMiddleware, async (req, res) => {
  try {
    const count = getConnectedUsersCount();
    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: 'שגיאה' });
  }
});

// Get online users with details
router.get('/notifications/online-users', adminMiddleware, async (req, res) => {
  try {
    const connectedInfo = getConnectedUsersInfo();
    
    if (connectedInfo.length === 0) {
      return res.json({ users: [], count: 0 });
    }
    
    // Get user details from database
    const userIds = connectedInfo.map(u => u.userId);
    const usersResult = await db.query(`
      SELECT id, email, name 
      FROM users 
      WHERE id = ANY($1)
    `, [userIds]);
    
    const usersMap = new Map();
    usersResult.rows.forEach(user => {
      usersMap.set(user.id, user);
    });
    
    const users = connectedInfo.map(info => {
      const user = usersMap.get(info.userId);
      return {
        id: info.userId,
        email: user?.email || 'לא ידוע',
        name: user?.name || 'משתמש',
        connectedAt: info.connectedAt,
        socketCount: info.socketCount
      };
    });
    
    res.json({ users, count: users.length });
  } catch (error) {
    console.error('[Admin] Get online users error:', error);
    res.status(500).json({ error: 'שגיאה' });
  }
});

// System update notification - can be called without auth (for deploy script)
// Uses a secret key for authentication
router.post('/system/update-alert', async (req, res) => {
  try {
    const { secret, countdown } = req.body;
    
    // Verify secret key (use JWT_SECRET as the key)
    if (secret !== process.env.JWT_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const sentTo = broadcastToAll('system_update', {
      title: '🔄 עדכון מערכת',
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

module.exports = router;
