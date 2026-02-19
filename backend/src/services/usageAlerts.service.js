const db = require('../config/database');
const { sendMail } = require('./mail/transport.service');

/**
 * Usage alert thresholds
 */
const ALERT_THRESHOLDS = [80, 100]; // percentages - removed 50%, keeping 80% and 100%

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
      
      // Find the highest applicable threshold (to avoid sending multiple emails)
      let highestThreshold = null;
      for (const threshold of ALERT_THRESHOLDS) {
        if (percentage >= threshold) {
          highestThreshold = threshold;
        }
      }
      
      // Only create alert for the highest threshold reached
      if (highestThreshold !== null) {
        await createAlertIfNeeded(user, data, highestThreshold, percentage, limits.plan_name);
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
      ? `⚠️ הגעת למגבלת ${usageData.label} - Botomat`
      : `📊 ${percentage}% מ${usageData.label} נוצלו - Botomat`;
    
    const html = `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #4F46E5; margin: 0;">Botomat</h1>
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
          <a href="https://botomat.co.il/pricing" 
             style="display: inline-block; background: linear-gradient(135deg, #4F46E5, #7C3AED); color: white; padding: 16px 32px; text-decoration: none; border-radius: 12px; font-weight: bold;">
            🚀 שדרג את החבילה שלך
          </a>
        </div>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #E5E7EB; text-align: center; color: #9CA3AF; font-size: 12px;">
          <p>© ${new Date().getFullYear()} Botomat. כל הזכויות שמורות.</p>
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
async function sendBroadcastNotification(title, message, type = 'system', sendEmail = false, emailSubject = null) {
  try {
    // Get users with their preferences
    const usersResult = await db.query(`
      SELECT u.id, u.email, u.name, np.* 
      FROM users u
      LEFT JOIN notification_preferences np ON u.id = np.user_id
      WHERE u.is_active = true
    `);
    
    let sentCount = 0;
    let emailCount = 0;
    
    for (const user of usersResult.rows) {
      // Check if user wants this type of notification
      const shouldNotify = shouldSendNotification(user, type, 'app');
      
      if (shouldNotify) {
        await db.query(`
          INSERT INTO system_notifications (user_id, type, title, message)
          VALUES ($1, $2, $3, $4)
        `, [user.id, type, title, message]);
        sentCount++;
      }
      
      // Send email if requested
      if (sendEmail) {
        const shouldEmail = shouldSendNotification(user, type, 'email');
        if (shouldEmail) {
          await sendBroadcastEmail(user, emailSubject || title, message, type);
          emailCount++;
        }
      }
    }
    
    return { sentTo: sentCount, emailsSent: emailCount };
  } catch (error) {
    console.error('[UsageAlerts] Broadcast notification error:', error);
    throw error;
  }
}

/**
 * Check if notification should be sent based on user preferences
 */
function shouldSendNotification(userPrefs, notificationType, channel) {
  // Critical updates always sent
  if (notificationType === 'critical' || notificationType === 'quota_warning') {
    return true;
  }
  
  // Map notification types to preference keys
  const prefMap = {
    'subscription': { email: 'email_subscription', app: 'app_subscription' },
    'promo': { email: 'email_promos', app: 'app_promos' },
    'update': { email: 'email_updates', app: 'app_updates' },
    'broadcast': { email: 'email_newsletter', app: 'app_updates' },
    'system': { email: 'email_updates', app: 'app_updates' },
  };
  
  const mapping = prefMap[notificationType];
  if (!mapping) return true; // Default to sending
  
  const prefKey = mapping[channel];
  
  // If user has no preferences yet, default to true
  if (!userPrefs || userPrefs[prefKey] === undefined) {
    return true;
  }
  
  return userPrefs[prefKey];
}

/**
 * Send broadcast email to user
 */
async function sendBroadcastEmail(user, subject, message, type) {
  try {
    const typeColors = {
      promo: { bg: '#FDF2F8', color: '#BE185D', icon: '🎁' },
      update: { bg: '#ECFDF5', color: '#059669', icon: '✨' },
      subscription: { bg: '#EFF6FF', color: '#2563EB', icon: '💳' },
      critical: { bg: '#FEF2F2', color: '#DC2626', icon: '⚠️' },
      broadcast: { bg: '#F5F3FF', color: '#7C3AED', icon: '📢' },
    };
    
    const colors = typeColors[type] || typeColors.broadcast;
    
    const html = `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #4F46E5; margin: 0;">Botomat</h1>
        </div>
        
        <div style="background: ${colors.bg}; border-radius: 16px; padding: 24px; margin-bottom: 24px;">
          <h2 style="color: ${colors.color}; margin: 0 0 12px 0;">
            ${colors.icon} ${subject}
          </h2>
          <p style="color: #1F2937; margin: 0; line-height: 1.6;">
            שלום ${user.name || 'משתמש'},<br><br>
            ${message}
          </p>
        </div>
        
        <div style="text-align: center;">
          <a href="https://botomat.co.il/dashboard" 
             style="display: inline-block; background: linear-gradient(135deg, #4F46E5, #7C3AED); color: white; padding: 16px 32px; text-decoration: none; border-radius: 12px; font-weight: bold;">
            כניסה למערכת
          </a>
        </div>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #E5E7EB; text-align: center; color: #9CA3AF; font-size: 12px;">
          <p>© ${new Date().getFullYear()} Botomat. כל הזכויות שמורות.</p>
          <p style="margin-top: 8px;">
            <a href="https://botomat.co.il/settings?tab=notifications" style="color: #6B7280;">
              ניהול העדפות התראות
            </a>
          </p>
        </div>
      </div>
    `;
    
    await sendMail(user.email, subject, html);
  } catch (error) {
    console.error('[UsageAlerts] Send broadcast email error:', error);
  }
}

/**
 * Get notification preferences for user
 */
async function getNotificationPreferences(userId) {
  try {
    const result = await db.query(`
      SELECT * FROM notification_preferences WHERE user_id = $1
    `, [userId]);
    
    if (result.rows.length === 0) {
      // Return defaults
      return {
        email_subscription: true,
        email_updates: true,
        email_critical: true,
        email_promos: true,
        email_newsletter: true,
        app_subscription: true,
        app_updates: true,
        app_critical: true,
        app_promos: true
      };
    }
    
    return result.rows[0];
  } catch (error) {
    console.error('[UsageAlerts] Get preferences error:', error);
    return null;
  }
}

/**
 * Update notification preferences for user
 */
async function updateNotificationPreferences(userId, preferences) {
  try {
    // Check if preferences exist
    const existingResult = await db.query(
      'SELECT id FROM notification_preferences WHERE user_id = $1',
      [userId]
    );
    
    if (existingResult.rows.length === 0) {
      // Create new preferences
      await db.query(`
        INSERT INTO notification_preferences (
          user_id, email_subscription, email_updates, email_critical, 
          email_promos, email_newsletter, app_subscription, app_updates, 
          app_critical, app_promos
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        userId,
        preferences.email_subscription ?? true,
        preferences.email_updates ?? true,
        true, // critical always true
        preferences.email_promos ?? true,
        preferences.email_newsletter ?? true,
        preferences.app_subscription ?? true,
        preferences.app_updates ?? true,
        true, // critical always true
        preferences.app_promos ?? true
      ]);
    } else {
      // Update existing - build dynamic update
      const updates = [];
      const values = [userId];
      let paramIndex = 2;
      
      const allowedFields = [
        'email_subscription', 'email_updates', 'email_promos', 'email_newsletter',
        'app_subscription', 'app_updates', 'app_promos'
      ];
      
      for (const field of allowedFields) {
        if (preferences[field] !== undefined) {
          updates.push(`${field} = $${paramIndex}`);
          values.push(preferences[field]);
          paramIndex++;
        }
      }
      
      if (updates.length > 0) {
        await db.query(`
          UPDATE notification_preferences 
          SET ${updates.join(', ')}, updated_at = NOW()
          WHERE user_id = $1
        `, values);
      }
    }
    
    return true;
  } catch (error) {
    console.error('[UsageAlerts] Update preferences error:', error);
    throw error;
  }
}

/**
 * Check bot runs usage and send alerts if needed
 * Called from checkLimit during bot execution
 * Returns true if auto-upgrade was performed
 */
async function checkBotRunsUsageAndAlert(userId, used, limit) {
  try {
    if (limit === -1) return { upgraded: false }; // Unlimited
    
    const percentage = Math.round((used / limit) * 100);
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    
    // Get user info
    const userResult = await db.query(
      'SELECT id, email, name FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) return { upgraded: false };
    const user = userResult.rows[0];
    
    // Get subscription info including auto-upgrade settings
    const subResult = await db.query(`
      SELECT us.*, sp.name_he as plan_name, sp.upgrade_plan_id,
             up.name_he as upgrade_plan_name, up.price as upgrade_plan_price, up.max_bot_runs_per_month as upgrade_plan_runs
      FROM user_subscriptions us
      JOIN subscription_plans sp ON us.plan_id = sp.id
      LEFT JOIN subscription_plans up ON sp.upgrade_plan_id = up.id
      WHERE us.user_id = $1 AND us.status IN ('active', 'trial')
    `, [userId]);
    
    const subscription = subResult.rows[0];
    const planName = subscription?.plan_name || 'חינם';
    
    const usageData = {
      used,
      limit,
      type: 'bot_runs',
      label: 'הרצות בוט'
    };
    
    // Check 80% threshold
    if (percentage >= 80 && percentage < 100) {
      await createAlertIfNeeded(user, usageData, 80, percentage, planName);
    }
    
    // Check 100% threshold - may trigger auto-upgrade
    if (percentage >= 100) {
      // Check if user has auto-upgrade enabled and there's an upgrade plan
      if (subscription?.allow_auto_upgrade && subscription?.upgrade_plan_id) {
        // Try auto-upgrade
        const upgradeResult = await performAutoUpgrade(userId, subscription);
        if (upgradeResult.success) {
          // Send upgrade success notification
          await sendAutoUpgradeEmail(user, subscription, upgradeResult);
          return { 
            upgraded: true, 
            newLimit: subscription.upgrade_plan_runs,
            chargedAmount: upgradeResult.chargedAmount
          };
        }
      }
      
      // No auto-upgrade or upgrade failed - send 100% alert
      await createAlertIfNeeded(user, usageData, 100, percentage, planName);
    }
    
    return { upgraded: false };
    
  } catch (error) {
    console.error('[UsageAlerts] Check bot runs usage error:', error);
    return { upgraded: false };
  }
}

/**
 * Perform auto-upgrade for user
 */
async function performAutoUpgrade(userId, currentSub) {
  try {
    const upgradePlanId = currentSub.upgrade_plan_id;
    const autoUpgradePlanId = currentSub.auto_upgrade_plan_id;
    const targetPlanId = autoUpgradePlanId || upgradePlanId;
    
    if (!targetPlanId) {
      return { success: false, error: 'No upgrade plan available' };
    }
    
    // Get target plan details
    const planResult = await db.query(
      'SELECT * FROM subscription_plans WHERE id = $1 AND is_active = true',
      [targetPlanId]
    );
    
    if (planResult.rows.length === 0) {
      return { success: false, error: 'Upgrade plan not found or inactive' };
    }
    
    const newPlan = planResult.rows[0];
    const currentPrice = parseFloat(currentSub.discounted_price || currentSub.original_price || 0);
    const newPrice = parseFloat(newPlan.price);
    
    // Calculate prorated charge
    const now = new Date();
    const nextChargeDate = new Date(currentSub.next_charge_date);
    const daysInMonth = 30;
    const daysLeft = Math.max(1, Math.ceil((nextChargeDate - now) / (1000 * 60 * 60 * 24)));
    
    const proratedAmount = Math.round(((newPrice - currentPrice) / daysInMonth) * daysLeft * 100) / 100;
    
    // Only charge if there's a positive difference
    if (proratedAmount > 0) {
      // Try to charge using Sumit
      const chargeResult = await chargeProrata(userId, proratedAmount, currentSub, newPlan);
      
      if (!chargeResult.success) {
        console.error('[AutoUpgrade] Charge failed:', chargeResult.error);
        return { success: false, error: 'Payment failed' };
      }
    }
    
    // Update subscription to new plan
    await db.query(`
      UPDATE user_subscriptions 
      SET plan_id = $1, 
          original_price = $2,
          discounted_price = $2,
          updated_at = NOW()
      WHERE user_id = $3
    `, [targetPlanId, newPrice, userId]);
    
    // Log the upgrade
    console.log(`[AutoUpgrade] User ${userId} upgraded from ${currentSub.plan_name} to ${newPlan.name_he}. Charged: ${proratedAmount} ILS`);
    
    // Record in payment history
    if (proratedAmount > 0) {
      await db.query(`
        INSERT INTO payment_history (user_id, amount, currency, status, description, metadata)
        VALUES ($1, $2, 'ILS', 'completed', $3, $4)
      `, [
        userId, 
        proratedAmount, 
        `שדרוג אוטומטי ל${newPlan.name_he}`,
        JSON.stringify({
          type: 'auto_upgrade',
          from_plan: currentSub.plan_id,
          to_plan: targetPlanId,
          prorated_days: daysLeft
        })
      ]);
    }
    
    return { 
      success: true, 
      chargedAmount: proratedAmount,
      newPlan: newPlan.name_he,
      newLimit: newPlan.max_bot_runs_per_month
    };
    
  } catch (error) {
    console.error('[AutoUpgrade] Error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Charge prorated amount using Sumit
 */
async function chargeProrata(userId, amount, currentSub, newPlan) {
  try {
    // Get payment method
    const paymentResult = await db.query(`
      SELECT * FROM user_payment_methods 
      WHERE user_id = $1 AND is_active = true 
      ORDER BY is_default DESC, created_at DESC 
      LIMIT 1
    `, [userId]);
    
    if (paymentResult.rows.length === 0) {
      return { success: false, error: 'No payment method' };
    }
    
    const paymentMethod = paymentResult.rows[0];
    
    // If amount is very small (less than 1 ILS), skip charge
    if (amount < 1) {
      console.log(`[AutoUpgrade] Amount ${amount} too small, skipping charge`);
      return { success: true, skipped: true };
    }
    
    // Use Sumit to charge
    const sumitService = require('./payment/sumit.service');
    
    const chargeResult = await sumitService.chargeToken(
      paymentMethod.token,
      Math.round(amount * 100) / 100, // Round to 2 decimals
      `שדרוג אוטומטי ל${newPlan.name_he}`
    );
    
    if (!chargeResult.success) {
      return { success: false, error: chargeResult.error || 'Charge failed' };
    }
    
    return { success: true, transactionId: chargeResult.transactionId };
    
  } catch (error) {
    console.error('[AutoUpgrade] Charge prorata error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send auto-upgrade success email
 */
async function sendAutoUpgradeEmail(user, oldSub, upgradeResult) {
  try {
    const subject = `✅ המנוי שלך שודרג אוטומטית - Botomat`;
    
    const html = `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #4F46E5; margin: 0;">Botomat</h1>
        </div>
        
        <div style="background: #ECFDF5; border-radius: 16px; padding: 24px; margin-bottom: 24px;">
          <h2 style="color: #059669; margin: 0 0 12px 0;">
            ✅ המנוי שלך שודרג!
          </h2>
          <p style="color: #1F2937; margin: 0;">
            שלום ${user.name || 'משתמש'},<br><br>
            הגעת למגבלת ההרצות החודשית, ולכן המנוי שלך שודרג אוטומטית לתוכנית <strong>${upgradeResult.newPlan}</strong>.
          </p>
        </div>
        
        <div style="background: #F3F4F6; border-radius: 16px; padding: 24px; margin-bottom: 24px;">
          <h3 style="color: #374151; margin: 0 0 16px 0;">📋 פרטי השדרוג</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #6B7280;">תוכנית קודמת:</td>
              <td style="padding: 8px 0; text-align: left; font-weight: bold;">${oldSub.plan_name}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6B7280;">תוכנית חדשה:</td>
              <td style="padding: 8px 0; text-align: left; font-weight: bold; color: #059669;">${upgradeResult.newPlan}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6B7280;">הרצות חדשות:</td>
              <td style="padding: 8px 0; text-align: left; font-weight: bold;">${upgradeResult.newLimit === -1 ? 'ללא הגבלה' : upgradeResult.newLimit.toLocaleString()}</td>
            </tr>
            ${upgradeResult.chargedAmount > 0 ? `
            <tr>
              <td style="padding: 8px 0; color: #6B7280;">חיוב יחסי:</td>
              <td style="padding: 8px 0; text-align: left; font-weight: bold;">₪${upgradeResult.chargedAmount}</td>
            </tr>
            ` : ''}
          </table>
        </div>
        
        <div style="text-align: center;">
          <a href="https://botomat.co.il/settings?tab=subscription" 
             style="display: inline-block; background: linear-gradient(135deg, #4F46E5, #7C3AED); color: white; padding: 16px 32px; text-decoration: none; border-radius: 12px; font-weight: bold;">
            צפה בהגדרות המנוי
          </a>
        </div>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #E5E7EB; text-align: center; color: #9CA3AF; font-size: 12px;">
          <p>ניתן לבטל את השדרוג האוטומטי בהגדרות המנוי.</p>
          <p>© ${new Date().getFullYear()} Botomat. כל הזכויות שמורות.</p>
        </div>
      </div>
    `;
    
    await sendMail(user.email, subject, html);
    
    // Also create system notification
    await db.query(`
      INSERT INTO system_notifications (user_id, notification_type, title, message, alert_level, metadata)
      VALUES ($1, 'auto_upgrade', $2, $3, 'success', $4)
    `, [
      user.id,
      `✅ המנוי שודרג ל${upgradeResult.newPlan}`,
      `המנוי שלך שודרג אוטומטית. ${upgradeResult.chargedAmount > 0 ? `חויבת ב-₪${upgradeResult.chargedAmount} באופן יחסי.` : ''}`,
      JSON.stringify({
        type: 'auto_upgrade',
        new_plan: upgradeResult.newPlan,
        new_limit: upgradeResult.newLimit,
        charged_amount: upgradeResult.chargedAmount
      })
    ]);
    
    console.log(`[AutoUpgrade] Sent notification to ${user.email}`);
    
  } catch (error) {
    console.error('[AutoUpgrade] Send email error:', error);
  }
}

module.exports = {
  checkUserUsage,
  checkBotRunsUsageAndAlert,
  performAutoUpgrade,
  getUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  markSelectedNotificationsRead,
  deleteUserNotification,
  sendBroadcastNotification,
  getUnreadCount,
  getNotificationPreferences,
  updateNotificationPreferences
};
