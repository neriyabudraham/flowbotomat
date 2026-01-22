const db = require('../config/database');
const { sendMail } = require('./mail/transport.service');

/**
 * Usage alert thresholds
 */
const ALERT_THRESHOLDS = [50, 80, 100]; // percentages

/**
 * Check user usage and create alerts if needed
 */
async function checkUserUsage(userId) {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    
    // Get user info
    const userResult = await db.query(
      'SELECT id, email, name FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) return;
    const user = userResult.rows[0];
    
    // Get subscription limits
    const subResult = await db.query(`
      SELECT sp.max_bot_runs_per_month, sp.max_contacts, sp.max_bots, sp.name_he as plan_name
      FROM user_subscriptions us
      JOIN subscription_plans sp ON us.plan_id = sp.id
      WHERE us.user_id = $1 AND us.status IN ('active', 'trial')
    `, [userId]);
    
    const limits = subResult.rows[0] || {
      max_bot_runs_per_month: 500,
      max_contacts: 100,
      max_bots: 1,
      plan_name: 'חינם'
    };
    
    // Get usage
    const usageResult = await db.query(`
      SELECT bot_runs FROM usage_tracking 
      WHERE user_id = $1 AND period_year = $2 AND period_month = $3
    `, [userId, year, month]);
    
    const botRuns = usageResult.rows[0]?.bot_runs || 0;
    
    // Get counts
    const botCountResult = await db.query(
      'SELECT COUNT(*) as count FROM bots WHERE user_id = $1',
      [userId]
    );
    const contactCountResult = await db.query(
      'SELECT COUNT(*) as count FROM contacts WHERE user_id = $1',
      [userId]
    );
    
    const usage = {
      bot_runs: {
        used: botRuns,
        limit: limits.max_bot_runs_per_month,
        type: 'bot_runs',
        label: 'הרצות בוט'
      },
      bots: {
        used: parseInt(botCountResult.rows[0]?.count || 0),
        limit: limits.max_bots,
        type: 'bots',
        label: 'בוטים'
      },
      contacts: {
        used: parseInt(contactCountResult.rows[0]?.count || 0),
        limit: limits.max_contacts,
        type: 'contacts',
        label: 'אנשי קשר'
      }
    };
    
    // Check each usage type
    for (const [key, data] of Object.entries(usage)) {
      if (data.limit === -1) continue; // Unlimited
      
      const percentage = Math.round((data.used / data.limit) * 100);
      
      for (const threshold of ALERT_THRESHOLDS) {
        if (percentage >= threshold) {
          await createAlertIfNeeded(user, data, threshold, percentage, limits.plan_name);
        }
      }
    }
    
  } catch (error) {
    console.error('[UsageAlerts] Check usage error:', error);
  }
}

/**
 * Create alert if not already exists for this threshold
 */
async function createAlertIfNeeded(user, usageData, threshold, currentPercentage, planName) {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    
    // Check if alert already sent for this threshold this month
    const existingAlert = await db.query(`
      SELECT id FROM system_notifications 
      WHERE user_id = $1 
        AND notification_type = 'usage_alert'
        AND metadata->>'usage_type' = $2
        AND metadata->>'threshold' = $3
        AND EXTRACT(YEAR FROM created_at) = $4
        AND EXTRACT(MONTH FROM created_at) = $5
    `, [user.id, usageData.type, threshold.toString(), year, month]);
    
    if (existingAlert.rows.length > 0) return; // Already sent
    
    // Determine alert level
    let alertLevel = 'info';
    let title = '';
    let message = '';
    
    if (threshold >= 100) {
      alertLevel = 'error';
      title = `⚠️ הגעת למגבלת ${usageData.label}`;
      message = `השתמשת ב-${usageData.used} מתוך ${usageData.limit} ${usageData.label}. שדרג את החבילה שלך כדי להמשיך.`;
    } else if (threshold >= 80) {
      alertLevel = 'warning';
      title = `📊 ${currentPercentage}% מ${usageData.label} נוצלו`;
      message = `נשארו לך ${usageData.limit - usageData.used} ${usageData.label}. שקול לשדרג את החבילה.`;
    } else {
      alertLevel = 'info';
      title = `📈 ${currentPercentage}% מ${usageData.label} נוצלו`;
      message = `נשארו לך ${usageData.limit - usageData.used} ${usageData.label}.`;
    }
    
    // Create notification in DB
    await db.query(`
      INSERT INTO system_notifications (user_id, notification_type, title, message, alert_level, metadata)
      VALUES ($1, 'usage_alert', $2, $3, $4, $5)
    `, [user.id, title, message, alertLevel, JSON.stringify({
      usage_type: usageData.type,
      threshold: threshold.toString(),
      current_percentage: currentPercentage,
      used: usageData.used,
      limit: usageData.limit
    })]);
    
    // Send email for 80% and 100% alerts
    if (threshold >= 80) {
      await sendUsageAlertEmail(user, usageData, currentPercentage, planName);
    }
    
    console.log(`[UsageAlerts] Created alert for user ${user.id}: ${usageData.type} at ${threshold}%`);
    
  } catch (error) {
    console.error('[UsageAlerts] Create alert error:', error);
  }
}

/**
 * Send usage alert email
 */
async function sendUsageAlertEmail(user, usageData, percentage, planName) {
  try {
    const isAtLimit = percentage >= 100;
    
    const subject = isAtLimit 
      ? `⚠️ הגעת למגבלת ${usageData.label} - FlowBotomat`
      : `📊 ${percentage}% מ${usageData.label} נוצלו - FlowBotomat`;
    
    const html = `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #4F46E5; margin: 0;">FlowBotomat</h1>
        </div>
        
        <div style="background: ${isAtLimit ? '#FEE2E2' : '#FEF3C7'}; border-radius: 16px; padding: 24px; margin-bottom: 24px;">
          <h2 style="color: ${isAtLimit ? '#DC2626' : '#D97706'}; margin: 0 0 12px 0;">
            ${isAtLimit ? '⚠️ הגעת למגבלה' : '📊 התראת שימוש'}
          </h2>
          <p style="color: #1F2937; margin: 0;">
            שלום ${user.name || 'משתמש'},<br><br>
            ${isAtLimit 
              ? `הגעת למגבלת ${usageData.label} בחבילת "${planName}".`
              : `ניצלת ${percentage}% מ${usageData.label} בחבילת "${planName}".`
            }
          </p>
        </div>
        
        <div style="background: #F3F4F6; border-radius: 16px; padding: 24px; margin-bottom: 24px;">
          <h3 style="color: #374151; margin: 0 0 16px 0;">📈 סטטוס השימוש שלך</h3>
          <div style="background: white; border-radius: 12px; padding: 16px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="color: #6B7280;">${usageData.label}</span>
              <span style="font-weight: bold; color: #1F2937;">${usageData.used} / ${usageData.limit}</span>
            </div>
            <div style="background: #E5E7EB; border-radius: 9999px; height: 12px; overflow: hidden;">
              <div style="background: ${percentage >= 100 ? '#DC2626' : percentage >= 80 ? '#F59E0B' : '#10B981'}; height: 100%; width: ${Math.min(percentage, 100)}%; border-radius: 9999px;"></div>
            </div>
          </div>
        </div>
        
        <div style="text-align: center;">
          <a href="https://flow.botomat.co.il/pricing" 
             style="display: inline-block; background: linear-gradient(135deg, #4F46E5, #7C3AED); color: white; padding: 16px 32px; text-decoration: none; border-radius: 12px; font-weight: bold;">
            🚀 שדרג את החבילה שלך
          </a>
        </div>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #E5E7EB; text-align: center; color: #9CA3AF; font-size: 12px;">
          <p>© ${new Date().getFullYear()} FlowBotomat. כל הזכויות שמורות.</p>
        </div>
      </div>
    `;
    
    await sendMail(user.email, subject, html);
    console.log(`[UsageAlerts] Sent email to ${user.email}`);
    
  } catch (error) {
    console.error('[UsageAlerts] Send email error:', error);
  }
}

/**
 * Get user's unread notifications
 */
async function getUserNotifications(userId, limit = 20) {
  try {
    const result = await db.query(`
      SELECT * FROM system_notifications 
      WHERE user_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2
    `, [userId, limit]);
    
    return result.rows;
  } catch (error) {
    console.error('[UsageAlerts] Get notifications error:', error);
    return [];
  }
}

/**
 * Mark notification as read
 */
async function markNotificationRead(userId, notificationId) {
  try {
    await db.query(`
      UPDATE system_notifications 
      SET is_read = true, read_at = NOW() 
      WHERE id = $1 AND user_id = $2
    `, [notificationId, userId]);
  } catch (error) {
    console.error('[UsageAlerts] Mark read error:', error);
  }
}

/**
 * Mark all notifications as read
 */
async function markAllNotificationsRead(userId) {
  try {
    await db.query(`
      UPDATE system_notifications 
      SET is_read = true, read_at = NOW() 
      WHERE user_id = $1 AND is_read = false
    `, [userId]);
  } catch (error) {
    console.error('[UsageAlerts] Mark all read error:', error);
  }
}

/**
 * Get unread count
 */
async function getUnreadCount(userId) {
  try {
    const result = await db.query(`
      SELECT COUNT(*) as count FROM system_notifications 
      WHERE user_id = $1 AND is_read = false
    `, [userId]);
    
    return parseInt(result.rows[0]?.count || 0);
  } catch (error) {
    console.error('[UsageAlerts] Get unread count error:', error);
    return 0;
  }
}

/**
 * Mark selected notifications as read
 */
async function markSelectedNotificationsRead(userId, ids) {
  try {
    await db.query(`
      UPDATE system_notifications 
      SET is_read = true, read_at = NOW() 
      WHERE user_id = $1 AND id = ANY($2) AND is_read = false
    `, [userId, ids]);
  } catch (error) {
    console.error('[UsageAlerts] Mark selected read error:', error);
  }
}

/**
 * Delete user notification
 */
async function deleteUserNotification(userId, notificationId) {
  try {
    await db.query(`
      DELETE FROM system_notifications 
      WHERE user_id = $1 AND id = $2
    `, [userId, notificationId]);
  } catch (error) {
    console.error('[UsageAlerts] Delete notification error:', error);
  }
}

/**
 * Send notification to all users (for admin broadcasts)
 */
async function sendBroadcastNotification(title, message, type = 'system') {
  try {
    const usersResult = await db.query('SELECT id FROM users WHERE is_active = true');
    
    for (const user of usersResult.rows) {
      await db.query(`
        INSERT INTO system_notifications (user_id, type, title, message)
        VALUES ($1, $2, $3, $4)
      `, [user.id, type, title, message]);
    }
    
    return usersResult.rows.length;
  } catch (error) {
    console.error('[UsageAlerts] Broadcast notification error:', error);
    throw error;
  }
}

module.exports = {
  checkUserUsage,
  getUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  markSelectedNotificationsRead,
  deleteUserNotification,
  sendBroadcastNotification,
  getUnreadCount
};
