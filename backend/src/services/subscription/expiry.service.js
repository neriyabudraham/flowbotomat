const db = require('../../config/database');
const { getWahaCredentials } = require('../settings/system.service');
const wahaSession = require('../waha/session.service');

/**
 * Check and handle expired subscriptions
 * Called periodically (e.g., every hour via cron)
 * Handles:
 * 1. Expired trial subscriptions (trial_ends_at < NOW())
 * 2. Expired active subscriptions (expires_at < NOW())
 * 3. Cancelled subscriptions past their end date
 */
async function handleExpiredSubscriptions() {
  console.log('[Subscription Expiry] Starting check...');
  
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
        
        // No payment method OR cancelled subscription - expire and disconnect
        console.log(`[Subscription Expiry] User ${sub.user_id} - expiring and downgrading to free...`);
        
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
        
        // Handle WhatsApp disconnection
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
          } else {
            // External connection - just disconnect from our system
            console.log(`[Subscription Expiry] Disconnecting external WhatsApp for user ${sub.user_id}`);
          }
          
          // Mark connection as disconnected in DB
          await db.query(`
            UPDATE whatsapp_connections 
            SET status = 'disconnected', disconnected_at = NOW(), updated_at = NOW()
            WHERE id = $1
          `, [sub.connection_id]);
        }
        
        // IMPORTANT: Deactivate ALL bots - user will need to choose ONE to keep
        // Mark them with a special flag so frontend knows to show selection UI
        await db.query(`
          UPDATE bots 
          SET is_active = false, 
              pending_deletion = true,
              updated_at = NOW()
          WHERE user_id = $1
        `, [sub.user_id]);
        
        // Create notification about downgrade
        await db.query(`
          INSERT INTO notifications (user_id, notification_type, title, message, metadata)
          VALUES ($1, 'subscription_expired', 'המנוי שלך הסתיים', 
                  'הבוטים שלך הושבתו. יש לך בוט אחד חינמי - בחר איזה בוט תרצה להשאיר.',
                  $2)
        `, [sub.user_id, JSON.stringify({ action: 'select_bot_to_keep' })]);
        
        console.log(`[Subscription Expiry] ✅ Expired and downgraded user ${sub.user_id} - all bots disabled, pending selection`);
        
      } catch (userError) {
        console.error(`[Subscription Expiry] Error processing user ${sub.user_id}:`, userError.message);
      }
    }
    
    console.log('[Subscription Expiry] Check completed');
    return { processed: expiredResult.rows.length };
    
  } catch (error) {
    console.error('[Subscription Expiry] Error:', error);
    throw error;
  }
}

/**
 * Send reminder notifications before trial expires
 * Called periodically (e.g., daily)
 */
async function sendTrialExpiryReminders() {
  console.log('[Trial Reminders] Starting...');
  
  try {
    // Find subscriptions expiring in 3 days
    const expiringResult = await db.query(`
      SELECT 
        us.*,
        u.name as user_name,
        u.email as user_email,
        sp.name_he as plan_name
      FROM user_subscriptions us
      JOIN users u ON us.user_id = u.id
      JOIN subscription_plans sp ON us.plan_id = sp.id
      WHERE us.status = 'trial' 
        AND us.trial_ends_at IS NOT NULL 
        AND us.trial_ends_at > NOW()
        AND us.trial_ends_at < NOW() + INTERVAL '3 days'
    `);
    
    console.log(`[Trial Reminders] Found ${expiringResult.rows.length} subscriptions expiring soon`);
    
    // TODO: Send email/notification to users
    // For now just log
    for (const sub of expiringResult.rows) {
      console.log(`[Trial Reminders] User ${sub.user_email} trial expires: ${sub.trial_ends_at}`);
    }
    
    return { reminders: expiringResult.rows.length };
    
  } catch (error) {
    console.error('[Trial Reminders] Error:', error);
    throw error;
  }
}

module.exports = {
  handleExpiredSubscriptions,
  sendTrialExpiryReminders,
};
