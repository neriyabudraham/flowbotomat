const db = require('../../config/database');
const { sendMail } = require('../mail/transport.service');
const { 
  getNewSubscriptionUserEmail, 
  getRenewalUserEmail, 
  getCancellationUserEmail, 
  getSubscriptionAdminEmail 
} = require('../mail/templates.service');

// Admin email - you can also move this to environment variables
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'neriyabu100@gmail.com';
const APP_URL = process.env.APP_URL || 'https://botomat.co.il';

/**
 * Send email notification for new subscription
 */
async function sendNewSubscriptionEmail(userId, planName, amount, paymentDetails = {}) {
  try {
    const user = await getUserDetails(userId);
    if (!user) {
      console.error('[SubNotification] User not found:', userId);
      return;
    }

    const referredBy = await getReferralInfo(userId);

    // Send to user
    try {
      const userHtml = getNewSubscriptionUserEmail(
        user.name || 'משתמש יקר',
        planName,
        amount,
        APP_URL
      );
      await sendMail(user.email, '🎉 ברוך הבא ל-Botomat!', userHtml);
      console.log(`[SubNotification] New subscription email sent to user: ${user.email}`);
    } catch (e) {
      console.error('[SubNotification] Failed to send user email:', e.message);
    }

    // Send to admin
    try {
      const adminHtml = getSubscriptionAdminEmail('new', {
        userName: user.name,
        userEmail: user.email,
        userPhone: user.phone,
        planName,
        amount,
        referredBy,
        eventDetails: paymentDetails.documentNumber ? `מס׳ מסמך: ${paymentDetails.documentNumber}` : null
      });
      await sendMail(ADMIN_EMAIL, `🆕 מנוי חדש: ${user.email}`, adminHtml);
      console.log(`[SubNotification] New subscription email sent to admin`);
    } catch (e) {
      console.error('[SubNotification] Failed to send admin email:', e.message);
    }

  } catch (error) {
    console.error('[SubNotification] Send new subscription email error:', error);
  }
}

/**
 * Send email notification for subscription renewal
 */
async function sendRenewalEmail(userId, planName, amount, nextChargeDate, paymentDetails = {}) {
  try {
    const user = await getUserDetails(userId);
    if (!user) return;

    const referredBy = await getReferralInfo(userId);

    // Send to user
    try {
      const userHtml = getRenewalUserEmail(
        user.name || 'משתמש יקר',
        planName,
        amount,
        nextChargeDate
      );
      await sendMail(user.email, '✅ המנוי שלך חודש בהצלחה', userHtml);
      console.log(`[SubNotification] Renewal email sent to user: ${user.email}`);
    } catch (e) {
      console.error('[SubNotification] Failed to send user email:', e.message);
    }

    // Send to admin
    try {
      const adminHtml = getSubscriptionAdminEmail('renewal', {
        userName: user.name,
        userEmail: user.email,
        userPhone: user.phone,
        planName,
        amount,
        referredBy,
        eventDetails: paymentDetails.documentNumber ? `מס׳ מסמך: ${paymentDetails.documentNumber}` : null
      });
      await sendMail(ADMIN_EMAIL, `🔄 חידוש מנוי: ${user.email}`, adminHtml);
      console.log(`[SubNotification] Renewal email sent to admin`);
    } catch (e) {
      console.error('[SubNotification] Failed to send admin email:', e.message);
    }

  } catch (error) {
    console.error('[SubNotification] Send renewal email error:', error);
  }
}

/**
 * Send email notification for subscription cancellation
 */
async function sendCancellationEmail(userId, planName, expiresAt) {
  try {
    const user = await getUserDetails(userId);
    if (!user) return;

    const referredBy = await getReferralInfo(userId);
    const renewUrl = `${APP_URL}/pricing`;

    // Send to user
    try {
      const userHtml = getCancellationUserEmail(
        user.name || 'משתמש יקר',
        planName,
        expiresAt,
        renewUrl
      );
      await sendMail(user.email, 'המנוי שלך בוטל', userHtml);
      console.log(`[SubNotification] Cancellation email sent to user: ${user.email}`);
    } catch (e) {
      console.error('[SubNotification] Failed to send user email:', e.message);
    }

    // Send to admin
    try {
      const adminHtml = getSubscriptionAdminEmail('cancellation', {
        userName: user.name,
        userEmail: user.email,
        userPhone: user.phone,
        planName,
        referredBy,
        eventDetails: expiresAt ? `פעיל עד: ${new Date(expiresAt).toLocaleDateString('he-IL')}` : null
      });
      await sendMail(ADMIN_EMAIL, `❌ ביטול מנוי: ${user.email}`, adminHtml);
      console.log(`[SubNotification] Cancellation email sent to admin`);
    } catch (e) {
      console.error('[SubNotification] Failed to send admin email:', e.message);
    }

  } catch (error) {
    console.error('[SubNotification] Send cancellation email error:', error);
  }
}

/**
 * Get user details
 */
async function getUserDetails(userId) {
  const result = await db.query(
    'SELECT id, name, email, phone FROM users WHERE id = $1',
    [userId]
  );
  return result.rows[0] || null;
}

/**
 * Get referral info (who referred this user)
 */
async function getReferralInfo(userId) {
  try {
    const result = await db.query(`
      SELECT u.name, u.email 
      FROM affiliate_referrals ar
      JOIN affiliates a ON ar.affiliate_id = a.id
      JOIN users u ON a.user_id = u.id
      WHERE ar.referred_user_id = $1
    `, [userId]);
    
    if (result.rows.length > 0) {
      const ref = result.rows[0];
      return `${ref.name || ref.email}`;
    }
    return null;
  } catch (e) {
    return null;
  }
}

module.exports = {
  sendNewSubscriptionEmail,
  sendRenewalEmail,
  sendCancellationEmail
};
