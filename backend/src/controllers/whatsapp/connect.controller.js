const pool = require('../../config/database');
const { v4: uuidv4 } = require('uuid');
const { getWahaCredentials } = require('../../services/settings/system.service');
const { encrypt, decrypt } = require('../../services/crypto/encrypt.service');
const wahaSession = require('../../services/waha/session.service');
const { checkLimit } = require('../subscriptions/subscriptions.controller');

// Webhook events we want to receive
const WEBHOOK_EVENTS = [
  'message',
  'message.ack',
  'session.status',
];

// Build webhook URL for user
function getWebhookUrl(userId) {
  const appUrl = process.env.APP_URL || 'https://flow.botomat.co.il';
  return `${appUrl}/api/webhook/waha/${userId}`;
}

const TRIAL_DAYS = 14; // 2 weeks trial period

/**
 * Create managed WhatsApp connection (system WAHA)
 * Sync is based on WAHA only (not DB)
 * Requires payment method and creates a trial subscription
 */
async function createManaged(req, res) {
  try {
    const userId = req.user.id;
    
    // Check if user has a payment method (required for WhatsApp connection)
    const paymentCheck = await pool.query(
      'SELECT id FROM user_payment_methods WHERE user_id = $1 AND is_active = true LIMIT 1',
      [userId]
    );
    
    if (paymentCheck.rows.length === 0) {
      return res.status(402).json({ 
        error: 'נדרש להזין פרטי כרטיס אשראי לפני חיבור WhatsApp. לא יבוצע חיוב בתקופת הניסיון.',
        code: 'PAYMENT_REQUIRED',
        trialDays: TRIAL_DAYS
      });
    }
    
    // Check if user already has an active subscription
    const subCheck = await pool.query(
      `SELECT * FROM user_subscriptions WHERE user_id = $1 AND status IN ('active', 'trial')`,
      [userId]
    );
    
    // If no subscription, create trial
    if (subCheck.rows.length === 0) {
      console.log(`[WhatsApp] Creating trial subscription for user ${userId}`);
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);
      
      // Get default plan (the basic paid plan)
      const planResult = await pool.query(
        `SELECT id FROM subscription_plans WHERE is_active = true AND price > 0 ORDER BY price ASC LIMIT 1`
      );
      
      if (planResult.rows.length > 0) {
        const planId = planResult.rows[0].id;
        const paymentMethodId = paymentCheck.rows[0].id;
        
        await pool.query(`
          INSERT INTO user_subscriptions (
            user_id, plan_id, status, is_trial, trial_ends_at, 
            payment_method_id, next_charge_date, started_at
          ) VALUES ($1, $2, 'trial', true, $3, $4, $3, NOW())
          ON CONFLICT (user_id) 
          DO UPDATE SET 
            plan_id = $2, 
            status = 'trial',
            is_trial = true,
            trial_ends_at = $3,
            payment_method_id = $4,
            next_charge_date = $3,
            started_at = NOW(),
            updated_at = NOW()
        `, [userId, planId, trialEndsAt, paymentMethodId]);
        
        console.log(`[WhatsApp] ✅ Trial subscription created, ends at: ${trialEndsAt.toISOString()}`);
      }
    }
    
    // Get user email - from token or from DB
    let userEmail = req.user.email;
    if (!userEmail) {
      const userResult = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
      userEmail = userResult.rows[0]?.email;
    }
    
    if (!userEmail) {
      return res.status(400).json({ error: 'לא נמצא מייל למשתמש' });
    }
    
    // Get system WAHA credentials
    const { baseUrl, apiKey } = getWahaCredentials();
    
    if (!baseUrl || !apiKey) {
      return res.status(500).json({ error: 'WAHA לא מוגדר במערכת' });
    }
    
    let sessionName = null;
    let wahaStatus = null;
    let existingSession = null;
    
    // Step 1: Search in WAHA by email (single source of truth)
    console.log(`[WhatsApp] Searching WAHA for session with email: ${userEmail}`);
    
    try {
      existingSession = await wahaSession.findSessionByEmail(baseUrl, apiKey, userEmail);
      
      if (existingSession) {
        sessionName = existingSession.name;
        console.log(`[WhatsApp] ✅ Found existing session by email: ${sessionName}`);
        
        wahaStatus = await wahaSession.getSessionStatus(baseUrl, apiKey, sessionName);
        
        // If stopped or failed, restart it
        if (wahaStatus.status === 'STOPPED' || wahaStatus.status === 'FAILED') {
          console.log(`[WhatsApp] Session is ${wahaStatus.status}, restarting...`);
          try {
            await wahaSession.stopSession(baseUrl, apiKey, sessionName);
          } catch (e) { /* ignore */ }
          await wahaSession.startSession(baseUrl, apiKey, sessionName);
          console.log(`[WhatsApp] ✅ Restarted session: ${sessionName}`);
          wahaStatus = await wahaSession.getSessionStatus(baseUrl, apiKey, sessionName);
        } else {
          console.log(`[WhatsApp] Session status: ${wahaStatus.status}`);
        }
      }
    } catch (err) {
      console.log(`[WhatsApp] Error searching sessions: ${err.message}`);
    }
    
    // Step 2: If no session found in WAHA, create new one
    if (!sessionName) {
      // Check subscription for WAHA creation permission
      const wahaAccess = await checkLimit(userId, 'waha_creation');
      if (!wahaAccess.allowed) {
        return res.status(403).json({ 
          error: 'יצירת חיבור WhatsApp מנוהל דורשת מנוי בתשלום. ניתן לחבר WAHA חיצוני בחינם.',
          upgrade_required: true
        });
      }
      
      // Generate unique session name - only alphanumeric and underscore allowed
      const uniqueId = require('crypto').randomBytes(4).toString('hex');
      sessionName = `session_${uniqueId}`;
      
      const sessionMetadata = {
        'user.email': userEmail,
      };
      
      console.log(`[WhatsApp] Creating new session: ${sessionName}`);
      
      await wahaSession.createSession(baseUrl, apiKey, sessionName, sessionMetadata);
      await wahaSession.startSession(baseUrl, apiKey, sessionName);
      console.log(`[WhatsApp] ✅ Created new session: ${sessionName}`);
      
      wahaStatus = await wahaSession.getSessionStatus(baseUrl, apiKey, sessionName);
    }
    
    // Get updated status
    try {
      wahaStatus = await wahaSession.getSessionStatus(baseUrl, apiKey, sessionName);
    } catch (err) {
      console.error('[WhatsApp] Failed to get session status:', err.message);
    }
    
    // Map WAHA status to our status
    const statusMap = {
      'WORKING': 'connected',
      'SCAN_QR_CODE': 'qr_pending',
      'STARTING': 'qr_pending',
      'STOPPED': 'disconnected',
      'FAILED': 'failed',
    };
    const ourStatus = statusMap[wahaStatus?.status] || 'qr_pending';
    
    // Extract phone info if connected
    let phoneNumber = null;
    let displayName = null;
    let connectedAt = null;
    
    if (ourStatus === 'connected' && wahaStatus?.me) {
      phoneNumber = wahaStatus.me.id?.split('@')[0] || null;
      displayName = wahaStatus.me.pushName || null;
      connectedAt = new Date();
    }
    
    // Setup webhook for this user (adds to existing webhooks)
    const webhookUrl = getWebhookUrl(userId);
    try {
      await wahaSession.addWebhook(baseUrl, apiKey, sessionName, webhookUrl, WEBHOOK_EVENTS);
      console.log(`[Webhook] Added for user ${userId}: ${webhookUrl}`);
    } catch (err) {
      console.error('[Webhook] Setup failed:', err.message);
    }
    
    // Delete any existing DB record for this user and create new one
    await pool.query('DELETE FROM whatsapp_connections WHERE user_id = $1', [userId]);
    
    const result = await pool.query(
      `INSERT INTO whatsapp_connections 
       (user_id, connection_type, session_name, status, phone_number, display_name, connected_at)
       VALUES ($1, 'managed', $2, $3, $4, $5, $6)
       RETURNING id, session_name, status, phone_number, display_name, created_at`,
      [userId, sessionName, ourStatus, phoneNumber, displayName, connectedAt]
    );
    console.log(`[WhatsApp] ✅ Saved to DB: ${sessionName}`);
    
    res.json({ 
      success: true, 
      connection: result.rows[0],
      existingSession: !!existingSession,
    });
  } catch (error) {
    console.error('Create managed connection error:', error.message);
    console.error('Full error:', error);
    res.status(500).json({ error: 'שגיאה ביצירת חיבור: ' + error.message });
  }
}

/**
 * Create external WhatsApp connection (user's own WAHA)
 * Requires payment method but allows free plan (no trial)
 */
async function createExternal(req, res) {
  try {
    const userId = req.user.id;
    const { baseUrl, apiKey, sessionName } = req.body;
    
    if (!baseUrl || !apiKey || !sessionName) {
      return res.status(400).json({ error: 'נדרשים כל השדות' });
    }
    
    // Check if user has a payment method (required even for external)
    const paymentCheck = await pool.query(
      'SELECT id FROM user_payment_methods WHERE user_id = $1 AND is_active = true LIMIT 1',
      [userId]
    );
    
    if (paymentCheck.rows.length === 0) {
      return res.status(402).json({ 
        error: 'נדרש להזין פרטי כרטיס אשראי גם לחיבור WAHA חיצוני. ניתן להשתמש בתוכנית החינמית.',
        code: 'PAYMENT_REQUIRED'
      });
    }
    
    // Check if user has a subscription - if not, create free plan subscription
    const subCheck = await pool.query(
      `SELECT * FROM user_subscriptions WHERE user_id = $1 AND status IN ('active', 'trial')`,
      [userId]
    );
    
    if (subCheck.rows.length === 0) {
      console.log(`[WhatsApp External] Creating free subscription for user ${userId}`);
      
      // Get free plan
      const freePlanResult = await pool.query(
        `SELECT id FROM subscription_plans WHERE is_active = true AND price = 0 LIMIT 1`
      );
      
      if (freePlanResult.rows.length > 0) {
        const freePlanId = freePlanResult.rows[0].id;
        const paymentMethodId = paymentCheck.rows[0].id;
        
        await pool.query(`
          INSERT INTO user_subscriptions (
            user_id, plan_id, status, is_trial, payment_method_id, started_at
          ) VALUES ($1, $2, 'active', false, $3, NOW())
          ON CONFLICT (user_id) 
          DO UPDATE SET 
            plan_id = $2, 
            status = 'active',
            is_trial = false,
            payment_method_id = $3,
            started_at = NOW(),
            updated_at = NOW()
        `, [userId, freePlanId, paymentMethodId]);
        
        console.log(`[WhatsApp External] ✅ Free subscription activated`);
      }
    }
    
    // Check if user already has a connection
    const existing = await pool.query(
      'SELECT id, status FROM whatsapp_connections WHERE user_id = $1',
      [userId]
    );
    
    // If connection exists and is connected, don't allow new one
    if (existing.rows.length > 0) {
      if (existing.rows[0].status === 'connected') {
        return res.status(400).json({ error: 'כבר יש לך חיבור WhatsApp פעיל' });
      }
      // Delete old non-connected entry
      await pool.query('DELETE FROM whatsapp_connections WHERE id = $1', [existing.rows[0].id]);
    }
    
    // Test connection and get actual status from WAHA
    let wahaStatus;
    try {
      wahaStatus = await wahaSession.getSessionStatus(baseUrl, apiKey, sessionName);
    } catch (err) {
      console.error('WAHA connection test failed:', err.message);
      return res.status(400).json({ error: 'לא ניתן להתחבר ל-WAHA. בדוק את הפרטים.' });
    }
    
    // Map WAHA status to our status
    const statusMap = {
      'WORKING': 'connected',
      'SCAN_QR_CODE': 'qr_pending',
      'STARTING': 'qr_pending',
      'STOPPED': 'disconnected',
      'FAILED': 'failed',
    };
    const ourStatus = statusMap[wahaStatus.status] || 'disconnected';
    
    // Extract phone info if connected
    let phoneNumber = null;
    let displayName = null;
    let connectedAt = null;
    
    if (ourStatus === 'connected' && wahaStatus.me) {
      phoneNumber = wahaStatus.me.id?.split('@')[0] || null;
      displayName = wahaStatus.me.pushName || null;
      connectedAt = new Date();
    }
    
    // Setup webhook for this user (adds to existing webhooks)
    const webhookUrl = getWebhookUrl(userId);
    try {
      await wahaSession.addWebhook(baseUrl, apiKey, sessionName, webhookUrl, WEBHOOK_EVENTS);
      console.log(`[Webhook] Configured for user ${userId}: ${webhookUrl}`);
    } catch (err) {
      console.error('[Webhook] Setup failed:', err.message);
      // Continue anyway - webhook can be configured manually
    }
    
    // Save connection to DB (encrypt sensitive data)
    const result = await pool.query(
      `INSERT INTO whatsapp_connections 
       (user_id, connection_type, external_base_url, external_api_key, session_name, 
        status, phone_number, display_name, connected_at)
       VALUES ($1, 'external', $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, session_name, status, phone_number, display_name, created_at`,
      [userId, encrypt(baseUrl), encrypt(apiKey), sessionName, 
       ourStatus, phoneNumber, displayName, connectedAt]
    );
    
    res.json({ 
      success: true, 
      connection: result.rows[0],
    });
  } catch (error) {
    console.error('Create external connection error:', error);
    res.status(500).json({ error: 'שגיאה ביצירת חיבור' });
  }
}

/**
 * Check if user has existing session in WAHA (by email)
 * Only checks if user has a payment method (to avoid showing session info to non-paying users)
 */
async function checkExisting(req, res) {
  try {
    const userId = req.user.id;
    
    // First check if user has payment method - don't show session info without it
    const paymentCheck = await pool.query(
      'SELECT id FROM user_payment_methods WHERE user_id = $1 AND is_active = true LIMIT 1',
      [userId]
    );
    
    if (paymentCheck.rows.length === 0) {
      // No payment method - don't check for existing sessions
      return res.json({ exists: false, requiresPayment: true });
    }
    
    // Get user email
    let userEmail = req.user.email;
    if (!userEmail) {
      const userResult = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
      userEmail = userResult.rows[0]?.email;
    }
    
    if (!userEmail) {
      return res.json({ exists: false });
    }
    
    // Get system WAHA credentials
    const { baseUrl, apiKey } = getWahaCredentials();
    
    if (!baseUrl || !apiKey) {
      return res.json({ exists: false });
    }
    
    // Search in WAHA by email - only for WORKING sessions
    console.log(`[WhatsApp] Checking existing session for: ${userEmail}`);
    
    const existingSession = await wahaSession.findSessionByEmail(baseUrl, apiKey, userEmail);
    
    if (existingSession && existingSession.status === 'WORKING') {
      console.log(`[WhatsApp] ✅ Found existing WORKING session: ${existingSession.name}`);
      
      return res.json({
        exists: true,
        sessionName: existingSession.name,
        status: existingSession.status,
        isConnected: true,
      });
    }
    
    console.log(`[WhatsApp] No active session found for: ${userEmail}`);
    return res.json({ exists: false });
    
  } catch (error) {
    console.error('Check existing error:', error.message);
    return res.json({ exists: false });
  }
}

module.exports = { createManaged, createExternal, checkExisting };
