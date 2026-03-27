const pool = require('../../config/database');
const { v4: uuidv4 } = require('uuid');
const { getWahaCredentials } = require('../../services/settings/system.service');
const { pickSourceForNewSession } = require('../../services/waha/sources.service');
const { encrypt, decrypt } = require('../../services/crypto/encrypt.service');
const wahaSession = require('../../services/waha/session.service');
const { checkLimit } = require('../subscriptions/subscriptions.controller');

// Webhook events we want to receive
const WEBHOOK_EVENTS = [
  'message',
  'message.ack',
  'session.status',
  'call.received',
  'call.accepted',
  'call.rejected',
  'label.upsert',
  'label.deleted',
  'label.chat.added',
  'label.chat.deleted',
  'poll.vote.failed',
  'poll.vote',
  'group.leave',
  'group.join',
  'group.v2.participants',
  'group.v2.update',
  'group.v2.leave',
  'group.v2.join',
  'presence.update',
  'message.reaction',
  'message.any',
  'message.ack.group',
  'message.waiting',
  'message.revoked',
  'message.edited',
  'chat.archive',
  'event.response',
  'event.response.failed',
];

// Build webhook URL for user
function getWebhookUrl(userId) {
  const appUrl = process.env.APP_URL || 'https://botomat.co.il';
  return `${appUrl}/api/webhook/waha/${userId}`;
}

// Get trial configuration from site_config
async function getTrialConfig() {
  try {
    const result = await pool.query(
      "SELECT value FROM system_settings WHERE key = 'site_config'"
    );
    if (result.rows.length > 0 && result.rows[0].value?.trial) {
      return result.rows[0].value.trial;
    }
  } catch (e) {
    console.error('[WhatsApp] Error getting trial config:', e);
  }
  // Default - trial disabled
  return { enabled: false, days: 14, modules: [] };
}

/**
 * Create managed WhatsApp connection (system WAHA)
 * Sync is based on WAHA only (not DB)
 * Can work with free plan if admin enabled allow_waha_creation for it
 */
async function createManaged(req, res) {
  try {
    const userId = req.user.id;
    
    // Check global credit card requirement setting
    const ccRequiredResult = await pool.query(
      `SELECT value FROM system_settings WHERE key = 'require_credit_card_for_whatsapp'`
    );
    const creditCardRequired = ccRequiredResult.rows[0]?.value === true || ccRequiredResult.rows[0]?.value === 'true';
    
    // Check if user is exempt from credit card requirement
    const userExemptResult = await pool.query(
      `SELECT credit_card_exempt FROM users WHERE id = $1`,
      [userId]
    );
    const isExempt = userExemptResult.rows[0]?.credit_card_exempt === true;
    
    // Check if user has a manual subscription (bypasses payment requirement)
    const manualSubCheck = await pool.query(
      `SELECT id FROM user_subscriptions WHERE user_id = $1 AND is_manual = true AND status = 'active'`,
      [userId]
    );
    
    const hasManualSubscription = manualSubCheck.rows.length > 0;
    
    // Check if user has a payment method
    const paymentCheck = await pool.query(
      'SELECT id FROM user_payment_methods WHERE user_id = $1 AND is_active = true LIMIT 1',
      [userId]
    );
    
    const hasPaymentMethod = paymentCheck.rows.length > 0;
    
    // Check if there's a FREE plan that allows WAHA creation, and evaluate credit condition
    const freePlanResult = await pool.query(
      `SELECT id, name, waha_credit_requirement FROM subscription_plans
       WHERE is_active = true AND price = 0 AND waha_credit_requirement != 'none'
       LIMIT 1`
    );
    const freePlan = freePlanResult.rows[0] || null;
    const wahaCreditReq = freePlan?.waha_credit_requirement || 'none';

    // Evaluate if user meets the credit condition for free plan WAHA
    let userMeetsWahaCreditReq = false;
    if (wahaCreditReq === 'no_credit') {
      userMeetsWahaCreditReq = true;
    } else if (wahaCreditReq === 'after_credit') {
      // User must have had a payment method at some point (even if now removed)
      const everHadPayment = await pool.query(
        'SELECT id FROM user_payment_methods WHERE user_id = $1 LIMIT 1', [userId]
      );
      userMeetsWahaCreditReq = everHadPayment.rows.length > 0;
    } else if (wahaCreditReq === 'while_credit') {
      userMeetsWahaCreditReq = hasPaymentMethod;
    }

    const hasFreePlanWithWaha = freePlan !== null && userMeetsWahaCreditReq;

    // Credit card requirement check:
    // Required if: global setting is ON AND user is NOT exempt AND doesn't have manual subscription AND no free plan with WAHA
    const needsCreditCard = creditCardRequired && !isExempt && !hasManualSubscription && !hasFreePlanWithWaha;

    if (needsCreditCard && !hasPaymentMethod) {
      const creditMsg = wahaCreditReq === 'after_credit'
        ? 'נדרש להזין פרטי כרטיס אשראי לפחות פעם אחת לפני חיבור WhatsApp.'
        : wahaCreditReq === 'while_credit'
          ? 'נדרש כרטיס אשראי פעיל במערכת לחיבור WhatsApp.'
          : 'נדרש להזין פרטי כרטיס אשראי לפני חיבור WhatsApp. לא יבוצע חיוב בתקופת הניסיון.';
      return res.status(402).json({
        error: creditMsg,
        code: 'PAYMENT_REQUIRED',
      });
    }

    // Sub-accounts must have a paid subscription before connecting WhatsApp
    const isSubAccount = await pool.query(
      `SELECT 1 FROM linked_accounts WHERE child_user_id = $1 LIMIT 1`, [userId]
    );
    if (isSubAccount.rows.length > 0) {
      const subPlanCheck = await pool.query(
        `SELECT sp.name, sp.price FROM user_subscriptions us
         JOIN subscription_plans sp ON us.plan_id = sp.id
         WHERE us.user_id = $1 AND us.status = 'active'
         ORDER BY us.created_at DESC LIMIT 1`,
        [userId]
      );
      const subPlan = subPlanCheck.rows[0];
      if (!subPlan || subPlan.price <= 0) {
        return res.status(402).json({
          error: 'חשבון משנה דורש מנוי בתשלום לפני חיבור WhatsApp. יש לבחור מנוי תחילה.',
          code: 'SUBSCRIPTION_REQUIRED',
        });
      }
    }

    // Check if user already has an active subscription
    const subCheck = await pool.query(
      `SELECT * FROM user_subscriptions WHERE user_id = $1 AND status IN ('active', 'trial')`,
      [userId]
    );

    // If no active subscription, create one
    let justCreatedSubscription = false;
    if (subCheck.rows.length === 0) {
      // Check if user has a custom discount plan set by admin
      const customDiscountCheck = await pool.query(
        `SELECT custom_discount_plan_id, plan_id FROM user_subscriptions WHERE user_id = $1`,
        [userId]
      );

      let planId = null;
      let isFreeSubscription = false;

      // Priority 1: Custom discount plan from admin
      if (customDiscountCheck.rows.length > 0 && customDiscountCheck.rows[0].custom_discount_plan_id) {
        planId = customDiscountCheck.rows[0].custom_discount_plan_id;
        console.log(`[WhatsApp] Using custom discount plan: ${planId}`);
      }

      // Priority 2: If user meets free plan WAHA condition, use free plan
      if (!planId && hasFreePlanWithWaha && !hasPaymentMethod) {
        planId = freePlan.id;
        isFreeSubscription = true;
        console.log(`[WhatsApp] Using free plan (${wahaCreditReq}) with WAHA access: ${freePlan.name}`);
      }
      
      // Priority 3: Get the cheapest paid plan with allow_waha_creation (for trial)
      if (!planId && hasPaymentMethod) {
        const planResult = await pool.query(
          `SELECT id FROM subscription_plans 
           WHERE is_active = true AND price > 0 AND allow_waha_creation = true 
           ORDER BY price ASC LIMIT 1`
        );
        
        if (planResult.rows.length > 0) {
          planId = planResult.rows[0].id;
        } else {
          // Fallback: any paid plan
          const fallbackResult = await pool.query(
            `SELECT id FROM subscription_plans WHERE is_active = true AND price > 0 ORDER BY price ASC LIMIT 1`
          );
          if (fallbackResult.rows.length > 0) {
            planId = fallbackResult.rows[0].id;
          }
        }
      }
      
      if (planId) {
        const paymentMethodId = paymentCheck.rows[0]?.id || null;
        
        if (isFreeSubscription) {
          // Free subscription - no trial, just active
          console.log(`[WhatsApp] Creating free subscription for user ${userId}`);
          await pool.query(`
            INSERT INTO user_subscriptions (
              user_id, plan_id, status, is_trial, started_at
            ) VALUES ($1, $2, 'active', false, NOW())
            ON CONFLICT (user_id) 
            DO UPDATE SET 
              plan_id = COALESCE(user_subscriptions.custom_discount_plan_id, $2), 
              status = 'active',
              is_trial = false,
              started_at = NOW(),
              updated_at = NOW()
          `, [userId, planId]);
          console.log(`[WhatsApp] ✅ Free subscription activated`);
        } else {
          // Get trial config from site settings
          const trialConfig = await getTrialConfig();
          const trialEnabled = trialConfig.enabled && trialConfig.modules?.includes('bots');
          
          if (trialEnabled) {
            // Trial is enabled - create trial subscription
            console.log(`[WhatsApp] Creating trial subscription for user ${userId} (${trialConfig.days} days)`);
            const trialEndsAt = new Date();
            trialEndsAt.setDate(trialEndsAt.getDate() + (trialConfig.days || 14));
            
            await pool.query(`
              INSERT INTO user_subscriptions (
                user_id, plan_id, status, is_trial, trial_ends_at, 
                payment_method_id, next_charge_date, started_at
              ) VALUES ($1, $2, 'trial', true, $3, $4, $3, NOW())
              ON CONFLICT (user_id) 
              DO UPDATE SET 
                plan_id = COALESCE(user_subscriptions.custom_discount_plan_id, $2), 
                status = 'trial',
                is_trial = true,
                trial_ends_at = $3,
                payment_method_id = COALESCE($4, user_subscriptions.payment_method_id),
                next_charge_date = $3,
                started_at = NOW(),
                updated_at = NOW()
            `, [userId, planId, trialEndsAt, paymentMethodId]);
            console.log(`[WhatsApp] ✅ Trial subscription created, ends at: ${trialEndsAt.toISOString()}`);
          } else {
            // Trial disabled - create free subscription instead
            console.log(`[WhatsApp] Trial disabled, creating free subscription for user ${userId}`);
            const freePlanResult = await pool.query(
              `SELECT id FROM subscription_plans WHERE is_active = true AND price = 0 LIMIT 1`
            );
            const freePlanId = freePlanResult.rows[0]?.id || planId;
            
            await pool.query(`
              INSERT INTO user_subscriptions (
                user_id, plan_id, status, is_trial, started_at
              ) VALUES ($1, $2, 'active', false, NOW())
              ON CONFLICT (user_id) 
              DO UPDATE SET 
                plan_id = $2, 
                status = 'active',
                is_trial = false,
                started_at = NOW(),
                updated_at = NOW()
            `, [userId, freePlanId]);
            console.log(`[WhatsApp] ✅ Free subscription activated (trial disabled)`);
          }
        }
        
        justCreatedSubscription = true;
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
    
    let baseUrl, apiKey, wahaSourceId, wahaWebhookBaseUrl;
    let sessionName = null;
    let wahaStatus = null;
    let existingSession = null;

    // Step 1: Search ALL active WAHA sources for a session with this email
    // This prevents creating duplicate sessions when the user has one on a different server
    console.log(`[WhatsApp] Searching ALL WAHA sources for existing session with email: ${userEmail}`);
    try {
      const allSourcesResult = await pool.query(
        `SELECT id, base_url, api_key_enc, webhook_base_url FROM waha_sources WHERE is_active = true ORDER BY priority ASC, created_at ASC`
      );

      for (const src of allSourcesResult.rows) {
        let srcBaseUrl, srcApiKey;
        try {
          srcBaseUrl = src.base_url;
          srcApiKey = decrypt(src.api_key_enc);
        } catch { continue; }

        try {
          const found = await wahaSession.findSessionByEmail(srcBaseUrl, srcApiKey, userEmail);
          if (found) {
            console.log(`[WhatsApp] ✅ Found existing session "${found.name}" on source "${srcBaseUrl}"`);
            existingSession = found;
            sessionName = found.name;
            baseUrl = srcBaseUrl;
            apiKey = srcApiKey;
            wahaSourceId = src.id;
            wahaWebhookBaseUrl = src.webhook_base_url || null;
            break;
          }
        } catch (err) {
          console.log(`[WhatsApp] Could not search source ${srcBaseUrl}: ${err.message}`);
        }
      }

      // Also search env-based WAHA if no DB sources found a session
      if (!existingSession) {
        const envCreds = getWahaCredentials();
        if (envCreds.baseUrl && envCreds.apiKey) {
          try {
            const found = await wahaSession.findSessionByEmail(envCreds.baseUrl, envCreds.apiKey, userEmail);
            if (found) {
              console.log(`[WhatsApp] ✅ Found existing session "${found.name}" on env WAHA`);
              existingSession = found;
              sessionName = found.name;
              baseUrl = envCreds.baseUrl;
              apiKey = envCreds.apiKey;
              wahaSourceId = null;
            }
          } catch (err) {
            console.log(`[WhatsApp] Could not search env WAHA: ${err.message}`);
          }
        }
      }
    } catch (err) {
      console.log(`[WhatsApp] Error during cross-source session search: ${err.message}`);
    }

    // If session found on a specific source, use that source
    // Otherwise pick the source with fewest sessions (load balancing)
    if (!existingSession) {
      const pickedSource = await pickSourceForNewSession();
      if (pickedSource) {
        baseUrl = pickedSource.baseUrl;
        apiKey = pickedSource.apiKey;
        wahaSourceId = pickedSource.id;
        wahaWebhookBaseUrl = pickedSource.webhookBaseUrl || null;
      } else {
        const envCreds = getWahaCredentials();
        baseUrl = envCreds.baseUrl;
        apiKey = envCreds.apiKey;
        wahaSourceId = null;
        wahaWebhookBaseUrl = null;
      }
    }

    if (!baseUrl || !apiKey) {
      return res.status(500).json({ error: 'WAHA לא מוגדר במערכת' });
    }

    if (existingSession) {
      console.log(`[WhatsApp] ✅ Found existing session by email: ${sessionName}`);

      try {
        wahaStatus = await wahaSession.getSessionStatus(baseUrl, apiKey, sessionName);

        // If stopped or failed, restart it
        if (wahaStatus.status === 'STOPPED' || wahaStatus.status === 'FAILED') {
          console.log(`[WhatsApp] Session is ${wahaStatus.status}, restarting...`);
          try { await wahaSession.stopSession(baseUrl, apiKey, sessionName); } catch (e) { /* ignore */ }
          await wahaSession.startSession(baseUrl, apiKey, sessionName);
          console.log(`[WhatsApp] ✅ Restarted session: ${sessionName}`);
          wahaStatus = await wahaSession.getSessionStatus(baseUrl, apiKey, sessionName);
        } else {
          console.log(`[WhatsApp] Session status: ${wahaStatus.status}`);
        }
      } catch (err) {
        console.log(`[WhatsApp] Error getting/restarting existing session: ${err.message}`);
      }
    }

    // Step 2: If no session found in WAHA, create new one
    if (!sessionName) {
      // Check subscription for WAHA creation permission
      // Skip check if we just created a subscription (free or trial)
      if (!justCreatedSubscription && !hasManualSubscription) {
        const wahaAccess = await checkLimit(userId, 'waha_creation');
        if (!wahaAccess.allowed) {
          // Check if free plan with WAHA exists - if so, user should be allowed
          if (hasFreePlanWithWaha) {
            console.log('[WhatsApp] Free plan allows WAHA creation, proceeding...');
          } else if (hasPaymentMethod) {
            // User has payment method - allow and the subscription will be charged later
            console.log('[WhatsApp] User has payment method, allowing WAHA creation despite plan limit');
          } else {
            return res.status(403).json({ 
              error: 'יצירת חיבור WhatsApp מנוהל דורשת מנוי מתאים.',
              upgrade_required: true
            });
          }
        }
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
    
    // Setup webhook for this user (adds/updates webhooks with all required events)
    // Use source's webhookBaseUrl if set (for internal routing), otherwise use APP_URL
    const webhookBase = wahaWebhookBaseUrl || null;
    const webhookUrl = webhookBase
      ? `${webhookBase}/api/webhook/waha/${userId}`
      : getWebhookUrl(userId);
    try {
      console.log(`[Webhook] Setting up webhook with ${WEBHOOK_EVENTS.length} events for user ${userId}`);
      await wahaSession.addWebhook(baseUrl, apiKey, sessionName, webhookUrl, WEBHOOK_EVENTS);
      console.log(`[Webhook] ✅ Configured for user ${userId}: ${webhookUrl}`);
    } catch (err) {
      console.error('[Webhook] Setup failed:', err.message);
    }
    
    // Delete any existing DB record for this user and create new one
    await pool.query('DELETE FROM whatsapp_connections WHERE user_id = $1', [userId]);
    
    const result = await pool.query(
      `INSERT INTO whatsapp_connections
       (user_id, connection_type, session_name, status, phone_number, display_name, connected_at, waha_source_id)
       VALUES ($1, 'managed', $2, $3, $4, $5, $6, $7)
       RETURNING id, session_name, status, phone_number, display_name, created_at`,
      [userId, sessionName, ourStatus, phoneNumber, displayName, connectedAt, wahaSourceId]
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
    
    // Check if user has a manual subscription (bypasses payment requirement)
    const manualSubCheck = await pool.query(
      `SELECT id FROM user_subscriptions WHERE user_id = $1 AND is_manual = true AND status = 'active'`,
      [userId]
    );
    
    const hasManualSubscription = manualSubCheck.rows.length > 0;
    
    // Check free plan WAHA credit requirement
    const freePlanResult2 = await pool.query(
      `SELECT id, name, waha_credit_requirement FROM subscription_plans
       WHERE is_active = true AND price = 0 AND waha_credit_requirement != 'none'
       LIMIT 1`
    );
    const freePlan2 = freePlanResult2.rows[0] || null;
    const wahaCreditReq2 = freePlan2?.waha_credit_requirement || 'none';

    // Check if user has a payment method
    const paymentCheck = await pool.query(
      'SELECT id FROM user_payment_methods WHERE user_id = $1 AND is_active = true LIMIT 1',
      [userId]
    );
    const hasPaymentMethod = paymentCheck.rows.length > 0;

    // Evaluate credit condition
    let userMeetsWahaCreditReq2 = false;
    if (wahaCreditReq2 === 'no_credit') {
      userMeetsWahaCreditReq2 = true;
    } else if (wahaCreditReq2 === 'after_credit') {
      const everHad = await pool.query('SELECT id FROM user_payment_methods WHERE user_id = $1 LIMIT 1', [userId]);
      userMeetsWahaCreditReq2 = everHad.rows.length > 0;
    } else if (wahaCreditReq2 === 'while_credit') {
      userMeetsWahaCreditReq2 = hasPaymentMethod;
    }
    const hasFreePlanWithWaha = freePlan2 !== null && userMeetsWahaCreditReq2;

    // Payment is required UNLESS: manual subscription OR free plan with WAHA enabled
    if (!hasPaymentMethod && !hasManualSubscription && !hasFreePlanWithWaha) {
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
      
      // Get free plan (prefer one with WAHA creation, but any free plan works)
      const freePlanResult = await pool.query(
        `SELECT id FROM subscription_plans 
         WHERE is_active = true AND price = 0 
         ORDER BY allow_waha_creation DESC 
         LIMIT 1`
      );
      
      if (freePlanResult.rows.length > 0) {
        const freePlanId = freePlanResult.rows[0].id;
        const paymentMethodId = hasPaymentMethod ? paymentCheck.rows[0].id : null;
        
        await pool.query(`
          INSERT INTO user_subscriptions (
            user_id, plan_id, status, is_trial, payment_method_id, started_at
          ) VALUES ($1, $2, 'active', false, $3, NOW())
          ON CONFLICT (user_id) 
          DO UPDATE SET 
            plan_id = $2, 
            status = 'active',
            is_trial = false,
            payment_method_id = COALESCE($3, user_subscriptions.payment_method_id),
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
 * Checks if user has a payment method OR if free plan allows WAHA
 */
async function checkExisting(req, res) {
  try {
    const userId = req.user.id;
    
    // Check if user has payment method
    const paymentCheck = await pool.query(
      'SELECT id FROM user_payment_methods WHERE user_id = $1 AND is_active = true LIMIT 1',
      [userId]
    );
    
    const hasPaymentMethod = paymentCheck.rows.length > 0;
    
    // Check free plan WAHA credit requirement
    const freePlanResult3 = await pool.query(
      `SELECT id, waha_credit_requirement FROM subscription_plans
       WHERE is_active = true AND price = 0 AND waha_credit_requirement != 'none' LIMIT 1`
    );
    const freePlan3 = freePlanResult3.rows[0] || null;
    const wahaCreditReq3 = freePlan3?.waha_credit_requirement || 'none';
    let userMeetsReq3 = false;
    if (wahaCreditReq3 === 'no_credit') userMeetsReq3 = true;
    else if (wahaCreditReq3 === 'after_credit') {
      const everHad = await pool.query('SELECT id FROM user_payment_methods WHERE user_id = $1 LIMIT 1', [userId]);
      userMeetsReq3 = everHad.rows.length > 0;
    } else if (wahaCreditReq3 === 'while_credit') userMeetsReq3 = hasPaymentMethod;
    const hasFreePlanWithWaha = freePlan3 !== null && userMeetsReq3;

    // Check if user has manual subscription
    const manualSubCheck = await pool.query(
      `SELECT id FROM user_subscriptions WHERE user_id = $1 AND is_manual = true AND status = 'active'`,
      [userId]
    );

    const hasManualSubscription = manualSubCheck.rows.length > 0;

    // Allow if: has payment method, OR free plan allows WAHA, OR has manual subscription
    if (!hasPaymentMethod && !hasFreePlanWithWaha && !hasManualSubscription) {
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

      // User has a valid payment method and session is WORKING — clear any payment suspension
      await pool.query(
        `UPDATE whatsapp_connections SET payment_suspended = false WHERE user_id = $1`,
        [userId]
      );

      // Verify and update webhooks in background
      const webhookUrl = getWebhookUrl(userId);
      wahaSession.addWebhook(baseUrl, apiKey, existingSession.name, webhookUrl, WEBHOOK_EVENTS)
        .then(() => console.log(`[Webhook] ✅ Verified/updated for user ${userId}`))
        .catch(err => console.error(`[Webhook] Update failed for ${userId}:`, err.message));

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
