const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const { adminMiddleware, superadminMiddleware } = require('../middlewares/admin.middleware');

// Controllers
const usersController = require('../controllers/admin/users.controller');
const settingsController = require('../controllers/admin/settings.controller');
const backupsController = require('../controllers/admin/backups.controller');
const promotionsController = require('../controllers/admin/promotions.controller');
const billingController = require('../controllers/admin/billing.controller');
const wahaSourcesController = require('../controllers/admin/waha-sources.controller');
const proxySourcesController = require('../controllers/admin/proxy-sources.controller');

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
router.get('/users/:id/bots', usersController.getUserBots);
router.get('/users/:id/billing-history', usersController.getUserBillingHistory);
router.post('/users/:id/sync-payment-from-sumit', superadminMiddleware, usersController.syncPaymentMethodFromSumit);
router.post('/users/:id/register-payment-method', superadminMiddleware, usersController.adminRegisterPaymentMethod);
router.post('/users/:id/payment-link', usersController.generatePaymentLink);
router.put('/users/:id/credit-card-exempt', superadminMiddleware, usersController.toggleCreditCardExempt);
router.post('/users/:id/approve', usersController.approveUser);
router.post('/users/create', usersController.createUser);
router.delete('/users/:id', superadminMiddleware, usersController.deleteUser);

// Bot locking management (admin can lock/unlock any bot)
router.put('/bots/:botId/lock', usersController.toggleBotLock);

// Plans for admin
router.get('/plans', usersController.getPlans);

// WAHA sources management
router.get('/waha-sources', wahaSourcesController.list);
router.get('/waha-sources/sync', superadminMiddleware, wahaSourcesController.syncLiveCounts);
router.post('/waha-sources/re-encrypt-from-env', superadminMiddleware, wahaSourcesController.reEncryptFromEnv);
router.post('/waha-sources', superadminMiddleware, wahaSourcesController.create);
router.put('/waha-sources/:id', superadminMiddleware, wahaSourcesController.update);
router.delete('/waha-sources/:id', superadminMiddleware, wahaSourcesController.deactivate);

// Proxy sources management
router.get('/proxy-sources', proxySourcesController.list);
router.get('/proxy-sources/connections', proxySourcesController.listConnections);
router.post('/proxy-sources', superadminMiddleware, proxySourcesController.create);
router.post('/proxy-sources/sync', superadminMiddleware, proxySourcesController.syncExisting);
router.post('/proxy-sources/sync-from-api', superadminMiddleware, proxySourcesController.syncFromProxyAPI);
router.post('/proxy-sources/connections/:id/assign', superadminMiddleware, proxySourcesController.assignConnection);
router.delete('/proxy-sources/connections/all', superadminMiddleware, proxySourcesController.removeAllProxies);
router.delete('/proxy-sources/connections/:id', superadminMiddleware, proxySourcesController.removeConnectionProxy);
router.put('/proxy-sources/:id', superadminMiddleware, proxySourcesController.update);
router.delete('/proxy-sources/:id', superadminMiddleware, proxySourcesController.deactivate);

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
router.get('/affiliate/terms', promotionsController.getAffiliateTerms);
router.put('/affiliate/terms', superadminMiddleware, promotionsController.updateAffiliateTerms);
router.get('/affiliates/list', promotionsController.listAffiliates);
router.post('/affiliate/create-all', superadminMiddleware, promotionsController.createAffiliatesForAllUsers);
router.post('/affiliate/payouts/:payoutId/process', superadminMiddleware, promotionsController.processPayoutRequest);
// IMPORTANT: :affiliateId route must come AFTER all specific routes like /affiliate/terms
router.put('/affiliate/:affiliateId', superadminMiddleware, promotionsController.updateAffiliate);

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

// Billing management (self-managed billing system)
router.get('/billing/stats', billingController.getBillingStats);
router.get('/billing/upcoming', billingController.getUpcomingCharges);
router.get('/billing/failed', billingController.getFailedCharges);
router.get('/billing/history', billingController.getPaymentHistory);
router.get('/billing/charge/:id', billingController.getChargeDetails);
router.post('/billing/charge/:id', superadminMiddleware, billingController.chargeNow);
router.post('/billing/retry/:id', superadminMiddleware, billingController.retryCharge);
router.post('/billing/cancel/:id', superadminMiddleware, billingController.cancelCharge);
router.post('/billing/skip/:id', superadminMiddleware, billingController.skipCharge);
router.put('/billing/amount/:id', superadminMiddleware, billingController.updateChargeAmount);
router.get('/billing/user-history/:userId', billingController.getUserPaymentHistory);
router.post('/billing/schedule', superadminMiddleware, billingController.scheduleManualCharge);
router.post('/billing/process-queue', superadminMiddleware, billingController.processBillingQueue);
router.post('/billing/cancel-subscription/:userId', superadminMiddleware, billingController.cancelSubscription);
router.post('/billing/void-payment/:id', superadminMiddleware, billingController.voidPayment);

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

// Test email preview - send any template to a chosen email
router.post('/email-preview', superadminMiddleware, async (req, res) => {
  try {
    const { templateId, recipientEmail } = req.body;

    if (!templateId || !recipientEmail) {
      return res.status(400).json({ error: 'נדרש סוג תבנית ואימייל נמען' });
    }

    const { sendMail } = require('../services/mail/transport.service');
    const {
      getVerificationEmail,
      getPasswordResetEmail,
      getNewSubscriptionUserEmail,
      getRenewalUserEmail,
      getCancellationUserEmail,
      getSubscriptionAdminEmail,
    } = require('../services/mail/templates.service');
    const {
      wrapInLayout, ctaButton, alertBox, paragraph, greeting, infoCard,
      dataTable, progressBar, COLORS, FRONTEND_URL,
    } = require('../services/mail/emailLayout.service');

    // Sample data for previews
    const sampleUser = 'משתמש לדוגמא';
    const samplePlan = 'מקצועי';
    const sampleDate = new Date().toLocaleDateString('he-IL');

    const templates = {
      verification: {
        subject: 'אימות חשבון Botomat (תצוגה מקדימה)',
        html: getVerificationEmail('123456', 'https://botomat.co.il/verify?token=test', 'he'),
      },
      password_reset: {
        subject: 'איפוס סיסמה - Botomat (תצוגה מקדימה)',
        html: getPasswordResetEmail('654321', 'https://botomat.co.il/reset?token=test', 'he'),
      },
      new_subscription: {
        subject: '🎉 ברוך הבא ל-Botomat! (תצוגה מקדימה)',
        html: getNewSubscriptionUserEmail(sampleUser, samplePlan, 79, 'https://botomat.co.il'),
      },
      renewal: {
        subject: '✅ המנוי שלך חודש בהצלחה (תצוגה מקדימה)',
        html: getRenewalUserEmail(sampleUser, samplePlan, 79, new Date(Date.now() + 30 * 86400000)),
      },
      cancellation: {
        subject: 'המנוי שלך בוטל (תצוגה מקדימה)',
        html: getCancellationUserEmail(sampleUser, samplePlan, new Date(Date.now() + 30 * 86400000), 'https://botomat.co.il/pricing'),
      },
      admin_new_sub: {
        subject: '🆕 מנוי חדש: test@example.com (תצוגה מקדימה)',
        html: getSubscriptionAdminEmail('new', {
          userName: sampleUser, userEmail: 'test@example.com', userPhone: '050-1234567',
          planName: samplePlan, amount: 79, referredBy: 'שותף לדוגמא', eventDetails: 'מס׳ מסמך: 12345',
        }),
      },
      admin_renewal: {
        subject: '🔄 חידוש מנוי: test@example.com (תצוגה מקדימה)',
        html: getSubscriptionAdminEmail('renewal', {
          userName: sampleUser, userEmail: 'test@example.com', userPhone: '050-1234567',
          planName: samplePlan, amount: 79,
        }),
      },
      admin_cancellation: {
        subject: '❌ ביטול מנוי: test@example.com (תצוגה מקדימה)',
        html: getSubscriptionAdminEmail('cancellation', {
          userName: sampleUser, userEmail: 'test@example.com',
          planName: samplePlan, eventDetails: `פעיל עד: ${sampleDate}`,
        }),
      },
      usage_warning: {
        subject: '📊 80% מהרצות בוט נוצלו - Botomat (תצוגה מקדימה)',
        html: (() => {
          const content = `
            ${greeting(sampleUser)}
            ${alertBox(`ניצלת 80% מהרצות בוט בחבילת "${samplePlan}".`, 'warning')}
            ${infoCard(`
              <h3 style="margin:0 0 12px;color:${COLORS.textDark};font-size:15px;">סטטוס השימוש שלך</h3>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="color:${COLORS.textLight};font-size:14px;">הרצות בוט</td>
                  <td style="text-align:left;font-weight:600;color:${COLORS.textDark};font-size:14px;">400 / 500</td>
                </tr>
              </table>
              ${progressBar(80)}
            `)}
            ${ctaButton('שדרג את החבילה שלך', `${FRONTEND_URL}/pricing`, COLORS.primary, COLORS.primaryDark)}
          `;
          return wrapInLayout({
            content, headerTitle: 'התראת שימוש', headerIcon: '📊',
            headerColor: COLORS.warning, headerColorEnd: '#b45309',
          });
        })(),
      },
      usage_limit: {
        subject: '⚠️ הגעת למגבלת הרצות בוט - Botomat (תצוגה מקדימה)',
        html: (() => {
          const content = `
            ${greeting(sampleUser)}
            ${alertBox(`הגעת למגבלת הרצות בוט בחבילת "${samplePlan}". שדרג את החבילה כדי להמשיך.`, 'error')}
            ${infoCard(`
              <h3 style="margin:0 0 12px;color:${COLORS.textDark};font-size:15px;">סטטוס השימוש שלך</h3>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="color:${COLORS.textLight};font-size:14px;">הרצות בוט</td>
                  <td style="text-align:left;font-weight:600;color:${COLORS.textDark};font-size:14px;">500 / 500</td>
                </tr>
              </table>
              ${progressBar(100)}
            `)}
            ${ctaButton('שדרג את החבילה שלך', `${FRONTEND_URL}/pricing`, COLORS.primary, COLORS.primaryDark)}
          `;
          return wrapInLayout({
            content, headerTitle: 'הגעת למגבלה', headerIcon: '⚠️',
            headerColor: COLORS.error, headerColorEnd: '#b91c1c',
          });
        })(),
      },
      auto_upgrade: {
        subject: '✅ המנוי שלך שודרג אוטומטית - Botomat (תצוגה מקדימה)',
        html: (() => {
          const content = `
            ${greeting(sampleUser)}
            ${alertBox(`הגעת למגבלת ההרצות החודשית, ולכן המנוי שלך שודרג אוטומטית לתוכנית <strong>עסקי</strong>.`, 'success')}
            ${dataTable([
              ['תוכנית קודמת:', samplePlan],
              ['תוכנית חדשה:', 'עסקי', true],
              ['הרצות חדשות:', '2,000'],
              ['חיוב יחסי:', '₪35'],
            ])}
            ${ctaButton('צפה בהגדרות המנוי', `${FRONTEND_URL}/settings?tab=subscription`, COLORS.primary, COLORS.primaryDark)}
          `;
          return wrapInLayout({
            content, headerTitle: 'המנוי שלך שודרג!', headerIcon: '✅',
            headerColor: '#10b981', headerColorEnd: COLORS.success,
            footerExtra: `<p style="color:${COLORS.textMuted};font-size:12px;margin:0;">ניתן לבטל את השדרוג האוטומטי בהגדרות המנוי.</p>`,
          });
        })(),
      },
      trial_expiry_1day: {
        subject: '⏰ תקופת הניסיון שלך מסתיימת מחר! (תצוגה מקדימה)',
        html: (() => {
          const content = `
            ${greeting(sampleUser)}
            ${paragraph(`תקופת הניסיון שלך בתוכנית "<strong>${samplePlan}</strong>" מסתיימת ב-<strong>${sampleDate}</strong>.`)}
            ${alertBox(`יש לך אמצעי תשלום שמור. לאחר סיום הניסיון תחויב אוטומטית ב-<strong>₪79</strong>.`, 'success')}
            ${ctaButton('נהל מנוי', `${FRONTEND_URL}/settings?tab=subscription`, COLORS.warning, '#b45309')}
            ${paragraph('יש לך שאלות? אנחנו כאן לעזור - פשוט השב למייל הזה.', { color: COLORS.textLight, size: '13' })}
          `;
          return wrapInLayout({
            content, headerTitle: 'הניסיון מסתיים מחר!', headerIcon: '⏰',
            headerColor: COLORS.error, headerColorEnd: '#b91c1c',
          });
        })(),
      },
      trial_expiry_3days: {
        subject: 'תקופת הניסיון שלך מסתיימת בעוד 3 ימים (תצוגה מקדימה)',
        html: (() => {
          const content = `
            ${greeting(sampleUser)}
            ${paragraph(`תקופת הניסיון שלך בתוכנית "<strong>${samplePlan}</strong>" מסתיימת ב-<strong>${sampleDate}</strong>.`)}
            ${alertBox('לא הוספת עדיין אמצעי תשלום. לאחר סיום הניסיון החשבון שלך יעבור לתוכנית החינמית.', 'warning')}
            ${ctaButton('הוסף אמצעי תשלום', `${FRONTEND_URL}/settings?tab=subscription`, COLORS.primary, COLORS.primaryDark)}
            ${paragraph('יש לך שאלות? אנחנו כאן לעזור - פשוט השב למייל הזה.', { color: COLORS.textLight, size: '13' })}
          `;
          return wrapInLayout({
            content, headerTitle: 'הניסיון מסתיים בעוד 3 ימים', headerIcon: '⏰',
            headerColor: COLORS.warning, headerColorEnd: '#b45309',
          });
        })(),
      },
      payment_success: {
        subject: 'התשלום בוצע בהצלחה - ₪79 (תצוגה מקדימה)',
        html: (() => {
          const content = `
            ${greeting(sampleUser)}
            ${alertBox('התשלום שלך בוצע בהצלחה!', 'success')}
            ${dataTable([
              ['סכום:', '₪79', true],
              ['תיאור:', `תוכנית ${samplePlan} - חודשי`],
              ['חיוב הבא:', sampleDate],
            ])}
            ${ctaButton('צפה בקבלה', 'https://botomat.co.il', COLORS.success, '#047857')}
            ${paragraph(`<a href="${FRONTEND_URL}/settings?tab=subscription" style="color:${COLORS.primary};text-decoration:underline;">לניהול המנוי שלך</a>`, { size: '13', color: COLORS.textLight })}
          `;
          return wrapInLayout({
            content, headerTitle: 'התשלום בוצע בהצלחה', headerIcon: '✅',
            headerColor: '#10b981', headerColorEnd: COLORS.success,
          });
        })(),
      },
      payment_failed: {
        subject: 'בעיה בחיוב החודשי שלך - נדרשת פעולה (תצוגה מקדימה)',
        html: (() => {
          const content = `
            ${greeting(sampleUser)}
            ${paragraph('לא הצלחנו לחייב את אמצעי התשלום שלך עבור המנוי.')}
            ${alertBox('<strong>סיבה:</strong> כרטיס אשראי נדחה', 'error')}
            ${alertBox('ננסה לחייב שוב מחר.', 'warning')}
            ${paragraph('אנא עדכן את פרטי התשלום שלך כדי למנוע הפסקת שירות:')}
            ${ctaButton('עדכן פרטי תשלום', `${FRONTEND_URL}/settings?tab=subscription`, COLORS.primary, COLORS.primaryDark)}
          `;
          return wrapInLayout({
            content, headerTitle: 'בעיה בחיוב', headerIcon: '💳',
            headerColor: COLORS.error, headerColorEnd: '#b91c1c',
          });
        })(),
      },
      downgrade: {
        subject: 'המנוי שלך הועבר לתוכנית החינמית (תצוגה מקדימה)',
        html: (() => {
          const content = `
            ${greeting(sampleUser)}
            ${paragraph('לצערנו, לא הצלחנו לחייב את אמצעי התשלום שלך למרות מספר ניסיונות.')}
            ${alertBox('המנוי שלך הועבר לתוכנית החינמית.', 'warning')}
            ${paragraph('אם ברצונך לחדש את המנוי, אנא עדכן את פרטי התשלום ובחר תוכנית חדשה:')}
            ${ctaButton('צפה בתוכניות', `${FRONTEND_URL}/pricing`, COLORS.primary, COLORS.primaryDark)}
          `;
          return wrapInLayout({
            content, headerTitle: 'המנוי שלך הועבר לתוכנית חינמית',
            headerColor: COLORS.warning, headerColorEnd: '#b45309',
          });
        })(),
      },
      broadcast: {
        subject: '📢 הודעה מ-Botomat (תצוגה מקדימה)',
        html: (() => {
          const content = `
            ${greeting(sampleUser)}
            ${paragraph('זוהי הודעת דוגמא שנשלחה מממשק הניהול. כך ייראו ההודעות שנשלחות לכל המשתמשים.')}
            ${ctaButton('כניסה למערכת', `${FRONTEND_URL}/dashboard`, COLORS.primary, COLORS.primaryDark)}
          `;
          return wrapInLayout({
            content, headerTitle: 'הודעה מ-Botomat', headerIcon: '📢',
            headerColor: '#7c3aed', headerColorEnd: '#6d28d9',
          });
        })(),
      },
      service_expired: {
        subject: 'המנוי שלך לבוט סטטוסים הסתיים (תצוגה מקדימה)',
        html: (() => {
          const content = `
            ${greeting(sampleUser)}
            ${paragraph('המנוי שלך לשירות "<strong>בוט סטטוסים</strong>" הסתיים.')}
            ${alertBox('כדי להמשיך להשתמש בשירות, חדש את המנוי שלך.', 'warning')}
            ${ctaButton('חדש מנוי', `${FRONTEND_URL}/services`, COLORS.primary, COLORS.primaryDark)}
          `;
          return wrapInLayout({
            content, headerTitle: 'המנוי לבוט סטטוסים הסתיים',
            headerColor: COLORS.warning, headerColorEnd: '#b45309',
          });
        })(),
      },
      access_request: {
        subject: 'בקשת גישה לחשבון שלך - Botomat (תצוגה מקדימה)',
        html: (() => {
          const { infoCard: ic } = require('../services/mail/emailLayout.service');
          const content = `
            ${paragraph('<strong>יועץ לדוגמא</strong> (expert@example.com) מבקש/ת גישה לנהל את החשבון שלך ב-Botomat.')}
            ${ic(`
              <p style="color:${COLORS.textMedium};margin:0 0 8px;font-weight:600;">הודעה:</p>
              <p style="color:${COLORS.textLight};margin:0;">שלום, אשמח לעזור לך עם הגדרת הבוטים.</p>
            `, '#ffffff', '#6366f1')}
            ${paragraph('היכנס להגדרות החשבון שלך כדי לאשר או לדחות את הבקשה.', { color: COLORS.textLight })}
            ${ctaButton('צפה בבקשה', `${FRONTEND_URL}/settings?tab=experts`, '#6366f1', '#8b5cf6')}
          `;
          return wrapInLayout({
            content, headerTitle: 'בקשת גישה לחשבון', headerIcon: '🔗',
            headerColor: '#6366f1', headerColorEnd: '#8b5cf6',
            showUnsubscribe: false,
          });
        })(),
      },
    };

    const template = templates[templateId];
    if (!template) {
      return res.status(400).json({ error: 'תבנית לא נמצאה', available: Object.keys(templates) });
    }

    await sendMail(recipientEmail, template.subject, template.html);

    res.json({ success: true, message: `המייל נשלח ל-${recipientEmail}` });
  } catch (error) {
    console.error('[Admin] Email preview error:', error);
    res.status(500).json({ error: 'שגיאה בשליחת מייל תצוגה מקדימה' });
  }
});

module.exports = router;
