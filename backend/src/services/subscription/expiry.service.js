const db = require('../../config/database');
const { getWahaCredentials } = require('../settings/system.service');
const wahaSession = require('../waha/session.service');
const { sendMail } = require('../mail/transport.service');

/**
 * Check and handle expired subscriptions
 * Called periodically (e.g., every hour via cron)
 * Handles:
 * 1. Expired trial subscriptions (trial_ends_at < NOW())
 * 2. Expired active subscriptions (expires_at < NOW())
 * 3. Cancelled subscriptions past their end date
 */
async function handleExpiredSubscriptions() {
  try {
    // Find all expired subscriptions (trial, active, and cancelled past end date)
    const expiredResult = await db.query(`
      SELECT 
        us.*,
        u.email as user_email,
        wc.id as connection_id,
        wc.connection_type,
        wc.session_name
      FROM user_subscriptions us
      JOIN users u ON us.user_id = u.id
      LEFT JOIN whatsapp_connections wc ON wc.user_id = us.user_id AND wc.status = 'connected'
      WHERE (
        -- Expired trials
        (us.status = 'trial' AND us.trial_ends_at IS NOT NULL AND us.trial_ends_at < NOW())
        OR
        -- Expired active subscriptions
        (us.status = 'active' AND us.expires_at IS NOT NULL AND us.expires_at < NOW())
        OR
        -- Cancelled subscriptions past their end date (trial or paid)
        (us.status = 'cancelled' AND (
          (us.trial_ends_at IS NOT NULL AND us.trial_ends_at < NOW())
          OR (us.expires_at IS NOT NULL AND us.expires_at < NOW())
        ))
      )
    `);
    
    // Only log if there's something to process
    if (expiredResult.rows.length === 0) {
      return { processed: 0 };
    }
    
    console.log(`[Subscription Expiry] Found ${expiredResult.rows.length} expired subscriptions`);
    
    for (const sub of expiredResult.rows) {
      console.log(`[Subscription Expiry] Processing user ${sub.user_id} (${sub.user_email}) - status: ${sub.status}`);
      
      try {
        // For cancelled subscriptions, just expire and disconnect
        // For active/trial, check if they have payment method for potential renewal
        
        let shouldDisconnect = true;
        
        if (sub.status !== 'cancelled') {
          // Check if user has payment method
          const paymentCheck = await db.query(
            'SELECT id FROM user_payment_methods WHERE user_id = $1 AND is_active = true LIMIT 1',
            [sub.user_id]
          );
          
          const hasPayment = paymentCheck.rows.length > 0;
          
          if (hasPayment && sub.status === 'trial') {
            // Trial expired but has payment - handled by billing.service for auto-charge
            console.log(`[Subscription Expiry] User ${sub.user_id} trial expired with payment method - handled by billing`);
            continue; // Skip this, billing service will handle
          }
          
          if (hasPayment && sub.status === 'active') {
            // Active expired but has payment - also handled by billing.service
            console.log(`[Subscription Expiry] User ${sub.user_id} subscription expired with payment method - handled by billing`);
            continue; // Skip this, billing service will handle
          }
        }
        
        // No payment method OR cancelled subscription - expire and downgrade
        console.log(`[Subscription Expiry] User ${sub.user_id} - expiring and downgrading to free...`);
        
        // Check if user has external connection - they get unlimited free tier
        const isExternalConnection = sub.connection_type === 'external';
        
        // Mark subscription as expired AND clear all end dates
        // This moves user to "free" tier with no subscription
        await db.query(`
          UPDATE user_subscriptions 
          SET status = 'expired', 
              expires_at = NULL,
              trial_ends_at = NULL,
              next_charge_date = NULL,
              updated_at = NOW()
          WHERE user_id = $1 AND id = $2
        `, [sub.user_id, sub.id]);
        
        // Handle WhatsApp disconnection - ONLY for managed connections
        if (sub.connection_id && shouldDisconnect) {
          if (sub.connection_type === 'managed') {
            // Managed connection - delete from WAHA
            console.log(`[Subscription Expiry] Deleting managed WhatsApp session: ${sub.session_name}`);
            
            try {
              const { baseUrl, apiKey } = getWahaCredentials();
              if (baseUrl && apiKey && sub.session_name) {
                await wahaSession.deleteSession(baseUrl, apiKey, sub.session_name);
                console.log(`[Subscription Expiry] ✅ Deleted WAHA session: ${sub.session_name}`);
              }
            } catch (err) {
              console.error(`[Subscription Expiry] Failed to delete WAHA session: ${err.message}`);
            }
            
            // Mark connection as disconnected in DB (only for managed)
            await db.query(`
              UPDATE whatsapp_connections 
              SET status = 'disconnected', updated_at = NOW()
              WHERE id = $1
            `, [sub.connection_id]);
          } else {
            // External connection - keep it connected, just log
            console.log(`[Subscription Expiry] External WhatsApp for user ${sub.user_id} - keeping connection, downgrading to free tier`);
          }
        }
        
        // IMPORTANT: Keep only the allowed number of bots UNLOCKED
        // Get the user's bot limit from free plan
        const freePlanResult = await db.query(`
          SELECT max_bots FROM subscription_plans WHERE price = 0 AND is_active = true LIMIT 1
        `);
        const allowedBots = freePlanResult.rows[0]?.max_bots || 1;
        
        // Get the most recently updated bots up to the limit
        const botsToKeep = await db.query(`
          SELECT id, name FROM bots 
          WHERE user_id = $1 AND pending_deletion = false
          ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
          LIMIT $2
        `, [sub.user_id, allowedBots === -1 ? 1000 : allowedBots]);
        
        const keepBotIds = botsToKeep.rows.map(b => b.id);
        
        if (keepBotIds.length > 0) {
          // LOCK all bots EXCEPT the ones we're keeping
          await db.query(`
            UPDATE bots 
            SET is_active = false,
                locked_reason = 'subscription_limit',
                locked_at = NOW(),
                updated_at = NOW()
            WHERE user_id = $1 AND id != ALL($2::uuid[])
          `, [sub.user_id, keepBotIds]);
          
          // Make sure the kept bots are unlocked and the first one is active
          await db.query(`
            UPDATE bots 
            SET locked_reason = NULL,
                locked_at = NULL,
                is_active = CASE WHEN id = $2 THEN true ELSE false END,
                updated_at = NOW()
            WHERE id = ANY($1::uuid[])
          `, [keepBotIds, keepBotIds[0]]);
          
          console.log(`[Subscription Expiry] Kept ${keepBotIds.length} bots unlocked for user ${sub.user_id}, locked others`);
        } else {
          // No bots to keep - lock all
          await db.query(`
            UPDATE bots 
            SET is_active = false,
                locked_reason = 'subscription_limit',
                locked_at = NOW(),
                updated_at = NOW()
            WHERE user_id = $1
          `, [sub.user_id]);
        }
        
        // Disable all group forwards (they require an active subscription)
        await db.query(
          `UPDATE group_forwards SET is_active = false, updated_at = NOW() WHERE user_id = $1 AND is_active = true`,
          [sub.user_id]
        );

        // Cancel any pending/sending broadcast campaigns
        await db.query(
          `UPDATE broadcast_campaigns SET status = 'cancelled', updated_at = NOW()
           WHERE user_id = $1 AND status IN ('pending', 'active', 'sending', 'scheduled')`,
          [sub.user_id]
        );

        console.log(`[Subscription Expiry] Disabled group forwards and broadcasts for user ${sub.user_id}`);

        const mostRecentBot = botsToKeep.rows[0];

        // Create notification about downgrade - different message for external users
        const mostRecentBotName = mostRecentBot?.name || null;
        const keptBotCount = keepBotIds.length;
        
        // Count how many bots were locked
        const lockedBotsResult = await db.query(
          `SELECT COUNT(*) as count FROM bots WHERE user_id = $1 AND locked_reason = 'subscription_limit'`,
          [sub.user_id]
        );
        const lockedBotCount = parseInt(lockedBotsResult.rows[0]?.count || 0);
        
        let notificationMessage;
        if (lockedBotCount > 0) {
          notificationMessage = isExternalConnection 
            ? `הורדת לתוכנית חינמית. הבוט "${mostRecentBotName || 'הראשי'}" נשאר פעיל, ${lockedBotCount} בוטים נחסמו. החיבור לשרת שלך נשמר.`
            : `הורדת לתוכנית חינמית. הבוט "${mostRecentBotName || 'הראשי'}" נשאר פעיל, ${lockedBotCount} בוטים נחסמו. שדרג את התוכנית כדי לפתוח אותם.`;
        } else {
          notificationMessage = isExternalConnection 
            ? `הורדת לתוכנית חינמית. החיבור לשרת שלך נשמר.`
            : `הורדת לתוכנית חינמית.`;
        }
        
        await db.query(`
          INSERT INTO notifications (user_id, notification_type, title, message, metadata)
          VALUES ($1, 'subscription_expired', 'המנוי שלך הסתיים', $2, $3)
        `, [sub.user_id, notificationMessage, JSON.stringify({ 
          action: 'subscription_expired', 
          is_external: isExternalConnection,
          kept_bot_ids: keepBotIds,
          kept_bot_name: mostRecentBotName,
          locked_bot_count: lockedBotCount
        })]);
        
        console.log(`[Subscription Expiry] ✅ Expired and downgraded user ${sub.user_id} - kept bot ${mostRecentBot.rows[0]?.id || 'none'} active${isExternalConnection ? ' (external connection kept)' : ''}`);
        
      } catch (userError) {
        console.error(`[Subscription Expiry] Error processing user ${sub.user_id}:`, userError.message);
      }
    }
    
    console.log(`[Subscription Expiry] ✅ Processed ${expiredResult.rows.length} expired subscriptions`);
    return { processed: expiredResult.rows.length };
    
  } catch (error) {
    console.error('[Subscription Expiry] Error:', error);
    throw error;
  }
}

/**
 * Send reminder notifications before trial expires
 * Called periodically (e.g., daily)
 * Sends reminders at 3 days and 1 day before expiry
 */
async function sendTrialExpiryReminders() {
  console.log('[Trial Reminders] Starting...');
  
  try {
    // Find subscriptions expiring in 3 days OR 1 day
    // Only select those that haven't been notified recently (check notifications table)
    const expiringResult = await db.query(`
      SELECT 
        us.*,
        u.name as user_name,
        u.email as user_email,
        sp.name_he as plan_name,
        sp.price as plan_price,
        (SELECT COUNT(*) > 0 FROM user_payment_methods pm WHERE pm.user_id = us.user_id AND pm.is_active = true) as has_payment_method,
        -- Check how many days until expiry
        EXTRACT(DAY FROM us.trial_ends_at - NOW()) as days_until_expiry,
        -- Check if we already sent a notification today
        (SELECT COUNT(*) > 0 FROM notifications n 
         WHERE n.user_id = us.user_id 
         AND n.notification_type = 'trial_expiring'
         AND n.created_at > NOW() - INTERVAL '20 hours') as already_notified_today
      FROM user_subscriptions us
      JOIN users u ON us.user_id = u.id
      JOIN subscription_plans sp ON us.plan_id = sp.id
      WHERE us.status = 'trial' 
        AND us.trial_ends_at IS NOT NULL 
        AND us.trial_ends_at > NOW()
        AND us.trial_ends_at < NOW() + INTERVAL '3 days'
    `);
    
    if (expiringResult.rows.length === 0) {
      return { reminders: 0 };
    }
    
    console.log(`[Trial Reminders] Found ${expiringResult.rows.length} trial subscriptions expiring soon`);
    
    let sentCount = 0;
    
    for (const sub of expiringResult.rows) {
      // Skip if already notified today
      if (sub.already_notified_today) {
        continue;
      }
      
      try {
        const daysLeft = Math.ceil(sub.days_until_expiry);
        const expiresAt = new Date(sub.trial_ends_at);
        const formattedDate = expiresAt.toLocaleDateString('he-IL', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
        
        // Calculate what they'll pay if they continue
        const { chargeAmount, discountDescription } = calculateChargeAmount({
          ...sub,
          custom_discount_mode: sub.custom_discount_mode,
          custom_fixed_price: sub.custom_fixed_price,
          referral_discount_percent: sub.referral_discount_percent,
          referral_months_remaining: sub.referral_months_remaining,
          billing_period: sub.billing_period
        });
        
        // Create in-app notification
        await db.query(`
          INSERT INTO notifications (user_id, notification_type, title, message, metadata)
          VALUES ($1, 'trial_expiring', $2, $3, $4)
        `, [
          sub.user_id,
          daysLeft <= 1 ? 'תקופת הניסיון מסתיימת מחר!' : `תקופת הניסיון מסתיימת בעוד ${daysLeft} ימים`,
          sub.has_payment_method 
            ? `לאחר סיום הניסיון תחויב אוטומטית ב-₪${chargeAmount}${discountDescription}. ניתן לבטל בכל עת.`
            : `הוסף אמצעי תשלום כדי להמשיך להשתמש בשירות לאחר סיום הניסיון.`,
          JSON.stringify({
            trial_ends_at: sub.trial_ends_at,
            days_left: daysLeft,
            has_payment: sub.has_payment_method,
            charge_amount: chargeAmount
          })
        ]);
        
        // Send email
        if (sub.user_email) {
          const urgencyColor = daysLeft <= 1 ? '#e74c3c' : '#f39c12';
          
          await sendMail(
            sub.user_email,
            daysLeft <= 1 
              ? `⏰ תקופת הניסיון שלך מסתיימת מחר!`
              : `תקופת הניסיון שלך מסתיימת בעוד ${daysLeft} ימים`,
            `
              <div dir="rtl" style="font-family: Arial, sans-serif;">
                <h2 style="color: ${urgencyColor};">שלום ${sub.user_name || ''},</h2>
                <p>תקופת הניסיון שלך בתוכנית "${sub.plan_name}" מסתיימת ב-<strong>${formattedDate}</strong>.</p>
                
                ${sub.has_payment_method ? `
                  <div style="background: #e8f5e9; padding: 15px; border-radius: 8px; margin: 15px 0;">
                    <p style="margin: 0; color: #2e7d32;">
                      ✅ יש לך אמצעי תשלום שמור. לאחר סיום הניסיון תחויב אוטומטית ב-<strong>₪${chargeAmount}${discountDescription}</strong>.
                    </p>
                  </div>
                  <p>אם אינך מעוניין להמשיך, תוכל לבטל את המנוי לפני סיום הניסיון:</p>
                  <p><a href="${process.env.FRONTEND_URL}/settings/billing" style="background: #f44336; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">בטל מנוי</a></p>
                ` : `
                  <div style="background: #fff3e0; padding: 15px; border-radius: 8px; margin: 15px 0;">
                    <p style="margin: 0; color: #e65100;">
                      ⚠️ לא הוספת עדיין אמצעי תשלום. לאחר סיום הניסיון החשבון שלך יעבור לתוכנית החינמית.
                    </p>
                  </div>
                  <p>כדי להמשיך ליהנות מכל היתרונות, הוסף אמצעי תשלום עכשיו:</p>
                  <p><a href="${process.env.FRONTEND_URL}/settings/billing" style="background: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">הוסף אמצעי תשלום</a></p>
                `}
                
                <p style="color: #666; font-size: 12px; margin-top: 30px;">
                  יש לך שאלות? אנחנו כאן לעזור - פשוט השב למייל הזה.
                </p>
              </div>
            `
          );
        }
        
        sentCount++;
        console.log(`[Trial Reminders] Sent reminder to ${sub.user_email} - ${daysLeft} days left`);
        
      } catch (userError) {
        console.error(`[Trial Reminders] Error processing user ${sub.user_email}:`, userError.message);
      }
    }
    
    console.log(`[Trial Reminders] ✅ Sent ${sentCount} reminders`);
    return { reminders: sentCount };
    
  } catch (error) {
    console.error('[Trial Reminders] Error:', error);
    throw error;
  }
}

/**
 * Calculate charge amount with discounts
 */
function calculateChargeAmount(sub) {
  let chargeAmount = parseFloat(sub.plan_price);
  let discountDescription = '';
  
  // Apply custom discount from admin
  if (sub.custom_discount_mode === 'fixed_price' && sub.custom_fixed_price) {
    chargeAmount = parseFloat(sub.custom_fixed_price);
    discountDescription = ` (מחיר מותאם)`;
  } else if (sub.custom_discount_mode === 'percent' && sub.referral_discount_percent) {
    chargeAmount = Math.floor(chargeAmount * (1 - sub.referral_discount_percent / 100));
    discountDescription = ` (${sub.referral_discount_percent}% הנחה)`;
  }
  // Apply referral discount if active
  else if (sub.referral_discount_percent && sub.referral_months_remaining > 0) {
    chargeAmount = Math.floor(chargeAmount * (1 - sub.referral_discount_percent / 100));
    discountDescription = ` (${sub.referral_discount_percent}% הנחת הפניה)`;
  }
  // Apply yearly discount if billing period is yearly
  else if (sub.billing_period === 'yearly') {
    chargeAmount = chargeAmount * 12 * 0.8; // 20% yearly discount
    discountDescription = ` (שנתי - 20% הנחה)`;
  }
  
  return { chargeAmount, discountDescription };
}

/**
 * Handle manual subscriptions approaching expiry
 * - Sends notifications 5 days before expiry
 * - If user has payment method, schedules a charge (with discounts)
 * Called daily
 */
async function handleExpiringManualSubscriptions() {
  console.log('[Manual Expiry] Checking manual subscriptions approaching expiry...');
  
  try {
    // Find manual subscriptions expiring in 5 days that haven't been notified yet
    const expiringResult = await db.query(`
      SELECT 
        us.*,
        u.id as uid,
        u.name as user_name,
        u.email as user_email,
        sp.name_he as plan_name,
        sp.price as plan_price,
        (SELECT COUNT(*) > 0 FROM user_payment_methods pm WHERE pm.user_id = us.user_id AND pm.is_active = true) as has_payment_method,
        (SELECT COUNT(*) > 0 FROM billing_queue bq WHERE bq.user_id = us.user_id AND bq.status = 'pending' AND bq.charge_date = us.expires_at::date) as has_scheduled_charge
      FROM user_subscriptions us
      JOIN users u ON us.user_id = u.id
      JOIN subscription_plans sp ON us.plan_id = sp.id
      WHERE us.is_manual = true 
        AND us.status = 'active'
        AND sp.price > 0
        AND us.expires_at IS NOT NULL 
        AND us.expires_at > NOW()
        AND us.expires_at < NOW() + INTERVAL '5 days'
    `);
    
    if (expiringResult.rows.length === 0) {
      return { processed: 0, scheduled: 0, notified: 0 };
    }
    
    console.log(`[Manual Expiry] Found ${expiringResult.rows.length} manual subscriptions expiring soon`);
    
    let scheduled = 0;
    let notified = 0;
    
    for (const sub of expiringResult.rows) {
      try {
        // Skip if already has a scheduled charge
        if (sub.has_scheduled_charge) {
          console.log(`[Manual Expiry] User ${sub.user_email} already has scheduled charge, skipping`);
          continue;
        }
        
        const expiresAt = new Date(sub.expires_at);
        const formattedDate = expiresAt.toLocaleDateString('he-IL', { 
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
        });
        
        // Calculate charge amount with discounts
        const { chargeAmount, discountDescription } = calculateChargeAmount(sub);
        
        if (sub.has_payment_method) {
          // Schedule charge in billing queue
          await db.query(`
            INSERT INTO billing_queue (user_id, subscription_id, amount, charge_date, status, billing_type, plan_id, description)
            VALUES ($1, $2, $3, $4::date, 'pending', 'renewal', $5, $6)
            ON CONFLICT DO NOTHING
          `, [
            sub.user_id, 
            sub.id, 
            chargeAmount, 
            sub.expires_at,
            sub.plan_id,
            `חידוש מנוי - ${sub.plan_name}${discountDescription}`
          ]);
          
          scheduled++;
          console.log(`[Manual Expiry] Scheduled renewal charge for ${sub.user_email}: ₪${chargeAmount}${discountDescription} on ${expiresAt.toISOString().split('T')[0]}`);
          
          // Send notification about upcoming charge
          await sendMail(
            sub.user_email,
            `המנוי שלך יחודש אוטומטית ב-${formattedDate}`,
            `
              <div dir="rtl" style="font-family: Arial, sans-serif;">
                <h2>שלום ${sub.user_name || ''},</h2>
                <p>המנוי שלך לתכנית "${sub.plan_name}" יסתיים ב-${formattedDate}.</p>
                <p>מכיוון שיש לך אמצעי תשלום שמור, המנוי יחודש אוטומטית ותחויב ב-₪${chargeAmount}${discountDescription}.</p>
                <p>אם אינך מעוניין בחידוש, ניתן לבטל את המנוי עד למועד זה:</p>
                <p><a href="${process.env.FRONTEND_URL}/settings/billing" style="background: #f59e0b; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">נהל מנוי</a></p>
              </div>
            `
          );
          
        } else {
          // No payment method - just notify about expiry
          await sendMail(
            sub.user_email,
            `המנוי שלך מסתיים ב-${formattedDate}`,
            `
              <div dir="rtl" style="font-family: Arial, sans-serif;">
                <h2>שלום ${sub.user_name || ''},</h2>
                <p>המנוי שלך לתכנית "${sub.plan_name}" יסתיים ב-${formattedDate}.</p>
                <p>לאחר תאריך זה, החשבון שלך יעבור לתכנית החינמית.</p>
                <p>כדי להמשיך ליהנות מהיתרונות של התכנית הנוכחית, הוסף אמצעי תשלום:</p>
                <p><a href="${process.env.FRONTEND_URL}/settings/billing" style="background: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">הוסף אמצעי תשלום</a></p>
              </div>
            `
          );
          
          console.log(`[Manual Expiry] Notified ${sub.user_email} about expiring subscription (no payment method)`);
        }
        
        notified++;
        
        // Create in-app notification
        await db.query(`
          INSERT INTO notifications (user_id, notification_type, title, message, metadata)
          VALUES ($1, 'subscription_expiring', 'המנוי שלך מסתיים בקרוב', $2, $3)
          ON CONFLICT DO NOTHING
        `, [
          sub.user_id,
          sub.has_payment_method 
            ? `המנוי שלך יחודש אוטומטית ב-${formattedDate} ותחויב ב-₪${chargeAmount}${discountDescription}`
            : `המנוי שלך מסתיים ב-${formattedDate}. הוסף אמצעי תשלום כדי להמשיך.`,
          JSON.stringify({ 
            expires_at: sub.expires_at, 
            has_payment: sub.has_payment_method,
            plan_name: sub.plan_name,
            charge_amount: chargeAmount
          })
        ]);
        
      } catch (userError) {
        console.error(`[Manual Expiry] Error processing user ${sub.user_email}:`, userError.message);
      }
    }
    
    console.log(`[Manual Expiry] ✅ Processed ${expiringResult.rows.length} subscriptions: ${scheduled} scheduled, ${notified} notified`);
    return { processed: expiringResult.rows.length, scheduled, notified };
    
  } catch (error) {
    console.error('[Manual Expiry] Error:', error);
    throw error;
  }
}

/**
 * Handle expired service subscriptions (Status Bot, etc.)
 * Called periodically (e.g., every hour via cron)
 */
async function handleExpiredServiceSubscriptions() {
  try {
    // Find all expired service subscriptions
    const expiredResult = await db.query(`
      SELECT 
        uss.*,
        u.email as user_email,
        u.name as user_name,
        s.name_he as service_name,
        s.slug as service_slug
      FROM user_service_subscriptions uss
      JOIN users u ON uss.user_id = u.id
      JOIN additional_services s ON s.id = uss.service_id
      WHERE (
        -- Expired trials
        (uss.status = 'trial' AND uss.trial_ends_at IS NOT NULL AND uss.trial_ends_at < NOW())
        OR
        -- Expired active subscriptions
        (uss.status = 'active' AND uss.expires_at IS NOT NULL AND uss.expires_at < NOW())
        OR
        -- Cancelled subscriptions past their end date
        (uss.status = 'cancelled' AND (
          (uss.trial_ends_at IS NOT NULL AND uss.trial_ends_at < NOW())
          OR (uss.expires_at IS NOT NULL AND uss.expires_at < NOW())
        ))
      )
    `);
    
    if (expiredResult.rows.length === 0) {
      return { processed: 0 };
    }
    
    console.log(`[Service Expiry] Found ${expiredResult.rows.length} expired service subscriptions`);
    
    for (const sub of expiredResult.rows) {
      try {
        // Check if user has payment method for auto-renewal (except cancelled)
        if (sub.status !== 'cancelled') {
          const paymentCheck = await db.query(
            'SELECT id FROM user_payment_methods WHERE user_id = $1 AND is_active = true LIMIT 1',
            [sub.user_id]
          );
          
          // If has payment method, billing service should handle renewal
          if (paymentCheck.rows.length > 0) {
            console.log(`[Service Expiry] User ${sub.user_email} service subscription expired with payment method - handled by billing`);
            continue;
          }
        }
        
        // No payment or cancelled - expire the service
        console.log(`[Service Expiry] Expiring ${sub.service_slug} for user ${sub.user_email}`);
        
        await db.query(`
          UPDATE user_service_subscriptions 
          SET status = 'expired', 
              expires_at = NULL,
              trial_ends_at = NULL,
              next_charge_date = NULL,
              updated_at = NOW()
          WHERE id = $1
        `, [sub.id]);
        
        // Send notification
        await db.query(`
          INSERT INTO notifications (user_id, notification_type, title, message, metadata)
          VALUES ($1, 'service_expired', $2, $3, $4)
        `, [
          sub.user_id,
          `המנוי ל${sub.service_name} הסתיים`,
          `המנוי שלך לשירות "${sub.service_name}" הסתיים. הוסף אמצעי תשלום או חדש את המנוי כדי להמשיך להשתמש בשירות.`,
          JSON.stringify({ 
            service_id: sub.service_id, 
            service_slug: sub.service_slug,
            service_name: sub.service_name
          })
        ]);
        
        // Send email notification
        if (sub.user_email) {
          await sendMail(
            sub.user_email,
            `המנוי שלך ל${sub.service_name} הסתיים`,
            `
              <div dir="rtl" style="font-family: Arial, sans-serif;">
                <h2>שלום ${sub.user_name || ''},</h2>
                <p>המנוי שלך לשירות "<strong>${sub.service_name}</strong>" הסתיים.</p>
                <p>כדי להמשיך להשתמש בשירות, חדש את המנוי:</p>
                <p><a href="${process.env.FRONTEND_URL}/services" style="background: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">חדש מנוי</a></p>
              </div>
            `
          );
        }
        
        console.log(`[Service Expiry] ✅ Expired ${sub.service_slug} for user ${sub.user_email}`);
        
      } catch (userError) {
        console.error(`[Service Expiry] Error processing user ${sub.user_email}:`, userError.message);
      }
    }
    
    console.log(`[Service Expiry] ✅ Processed ${expiredResult.rows.length} expired service subscriptions`);
    return { processed: expiredResult.rows.length };
    
  } catch (error) {
    console.error('[Service Expiry] Error:', error);
    throw error;
  }
}

/**
 * Handle service subscriptions approaching expiry (like Status Bot)
 * - Sends notifications 5 days before expiry
 * - If user has payment method, schedules a charge
 * Called daily
 */
async function handleExpiringServiceSubscriptions() {
  console.log('[Service Expiry] Checking service subscriptions approaching expiry...');
  
  try {
    const expiringResult = await db.query(`
      SELECT 
        uss.*,
        u.id as uid,
        u.name as user_name,
        u.email as user_email,
        s.name_he as service_name,
        s.slug as service_slug,
        s.price as service_price,
        (SELECT COUNT(*) > 0 FROM user_payment_methods pm WHERE pm.user_id = uss.user_id AND pm.is_active = true) as has_payment_method,
        (SELECT COUNT(*) > 0 FROM billing_queue bq WHERE bq.user_id = uss.user_id AND bq.status = 'pending' AND bq.billing_type = 'status_bot') as has_scheduled_charge
      FROM user_service_subscriptions uss
      JOIN users u ON uss.user_id = u.id
      JOIN additional_services s ON s.id = uss.service_id
      WHERE uss.status = 'active'
        AND s.price > 0
        AND uss.expires_at IS NOT NULL 
        AND uss.expires_at > NOW()
        AND uss.expires_at < NOW() + INTERVAL '5 days'
    `);
    
    if (expiringResult.rows.length === 0) {
      return { processed: 0, scheduled: 0, notified: 0 };
    }
    
    console.log(`[Service Expiry] Found ${expiringResult.rows.length} service subscriptions expiring soon`);
    
    let scheduled = 0;
    let notified = 0;
    
    for (const sub of expiringResult.rows) {
      try {
        if (sub.has_scheduled_charge) {
          console.log(`[Service Expiry] User ${sub.user_email} already has scheduled ${sub.service_slug} charge, skipping`);
          continue;
        }
        
        const expiresAt = new Date(sub.expires_at);
        const formattedDate = expiresAt.toLocaleDateString('he-IL', { 
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
        });
        
        const chargeAmount = parseFloat(sub.service_price);
        
        if (sub.has_payment_method && sub.service_slug === 'status-bot') {
          // Schedule charge in billing queue for Status Bot
          await db.query(`
            INSERT INTO billing_queue (user_id, subscription_id, amount, charge_date, status, billing_type, description)
            VALUES ($1, $2, $3, $4::date, 'pending', 'status_bot', $5)
            ON CONFLICT DO NOTHING
          `, [
            sub.user_id, 
            sub.id, 
            chargeAmount, 
            sub.expires_at,
            `${sub.service_name} - חודשי`
          ]);
          
          scheduled++;
          console.log(`[Service Expiry] Scheduled ${sub.service_slug} renewal charge for ${sub.user_email}: ₪${chargeAmount}`);
        }
        
        // Create in-app notification
        await db.query(`
          INSERT INTO notifications (user_id, notification_type, title, message, metadata)
          VALUES ($1, 'service_expiring', $2, $3, $4)
          ON CONFLICT DO NOTHING
        `, [
          sub.user_id,
          `המנוי ל${sub.service_name} מסתיים בקרוב`,
          sub.has_payment_method 
            ? `המנוי יחודש אוטומטית ב-${formattedDate} ותחויב ב-₪${chargeAmount}`
            : `המנוי מסתיים ב-${formattedDate}. הוסף אמצעי תשלום כדי להמשיך.`,
          JSON.stringify({ 
            expires_at: sub.expires_at, 
            has_payment: sub.has_payment_method,
            service_name: sub.service_name,
            charge_amount: chargeAmount
          })
        ]);
        
        notified++;
        
      } catch (userError) {
        console.error(`[Service Expiry] Error processing user ${sub.user_email}:`, userError.message);
      }
    }
    
    console.log(`[Service Expiry] ✅ Processed ${expiringResult.rows.length} subscriptions: ${scheduled} scheduled, ${notified} notified`);
    return { processed: expiringResult.rows.length, scheduled, notified };
    
  } catch (error) {
    console.error('[Service Expiry] Error:', error);
    throw error;
  }
}

module.exports = {
  handleExpiredSubscriptions,
  sendTrialExpiryReminders,
  handleExpiringManualSubscriptions,
  handleExpiredServiceSubscriptions,
  handleExpiringServiceSubscriptions,
};
