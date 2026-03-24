const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const { sendMail } = require('../services/mail/transport.service');
const { wrapInLayout, dataTable, paragraph, greeting, alertBox, COLORS } = require('../services/mail/emailLayout.service');
const db = require('../config/database');

// Simple in-memory rate limiting per user (max 3 requests per 10 minutes)
const contactRateLimit = new Map();
const RATE_LIMIT_WINDOW = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT_MAX = 3;

function checkRateLimit(userId) {
  const now = Date.now();
  const userRequests = contactRateLimit.get(userId) || [];
  const recent = userRequests.filter(ts => now - ts < RATE_LIMIT_WINDOW);
  contactRateLimit.set(userId, recent);
  if (recent.length >= RATE_LIMIT_MAX) return false;
  recent.push(now);
  contactRateLimit.set(userId, recent);
  return true;
}

// Sanitize user input - strip HTML tags and limit length
function sanitize(str, maxLength = 500) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/<[^>]*>/g, '')  // Strip HTML tags
    .replace(/[<>"'`;(){}]/g, '') // Remove potentially dangerous chars
    .trim()
    .slice(0, maxLength);
}

router.use(authMiddleware);

router.post('/submit', async (req, res) => {
  try {
    // Rate limit check
    if (!checkRateLimit(req.user.id)) {
      return res.status(429).json({ error: 'שלחת יותר מדי פניות. נסה שוב בעוד מספר דקות.' });
    }

    const { name, phone, message } = req.body;

    // Validate required fields
    const cleanName = sanitize(name, 100);
    const cleanPhone = sanitize(phone, 20);
    const cleanMessage = sanitize(message, 2000);

    if (!cleanName || cleanName.length < 2) {
      return res.status(400).json({ error: 'נא להזין שם תקין' });
    }

    if (!cleanPhone || !/^[\d\-+() ]{7,20}$/.test(cleanPhone)) {
      return res.status(400).json({ error: 'נא להזין מספר טלפון תקין' });
    }

    // Get admin email: site_config → env → first superadmin/admin user
    let adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
      try {
        const cfgResult = await db.query(`SELECT value FROM system_settings WHERE key = 'site_config'`);
        const siteConfig = typeof cfgResult.rows[0]?.value === 'string' ? JSON.parse(cfgResult.rows[0].value) : (cfgResult.rows[0]?.value || {});
        adminEmail = siteConfig.admin_email;
      } catch { /* ignore */ }
    }
    if (!adminEmail) {
      try {
        const adminResult = await db.query(
          `SELECT email FROM users WHERE role IN ('superadmin', 'admin') ORDER BY CASE role WHEN 'superadmin' THEN 0 ELSE 1 END, created_at ASC LIMIT 1`
        );
        adminEmail = adminResult.rows[0]?.email;
      } catch { /* ignore */ }
    }

    if (!adminEmail) {
      console.error('[Contact] No admin email configured');
      return res.status(500).json({ error: 'לא ניתן לשלוח את הפנייה כרגע' });
    }

    const userEmail = req.user.email;

    // Build email HTML
    const emailHtml = wrapInLayout({
      headerTitle: 'פנייה חדשה מהדשבורד',
      headerSubtitle: 'משתמש יצר קשר דרך המערכת',
      headerIcon: '📩',
      headerColor: COLORS.info,
      headerColorEnd: '#1e40af',
      content: `
        ${greeting(`פנייה חדשה מ-${cleanName}`)}
        ${paragraph('התקבלה פנייה חדשה ממשתמש במערכת:')}
        ${dataTable([
          ['שם', cleanName],
          ['טלפון', cleanPhone],
          ['אימייל', userEmail],
          ['מזהה משתמש', String(req.user.id)],
        ])}
        ${cleanMessage ? alertBox(cleanMessage, 'info', '💬 הודעה') : ''}
      `,
    });

    await sendMail(
      adminEmail,
      `📩 פנייה חדשה מ-${cleanName} (${userEmail})`,
      emailHtml
    );

    res.json({ success: true, message: 'הפנייה נשלחה בהצלחה!' });
  } catch (error) {
    console.error('[Contact] Error submitting contact form:', error);
    res.status(500).json({ error: 'שגיאה בשליחת הפנייה' });
  }
});

module.exports = router;
