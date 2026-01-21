const db = require('../../config/database');
const { getWahaCredentials } = require('../settings/system.service');
const wahaSession = require('../waha/session.service');

/**
 * Check and handle expired subscriptions
 * Called periodically (e.g., every hour via cron)
 */
async function handleExpiredSubscriptions() {
  console.log('[Subscription Expiry] Starting check...');
  
  try {
    // Find expired trial subscriptions
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
      WHERE us.status = 'trial' 
        AND us.trial_ends_at IS NOT NULL 
        AND us.trial_ends_at < NOW()
    `);
    
    console.log(`[Subscription Expiry] Found ${expiredResult.rows.length} expired trial subscriptions`);
    
    for (const sub of expiredResult.rows) {
      console.log(`[Subscription Expiry] Processing user ${sub.user_id} (${sub.user_email})`);
      
      try {
        // Check if user has payment method
        const paymentCheck = await db.query(
          'SELECT id FROM user_payment_methods WHERE user_id = $1 AND is_active = true LIMIT 1',
          [sub.user_id]
        );
        
        const hasPayment = paymentCheck.rows.length > 0;
        
        if (hasPayment) {
          // User has payment method - attempt to charge and activate subscription
          console.log(`[Subscription Expiry] User ${sub.user_id} has payment method, attempting charge...`);
          
          // TODO: Implement charging logic here
          // For now, just extend trial or mark as expired
          
          // Mark subscription as expired (needs manual attention or auto-charge)
          await db.query(`
            UPDATE user_subscriptions 
            SET status = 'expired', updated_at = NOW()
            WHERE user_id = $1
          `, [sub.user_id]);
          
        } else {
          // No payment method - expire subscription and disconnect WhatsApp
          console.log(`[Subscription Expiry] User ${sub.user_id} has no payment, expiring...`);
          
          // Mark subscription as expired
          await db.query(`
            UPDATE user_subscriptions 
            SET status = 'expired', updated_at = NOW()
            WHERE user_id = $1
          `, [sub.user_id]);
          
          // Handle WhatsApp disconnection
          if (sub.connection_id) {
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
          
          // Deactivate all bots
          await db.query(`
            UPDATE bots 
            SET is_active = false, updated_at = NOW()
            WHERE user_id = $1
          `, [sub.user_id]);
        }
        
        console.log(`[Subscription Expiry] ✅ Processed user ${sub.user_id}`);
        
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
