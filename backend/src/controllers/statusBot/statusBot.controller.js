const db = require('../../config/database');
const wahaSession = require('../../services/waha/session.service');
const { getWahaCredentials } = require('../../services/settings/system.service');
const crypto = require('crypto');

// ============================================
// INITIALIZATION - Create tables on load
// ============================================

async function initializeTables() {
  try {
    // Create tables if not exist
    await db.query(`
      CREATE TABLE IF NOT EXISTS status_bot_connections (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        session_name VARCHAR(100),
        connection_status VARCHAR(20) DEFAULT 'disconnected',
        phone_number VARCHAR(20),
        display_name VARCHAR(100),
        last_qr_code TEXT,
        last_qr_at TIMESTAMP,
        first_connected_at TIMESTAMP,
        last_connected_at TIMESTAMP,
        restriction_lifted BOOLEAN DEFAULT false,
        restriction_lifted_at TIMESTAMP,
        restriction_lifted_by UUID,
        default_text_color VARCHAR(10) DEFAULT '#38b42f',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id)
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS status_bot_authorized_numbers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        connection_id UUID NOT NULL REFERENCES status_bot_connections(id) ON DELETE CASCADE,
        phone_number VARCHAR(20) NOT NULL,
        name VARCHAR(100),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(connection_id, phone_number)
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS status_bot_queue (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        connection_id UUID NOT NULL REFERENCES status_bot_connections(id) ON DELETE CASCADE,
        status_type VARCHAR(20) NOT NULL,
        content JSONB NOT NULL,
        status_message_id VARCHAR(100),
        queue_status VARCHAR(20) DEFAULT 'pending',
        error_message TEXT,
        retry_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        scheduled_for TIMESTAMP,
        processing_started_at TIMESTAMP,
        sent_at TIMESTAMP,
        source VARCHAR(20) DEFAULT 'web',
        source_phone VARCHAR(20),
        source_message_id VARCHAR(100)
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS status_bot_statuses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        connection_id UUID NOT NULL REFERENCES status_bot_connections(id) ON DELETE CASCADE,
        queue_id UUID,
        status_type VARCHAR(20) NOT NULL,
        content JSONB NOT NULL,
        waha_message_id VARCHAR(100),
        sent_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP,
        deleted_at TIMESTAMP,
        source VARCHAR(20),
        source_phone VARCHAR(20),
        view_count INTEGER DEFAULT 0,
        reaction_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS status_bot_views (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        status_id UUID NOT NULL REFERENCES status_bot_statuses(id) ON DELETE CASCADE,
        viewer_phone VARCHAR(20) NOT NULL,
        viewer_name VARCHAR(100),
        viewed_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(status_id, viewer_phone)
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS status_bot_reactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        status_id UUID NOT NULL REFERENCES status_bot_statuses(id) ON DELETE CASCADE,
        reactor_phone VARCHAR(20) NOT NULL,
        reactor_name VARCHAR(100),
        reaction VARCHAR(10) NOT NULL,
        reacted_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(status_id, reactor_phone)
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS status_bot_queue_lock (
        id INTEGER PRIMARY KEY DEFAULT 1,
        last_sent_at TIMESTAMP,
        last_sent_connection_id UUID,
        is_processing BOOLEAN DEFAULT false,
        processing_started_at TIMESTAMP,
        CONSTRAINT single_row CHECK (id = 1)
      )
    `);

    await db.query(`INSERT INTO status_bot_queue_lock (id) VALUES (1) ON CONFLICT DO NOTHING`);

    // Create indexes
    await db.query(`CREATE INDEX IF NOT EXISTS idx_status_bot_queue_status ON status_bot_queue(queue_status)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_status_bot_statuses_waha_id ON status_bot_statuses(waha_message_id)`);

    console.log('✅ Status Bot tables initialized');
  } catch (error) {
    console.error('[StatusBot] Table initialization error:', error.message);
  }
}

initializeTables();

// ============================================
// CONNECTION MANAGEMENT
// ============================================

/**
 * Get connection status (with live WAHA status)
 */
async function getConnection(req, res) {
  try {
    const userId = req.user.id;

    const result = await db.query(`
      SELECT * FROM status_bot_connections WHERE user_id = $1
    `, [userId]);

    if (result.rows.length === 0) {
      return res.json({ connection: null });
    }

    const connection = result.rows[0];
    
    // Get live status from WAHA if we have a session
    if (connection.session_name) {
      try {
        const { baseUrl, apiKey } = await getWahaCredentials();
        const wahaStatus = await wahaSession.getSessionStatus(baseUrl, apiKey, connection.session_name);
        
        if (wahaStatus) {
          // Map WAHA status to our status
          let newStatus = connection.connection_status;
          if (wahaStatus.status === 'WORKING') {
            newStatus = 'connected';
          } else if (wahaStatus.status === 'SCAN_QR_CODE' || wahaStatus.status === 'STARTING') {
            newStatus = 'qr_pending';
          } else if (wahaStatus.status === 'STOPPED' || wahaStatus.status === 'FAILED') {
            newStatus = 'disconnected';
          }
          
          // Update if changed
          if (newStatus !== connection.connection_status) {
            const phoneNumber = wahaStatus.me?.id?.split('@')[0] || connection.phone_number;
            const displayName = wahaStatus.me?.pushName || connection.display_name;
            
            await db.query(`
              UPDATE status_bot_connections 
              SET connection_status = $1, phone_number = COALESCE($2, phone_number), 
                  display_name = COALESCE($3, display_name), updated_at = NOW()
              WHERE id = $4
            `, [newStatus, phoneNumber, displayName, connection.id]);
            
            connection.connection_status = newStatus;
            connection.phone_number = phoneNumber;
            connection.display_name = displayName;
          }
        }
      } catch (e) {
        console.error('[StatusBot] WAHA status check error:', e.message);
      }
    }

    // Check 24-hour restriction (use last_connected_at if available)
    let isRestricted = false;
    let restrictionEndsAt = null;
    const connectionDate = connection.last_connected_at || connection.first_connected_at;

    if (connectionDate && !connection.restriction_lifted) {
      const connectedAt = new Date(connectionDate);
      const restrictionEnd = new Date(connectedAt.getTime() + 24 * 60 * 60 * 1000);
      
      if (new Date() < restrictionEnd) {
        isRestricted = true;
        restrictionEndsAt = restrictionEnd;
      }
    }

    // Check subscription status
    let subscriptionInfo = null;
    try {
      const serviceResult = await db.query(
        `SELECT id FROM additional_services WHERE slug = 'status-bot' AND is_active = true`
      );
      
      if (serviceResult.rows.length > 0) {
        const serviceId = serviceResult.rows[0].id;
        const subResult = await db.query(`
          SELECT uss.*, s.name_he
          FROM user_service_subscriptions uss
          JOIN additional_services s ON s.id = uss.service_id
          WHERE uss.user_id = $1 AND uss.service_id = $2
        `, [userId, serviceId]);
        
        if (subResult.rows.length > 0) {
          const sub = subResult.rows[0];
          subscriptionInfo = {
            status: sub.status,
            isTrial: sub.is_trial,
            trialEndsAt: sub.trial_ends_at,
            expiresAt: sub.expires_at || sub.next_charge_date,
            cancelledAt: sub.cancelled_at,
            nextChargeDate: sub.next_charge_date
          };
        }
      }
    } catch (subError) {
      console.error('[StatusBot] Subscription check error:', subError.message);
    }

    res.json({
      connection: {
        ...connection,
        isRestricted,
        restrictionEndsAt,
      },
      subscription: subscriptionInfo
    });
  } catch (error) {
    console.error('[StatusBot] Get connection error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת החיבור' });
  }
}

/**
 * Check if user has existing WAHA session (by email)
 * Uses same logic as whatsapp/check-existing - searches by email ONLY
 */
async function checkExisting(req, res) {
  try {
    const userId = req.user.id;
    
    // Get user email
    let userEmail = req.user.email;
    if (!userEmail) {
      const userResult = await db.query('SELECT email FROM users WHERE id = $1', [userId]);
      userEmail = userResult.rows[0]?.email;
    }
    
    if (!userEmail) {
      return res.json({ exists: false });
    }
    
    // Get WAHA credentials
    const { baseUrl, apiKey } = await getWahaCredentials();
    
    if (!baseUrl || !apiKey) {
      return res.json({ exists: false });
    }
    
    // Search in WAHA by email ONLY (same as main WhatsApp connection)
    console.log(`[StatusBot] Checking existing session for: ${userEmail}`);
    
    const existingSession = await wahaSession.findSessionByEmail(baseUrl, apiKey, userEmail);
    
    if (existingSession && existingSession.status === 'WORKING') {
      console.log(`[StatusBot] ✅ Found existing WORKING session: ${existingSession.name}`);
      
      // Update webhooks in background
      const webhookUrl = `${process.env.APP_URL}/api/webhook/status-bot/${userId}`;
      wahaSession.addWebhook(baseUrl, apiKey, existingSession.name, webhookUrl, [
        'session.status', 'message.ack', 'message.reaction'
      ]).catch(err => console.error(`[StatusBot Webhook] Update failed:`, err.message));
      
      return res.json({
        exists: true,
        sessionName: existingSession.name,
        status: existingSession.status,
        isConnected: true,
        phoneNumber: existingSession.me?.id?.split('@')[0],
        displayName: existingSession.me?.pushName,
      });
    }
    
    console.log(`[StatusBot] No active session found for: ${userEmail}`);
    return res.json({ exists: false });
    
  } catch (error) {
    console.error('[StatusBot] Check existing error:', error.message);
    return res.json({ exists: false });
  }
}

/**
 * Start connection process (create/reuse session)
 * Uses same logic as whatsapp/connect/managed - searches by email ONLY
 */
async function startConnection(req, res) {
  try {
    const userId = req.user.id;
    
    // Get user email
    let userEmail = req.user.email;
    if (!userEmail) {
      const userResult = await db.query('SELECT email FROM users WHERE id = $1', [userId]);
      userEmail = userResult.rows[0]?.email;
    }
    
    if (!userEmail) {
      return res.status(400).json({ error: 'לא נמצא מייל למשתמש' });
    }

    // Get WAHA credentials
    const { baseUrl, apiKey } = await getWahaCredentials();
    
    if (!baseUrl || !apiKey) {
      return res.status(500).json({ error: 'WAHA לא מוגדר במערכת' });
    }

    let sessionName = null;
    let wahaStatus = null;
    let existingSession = null;
    
    // Step 1: Search in WAHA by email ONLY (same as main WhatsApp connection)
    console.log(`[StatusBot] Searching WAHA for session with email: ${userEmail}`);
    
    try {
      existingSession = await wahaSession.findSessionByEmail(baseUrl, apiKey, userEmail);
      
      if (existingSession) {
        sessionName = existingSession.name;
        console.log(`[StatusBot] ✅ Found existing session by email: ${sessionName}`);
        
        wahaStatus = await wahaSession.getSessionStatus(baseUrl, apiKey, sessionName);
        
        // If stopped or failed, restart it
        if (wahaStatus && (wahaStatus.status === 'STOPPED' || wahaStatus.status === 'FAILED')) {
          console.log(`[StatusBot] Session is ${wahaStatus.status}, restarting...`);
          try {
            await wahaSession.stopSession(baseUrl, apiKey, sessionName);
          } catch (e) { /* ignore */ }
          await wahaSession.startSession(baseUrl, apiKey, sessionName);
          console.log(`[StatusBot] ✅ Restarted session: ${sessionName}`);
          wahaStatus = await wahaSession.getSessionStatus(baseUrl, apiKey, sessionName);
        } else {
          console.log(`[StatusBot] Session status: ${wahaStatus?.status}`);
        }
      }
    } catch (err) {
      console.log(`[StatusBot] Error searching sessions: ${err.message}`);
    }
    
    // Step 2: If no session found in WAHA, create new one
    if (!sessionName) {
      sessionName = `session_${crypto.randomBytes(4).toString('hex')}`;
      
      // Only email in metadata - same as main WhatsApp connection
      const sessionMetadata = {
        'user.email': userEmail,
      };
      
      console.log(`[StatusBot] Creating new session: ${sessionName}`);
      
      await wahaSession.createSession(baseUrl, apiKey, sessionName, sessionMetadata);
      await wahaSession.startSession(baseUrl, apiKey, sessionName);
      console.log(`[StatusBot] ✅ Created new session: ${sessionName}`);
      
      wahaStatus = await wahaSession.getSessionStatus(baseUrl, apiKey, sessionName);
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
    let firstConnectedAt = null;
    
    if (ourStatus === 'connected' && wahaStatus?.me) {
      phoneNumber = wahaStatus.me.id?.split('@')[0] || null;
      displayName = wahaStatus.me.pushName || null;
      connectedAt = new Date();
      firstConnectedAt = new Date(); // Will be set properly if not exists
    }
    
    // Setup webhook for this user
    const webhookUrl = `${process.env.APP_URL}/api/webhook/status-bot/${userId}`;
    try {
      await wahaSession.addWebhook(baseUrl, apiKey, sessionName, webhookUrl, [
        'session.status',
        'message.ack',
        'message.reaction'
      ]);
      console.log(`[StatusBot Webhook] ✅ Configured for user ${userId}`);
    } catch (err) {
      console.error('[StatusBot Webhook] Setup failed:', err.message);
    }
    
    // Delete any existing DB record for this user and create new one
    await db.query('DELETE FROM status_bot_connections WHERE user_id = $1', [userId]);
    
    const result = await db.query(`
      INSERT INTO status_bot_connections 
      (user_id, session_name, connection_status, phone_number, display_name, first_connected_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [userId, sessionName, ourStatus, phoneNumber, displayName, 
        ourStatus === 'connected' ? firstConnectedAt : null]);
    
    console.log(`[StatusBot] ✅ Saved to DB: ${sessionName}`);
    
    res.json({ 
      success: true, 
      connection: result.rows[0],
      existingSession: !!existingSession,
    });
    
  } catch (error) {
    console.error('[StatusBot] Start connection error:', error);
    res.status(500).json({ error: 'שגיאה בהתחלת חיבור' });
  }
}

/**
 * Get QR code for scanning
 */
async function getQR(req, res) {
  try {
    const userId = req.user.id;

    const result = await db.query(
      'SELECT * FROM status_bot_connections WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      // No connection record - need to start connection
      return res.json({ status: 'need_connect' });
    }

    const connection = result.rows[0];

    if (connection.connection_status === 'connected') {
      return res.json({ status: 'connected' });
    }

    const { baseUrl, apiKey } = await getWahaCredentials();

    // First check if session exists
    const sessionStatus = await wahaSession.getSessionStatus(baseUrl, apiKey, connection.session_name);
    
    if (!sessionStatus) {
      // Session doesn't exist in WAHA - clean up stale DB record
      console.log(`[StatusBot] Session ${connection.session_name} not found in WAHA, cleaning up DB`);
      await db.query('DELETE FROM status_bot_connections WHERE id = $1', [connection.id]);
      return res.json({ status: 'need_connect' });
    }

    // Check session status
    if (sessionStatus.status === 'WORKING') {
      // Already connected - update DB
      const phoneNumber = sessionStatus.me?.id?.split('@')[0] || null;
      const displayName = sessionStatus.me?.pushName || null;
      
      await db.query(`
        UPDATE status_bot_connections 
        SET connection_status = 'connected', phone_number = $2, display_name = $3,
            first_connected_at = COALESCE(first_connected_at, NOW()), updated_at = NOW()
        WHERE id = $1
      `, [connection.id, phoneNumber, displayName]);
      return res.json({ status: 'connected' });
    }

    // Get QR from WAHA
    try {
      const qrData = await wahaSession.getQRCode(baseUrl, apiKey, connection.session_name);

      if (!qrData || !qrData.value) {
        return res.json({ status: 'waiting', message: 'ממתין ל-QR...' });
      }

      // Save QR to DB (just a reference, not the full image)
      await db.query(`
        UPDATE status_bot_connections 
        SET last_qr_code = $1, last_qr_at = NOW(), updated_at = NOW()
        WHERE id = $2
      `, ['qr_generated', connection.id]);

      res.json({ 
        status: 'qr_ready',
        qr: qrData.value 
      });
    } catch (qrError) {
      console.error('[StatusBot] QR error:', qrError.message);
      // Session exists but QR not ready yet
      return res.json({ status: 'waiting', message: 'ממתין ל-QR...' });
    }

  } catch (error) {
    console.error('[StatusBot] Get QR error:', error);
    res.status(500).json({ error: 'שגיאה בקבלת QR' });
  }
}

/**
 * Disconnect WhatsApp
 */
async function disconnect(req, res) {
  try {
    const userId = req.user.id;

    const result = await db.query(
      'SELECT * FROM status_bot_connections WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'לא נמצא חיבור' });
    }

    const connection = result.rows[0];
    const { baseUrl, apiKey } = await getWahaCredentials();

    // Stop session in WAHA
    try {
      await wahaSession.stopSession(baseUrl, apiKey, connection.session_name);
    } catch (e) {
      console.error('[StatusBot] Stop session error:', e.message);
    }

    // Update DB
    await db.query(`
      UPDATE status_bot_connections 
      SET connection_status = 'disconnected', phone_number = NULL, display_name = NULL, updated_at = NOW()
      WHERE id = $1
    `, [connection.id]);

    res.json({ success: true });

  } catch (error) {
    console.error('[StatusBot] Disconnect error:', error);
    res.status(500).json({ error: 'שגיאה בניתוק' });
  }
}

// ============================================
// AUTHORIZED NUMBERS
// ============================================

/**
 * Get authorized numbers
 */
async function getAuthorizedNumbers(req, res) {
  try {
    const userId = req.user.id;

    const connResult = await db.query(
      'SELECT id FROM status_bot_connections WHERE user_id = $1',
      [userId]
    );

    if (connResult.rows.length === 0) {
      return res.json({ numbers: [] });
    }

    const result = await db.query(`
      SELECT * FROM status_bot_authorized_numbers 
      WHERE connection_id = $1 AND is_active = true
      ORDER BY created_at DESC
    `, [connResult.rows[0].id]);

    res.json({ numbers: result.rows });

  } catch (error) {
    console.error('[StatusBot] Get authorized numbers error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת מספרים' });
  }
}

/**
 * Add authorized number
 */
async function addAuthorizedNumber(req, res) {
  try {
    const userId = req.user.id;
    const { phoneNumber, name } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: 'נדרש מספר טלפון' });
    }

    // Normalize phone number
    const normalizedPhone = phoneNumber.replace(/\D/g, '');

    const connResult = await db.query(
      'SELECT id FROM status_bot_connections WHERE user_id = $1',
      [userId]
    );

    if (connResult.rows.length === 0) {
      return res.status(404).json({ error: 'לא נמצא חיבור' });
    }

    const result = await db.query(`
      INSERT INTO status_bot_authorized_numbers (connection_id, phone_number, name)
      VALUES ($1, $2, $3)
      ON CONFLICT (connection_id, phone_number) 
      DO UPDATE SET name = $3, is_active = true
      RETURNING *
    `, [connResult.rows[0].id, normalizedPhone, name || null]);

    res.json({ number: result.rows[0] });

  } catch (error) {
    console.error('[StatusBot] Add authorized number error:', error);
    res.status(500).json({ error: 'שגיאה בהוספת מספר' });
  }
}

/**
 * Remove authorized number
 */
async function removeAuthorizedNumber(req, res) {
  try {
    const userId = req.user.id;
    const { numberId } = req.params;

    const connResult = await db.query(
      'SELECT id FROM status_bot_connections WHERE user_id = $1',
      [userId]
    );

    if (connResult.rows.length === 0) {
      return res.status(404).json({ error: 'לא נמצא חיבור' });
    }

    await db.query(`
      UPDATE status_bot_authorized_numbers 
      SET is_active = false 
      WHERE id = $1 AND connection_id = $2
    `, [numberId, connResult.rows[0].id]);

    res.json({ success: true });

  } catch (error) {
    console.error('[StatusBot] Remove authorized number error:', error);
    res.status(500).json({ error: 'שגיאה במחיקת מספר' });
  }
}

// ============================================
// STATUS UPLOAD
// ============================================

/**
 * Check if user can upload status (not restricted and has valid subscription)
 */
async function checkCanUpload(connection, userId) {
  if (!connection) {
    return { canUpload: false, reason: 'לא נמצא חיבור' };
  }

  if (connection.connection_status !== 'connected') {
    return { canUpload: false, reason: 'WhatsApp לא מחובר' };
  }

  // Check subscription status
  const subscriptionCheck = await checkSubscriptionForUpload(userId);
  if (!subscriptionCheck.canUpload) {
    return subscriptionCheck;
  }

  // Check 24-hour restriction (based on last_connected_at, not first)
  const connectionDate = connection.last_connected_at || connection.first_connected_at;
  if (connectionDate && !connection.restriction_lifted) {
    const connectedAt = new Date(connectionDate);
    const restrictionEnd = new Date(connectedAt.getTime() + 24 * 60 * 60 * 1000);
    
    if (new Date() < restrictionEnd) {
      const hoursLeft = Math.ceil((restrictionEnd - new Date()) / (1000 * 60 * 60));
      const minutesLeft = Math.ceil((restrictionEnd - new Date()) / (1000 * 60)) % 60;
      return { 
        canUpload: false, 
        reason: `יש להמתין ${hoursLeft} שעות ו-${minutesLeft} דקות לאחר החיבור`,
        restrictionEndsAt: restrictionEnd,
        isRestricted: true
      };
    }
  }

  return { canUpload: true };
}

/**
 * Check if user has valid subscription for status bot
 */
async function checkSubscriptionForUpload(userId) {
  try {
    // Get status-bot service ID
    const serviceResult = await db.query(
      `SELECT id FROM additional_services WHERE slug = 'status-bot' AND is_active = true`
    );
    
    if (serviceResult.rows.length === 0) {
      return { canUpload: true }; // Service not configured, allow
    }
    
    const serviceId = serviceResult.rows[0].id;
    
    // Check subscription
    const subResult = await db.query(`
      SELECT * FROM user_service_subscriptions 
      WHERE user_id = $1 AND service_id = $2
    `, [userId, serviceId]);
    
    if (subResult.rows.length === 0) {
      return { 
        canUpload: false, 
        reason: 'אין לך מנוי פעיל לשירות העלאת סטטוסים',
        noSubscription: true
      };
    }
    
    const sub = subResult.rows[0];
    const now = new Date();
    
    // Check if subscription is active or trial
    if (sub.status === 'active' || sub.status === 'trial') {
      // Check if trial ended
      if (sub.is_trial && sub.trial_ends_at && new Date(sub.trial_ends_at) < now) {
        return { 
          canUpload: false, 
          reason: 'תקופת הניסיון הסתיימה. יש לשלם כדי להמשיך',
          subscriptionExpired: true
        };
      }
      return { canUpload: true };
    }
    
    // Cancelled - check if still in paid period
    if (sub.status === 'cancelled') {
      const expiresAt = sub.expires_at || sub.next_charge_date;
      if (expiresAt && new Date(expiresAt) > now) {
        // Still in paid period
        return { canUpload: true, expiresAt: new Date(expiresAt) };
      }
      return { 
        canUpload: false, 
        reason: 'המנוי שלך הסתיים. יש לחדש את המנוי כדי להמשיך',
        subscriptionExpired: true
      };
    }
    
    // Expired or other status
    return { 
      canUpload: false, 
      reason: 'המנוי שלך אינו פעיל',
      subscriptionExpired: true
    };
    
  } catch (error) {
    console.error('[StatusBot] Check subscription error:', error);
    return { canUpload: true }; // On error, allow (don't block user)
  }
}

/**
 * Upload text status
 */
async function uploadTextStatus(req, res) {
  try {
    const userId = req.user.id;
    const { text, backgroundColor, font = 0, linkPreview = true } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'נדרש טקסט' });
    }

    const connResult = await db.query(
      'SELECT * FROM status_bot_connections WHERE user_id = $1',
      [userId]
    );

    if (connResult.rows.length === 0) {
      return res.status(404).json({ error: 'לא נמצא חיבור' });
    }

    const connection = connResult.rows[0];

    // Check if can upload
    const canUploadCheck = await checkCanUpload(connection, userId);
    if (!canUploadCheck.canUpload) {
      return res.status(403).json({ 
        error: canUploadCheck.reason,
        restrictionEndsAt: canUploadCheck.restrictionEndsAt,
        isRestricted: canUploadCheck.isRestricted,
        noSubscription: canUploadCheck.noSubscription,
        subscriptionExpired: canUploadCheck.subscriptionExpired
      });
    }

    // Add to queue
    const content = {
      text,
      backgroundColor: backgroundColor || connection.default_text_color || '#38b42f',
      font,
      linkPreview,
      linkPreviewHighQuality: false
    };

    const queueResult = await db.query(`
      INSERT INTO status_bot_queue (connection_id, status_type, content, source)
      VALUES ($1, 'text', $2, 'web')
      RETURNING *
    `, [connection.id, JSON.stringify(content)]);

    res.json({ 
      success: true, 
      message: 'הסטטוס נוסף לתור',
      queueId: queueResult.rows[0].id 
    });

  } catch (error) {
    console.error('[StatusBot] Upload text status error:', error);
    res.status(500).json({ error: 'שגיאה בהעלאת סטטוס' });
  }
}

/**
 * Upload image status
 */
async function uploadImageStatus(req, res) {
  try {
    const userId = req.user.id;
    const { url, caption } = req.body;
    const file = req.file;

    // Either URL or file is required
    if (!url && !file) {
      return res.status(400).json({ error: 'נדרש URL או קובץ תמונה' });
    }

    const connResult = await db.query(
      'SELECT * FROM status_bot_connections WHERE user_id = $1',
      [userId]
    );

    if (connResult.rows.length === 0) {
      return res.status(404).json({ error: 'לא נמצא חיבור' });
    }

    const connection = connResult.rows[0];

    const canUploadCheck = await checkCanUpload(connection, userId);
    if (!canUploadCheck.canUpload) {
      return res.status(403).json({ 
        error: canUploadCheck.reason,
        restrictionEndsAt: canUploadCheck.restrictionEndsAt,
        isRestricted: canUploadCheck.isRestricted,
        noSubscription: canUploadCheck.noSubscription,
        subscriptionExpired: canUploadCheck.subscriptionExpired
      });
    }

    let content;
    if (file) {
      // File upload - build URL
      const baseUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 3000}/api`;
      const fileUrl = `${baseUrl}/uploads/status-bot/${file.filename}`;
      content = {
        file: {
          mimetype: file.mimetype,
          filename: file.originalname,
          url: fileUrl
        },
        caption: caption || ''
      };
    } else {
      content = {
        file: {
          mimetype: 'image/jpeg',
          filename: 'status.jpg',
          url
        },
        caption: caption || ''
      };
    }

    const queueResult = await db.query(`
      INSERT INTO status_bot_queue (connection_id, status_type, content, source)
      VALUES ($1, 'image', $2, 'web')
      RETURNING *
    `, [connection.id, JSON.stringify(content)]);

    res.json({ 
      success: true, 
      message: 'הסטטוס נשלח',
      queueId: queueResult.rows[0].id 
    });

  } catch (error) {
    console.error('[StatusBot] Upload image status error:', error);
    res.status(500).json({ error: 'שגיאה בהעלאת סטטוס' });
  }
}

/**
 * Upload video status
 */
async function uploadVideoStatus(req, res) {
  try {
    const userId = req.user.id;
    const { url, caption } = req.body;
    const file = req.file;

    if (!url && !file) {
      return res.status(400).json({ error: 'נדרש URL או קובץ וידאו' });
    }

    const connResult = await db.query(
      'SELECT * FROM status_bot_connections WHERE user_id = $1',
      [userId]
    );

    if (connResult.rows.length === 0) {
      return res.status(404).json({ error: 'לא נמצא חיבור' });
    }

    const connection = connResult.rows[0];

    const canUploadCheck = await checkCanUpload(connection, userId);
    if (!canUploadCheck.canUpload) {
      return res.status(403).json({ 
        error: canUploadCheck.reason,
        restrictionEndsAt: canUploadCheck.restrictionEndsAt,
        isRestricted: canUploadCheck.isRestricted,
        noSubscription: canUploadCheck.noSubscription,
        subscriptionExpired: canUploadCheck.subscriptionExpired
      });
    }

    let content;
    if (file) {
      const baseUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 3000}/api`;
      const fileUrl = `${baseUrl}/uploads/status-bot/${file.filename}`;
      content = {
        file: {
          mimetype: file.mimetype,
          filename: file.originalname,
          url: fileUrl
        },
        convert: true,
        caption: caption || ''
      };
    } else {
      content = {
        file: {
          mimetype: 'video/mp4',
          filename: 'status.mp4',
          url
        },
        convert: true,
        caption: caption || ''
      };
    }

    const queueResult = await db.query(`
      INSERT INTO status_bot_queue (connection_id, status_type, content, source)
      VALUES ($1, 'video', $2, 'web')
      RETURNING *
    `, [connection.id, JSON.stringify(content)]);

    res.json({ 
      success: true, 
      message: 'הסטטוס נשלח',
      queueId: queueResult.rows[0].id 
    });

  } catch (error) {
    console.error('[StatusBot] Upload video status error:', error);
    res.status(500).json({ error: 'שגיאה בהעלאת סטטוס' });
  }
}

/**
 * Upload voice status
 */
async function uploadVoiceStatus(req, res) {
  try {
    const userId = req.user.id;
    const { url, backgroundColor } = req.body;
    const file = req.file;

    if (!url && !file) {
      return res.status(400).json({ error: 'נדרש URL או קובץ שמע' });
    }

    const connResult = await db.query(
      'SELECT * FROM status_bot_connections WHERE user_id = $1',
      [userId]
    );

    if (connResult.rows.length === 0) {
      return res.status(404).json({ error: 'לא נמצא חיבור' });
    }

    const connection = connResult.rows[0];

    const canUploadCheck = await checkCanUpload(connection, userId);
    if (!canUploadCheck.canUpload) {
      return res.status(403).json({ 
        error: canUploadCheck.reason,
        restrictionEndsAt: canUploadCheck.restrictionEndsAt,
        isRestricted: canUploadCheck.isRestricted,
        noSubscription: canUploadCheck.noSubscription,
        subscriptionExpired: canUploadCheck.subscriptionExpired
      });
    }

    let content;
    if (file) {
      const baseUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 3000}/api`;
      const fileUrl = `${baseUrl}/uploads/status-bot/${file.filename}`;
      content = {
        file: {
          mimetype: file.mimetype,
          filename: file.originalname,
          url: fileUrl
        },
        convert: true,
        backgroundColor: backgroundColor || connection.default_text_color || '#38b42f'
      };
    } else {
      content = {
        file: {
          mimetype: 'audio/ogg; codecs=opus',
          url
        },
        convert: true,
        backgroundColor: backgroundColor || connection.default_text_color || '#38b42f'
      };
    }

    const queueResult = await db.query(`
      INSERT INTO status_bot_queue (connection_id, status_type, content, source)
      VALUES ($1, 'voice', $2, 'web')
      RETURNING *
    `, [connection.id, JSON.stringify(content)]);

    res.json({ 
      success: true, 
      message: 'הסטטוס נשלח',
      queueId: queueResult.rows[0].id 
    });

  } catch (error) {
    console.error('[StatusBot] Upload voice status error:', error);
    res.status(500).json({ error: 'שגיאה בהעלאת סטטוס' });
  }
}

/**
 * Delete a status
 */
async function deleteStatus(req, res) {
  try {
    const userId = req.user.id;
    const { statusId } = req.params;

    const connResult = await db.query(
      'SELECT * FROM status_bot_connections WHERE user_id = $1',
      [userId]
    );

    if (connResult.rows.length === 0) {
      return res.status(404).json({ error: 'לא נמצא חיבור' });
    }

    const connection = connResult.rows[0];

    // Get status
    const statusResult = await db.query(`
      SELECT * FROM status_bot_statuses 
      WHERE id = $1 AND connection_id = $2
    `, [statusId, connection.id]);

    if (statusResult.rows.length === 0) {
      return res.status(404).json({ error: 'סטטוס לא נמצא' });
    }

    const status = statusResult.rows[0];

    if (!status.waha_message_id) {
      return res.status(400).json({ error: 'לא ניתן למחוק סטטוס זה' });
    }

    // Delete via WAHA
    const { baseUrl, apiKey } = await getWahaCredentials();

    try {
      await wahaSession.makeRequest(baseUrl, apiKey, 'POST', `/api/${connection.session_name}/status/delete`, {
        id: status.waha_message_id,
        contacts: null
      });
    } catch (wahaError) {
      console.error('[StatusBot] WAHA delete error:', wahaError.message);
    }

    // Mark as deleted in DB
    await db.query(`
      UPDATE status_bot_statuses SET deleted_at = NOW() WHERE id = $1
    `, [statusId]);

    res.json({ success: true });

  } catch (error) {
    console.error('[StatusBot] Delete status error:', error);
    res.status(500).json({ error: 'שגיאה במחיקת סטטוס' });
  }
}

// ============================================
// STATUS HISTORY
// ============================================

/**
 * Get status history
 */
async function getStatusHistory(req, res) {
  try {
    const userId = req.user.id;
    const { limit = 50, offset = 0 } = req.query;

    const connResult = await db.query(
      'SELECT id FROM status_bot_connections WHERE user_id = $1',
      [userId]
    );

    if (connResult.rows.length === 0) {
      return res.json({ statuses: [], total: 0 });
    }

    const countResult = await db.query(`
      SELECT COUNT(*) FROM status_bot_statuses 
      WHERE connection_id = $1
    `, [connResult.rows[0].id]);

    // Get statuses with queue status
    const result = await db.query(`
      SELECT 
        s.*,
        s.deleted_at IS NOT NULL as is_deleted,
        q.queue_status
      FROM status_bot_statuses s
      LEFT JOIN status_bot_queue q ON q.id = s.queue_id
      WHERE s.connection_id = $1
      ORDER BY COALESCE(s.sent_at, s.created_at) DESC
      LIMIT $2 OFFSET $3
    `, [connResult.rows[0].id, limit, offset]);

    res.json({ 
      statuses: result.rows,
      total: parseInt(countResult.rows[0].count)
    });

  } catch (error) {
    console.error('[StatusBot] Get status history error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת היסטוריה' });
  }
}

/**
 * Get status details with views and reactions
 */
async function getStatusDetails(req, res) {
  try {
    const userId = req.user.id;
    const { statusId } = req.params;

    const connResult = await db.query(
      'SELECT id FROM status_bot_connections WHERE user_id = $1',
      [userId]
    );

    if (connResult.rows.length === 0) {
      return res.status(404).json({ error: 'לא נמצא חיבור' });
    }

    const statusResult = await db.query(`
      SELECT * FROM status_bot_statuses 
      WHERE id = $1 AND connection_id = $2
    `, [statusId, connResult.rows[0].id]);

    if (statusResult.rows.length === 0) {
      return res.status(404).json({ error: 'סטטוס לא נמצא' });
    }

    const viewsResult = await db.query(`
      SELECT * FROM status_bot_views WHERE status_id = $1 ORDER BY viewed_at DESC
    `, [statusId]);

    const reactionsResult = await db.query(`
      SELECT * FROM status_bot_reactions WHERE status_id = $1 ORDER BY reacted_at DESC
    `, [statusId]);

    res.json({
      status: statusResult.rows[0],
      views: viewsResult.rows,
      reactions: reactionsResult.rows
    });

  } catch (error) {
    console.error('[StatusBot] Get status details error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת פרטי סטטוס' });
  }
}

// ============================================
// QUEUE STATUS
// ============================================

/**
 * Get queue status
 */
async function getQueueStatus(req, res) {
  try {
    const userId = req.user.id;

    const connResult = await db.query(
      'SELECT id FROM status_bot_connections WHERE user_id = $1',
      [userId]
    );

    if (connResult.rows.length === 0) {
      return res.json({ queue: [], position: null });
    }

    // Get user's pending items
    const userQueue = await db.query(`
      SELECT * FROM status_bot_queue 
      WHERE connection_id = $1 AND queue_status IN ('pending', 'processing')
      ORDER BY created_at ASC
    `, [connResult.rows[0].id]);

    // Get global queue position
    const globalQueue = await db.query(`
      SELECT COUNT(*) FROM status_bot_queue 
      WHERE queue_status = 'pending'
    `);

    // Get last sent time
    const lockResult = await db.query(`
      SELECT * FROM status_bot_queue_lock WHERE id = 1
    `);

    res.json({
      queue: userQueue.rows,
      globalPending: parseInt(globalQueue.rows[0].count),
      lastSentAt: lockResult.rows[0]?.last_sent_at
    });

  } catch (error) {
    console.error('[StatusBot] Get queue status error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת תור' });
  }
}

// ============================================
// ADMIN ENDPOINTS
// ============================================

/**
 * Get all status bot users (admin)
 */
async function adminGetUsers(req, res) {
  try {
    const result = await db.query(`
      SELECT 
        sbc.*,
        u.email, u.name as user_name,
        (SELECT COUNT(*) FROM status_bot_statuses WHERE connection_id = sbc.id) as total_statuses,
        (SELECT COUNT(*) FROM status_bot_authorized_numbers WHERE connection_id = sbc.id AND is_active = true) as authorized_count
      FROM status_bot_connections sbc
      JOIN users u ON u.id = sbc.user_id
      ORDER BY sbc.created_at DESC
    `);

    res.json({ users: result.rows });

  } catch (error) {
    console.error('[StatusBot Admin] Get users error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת משתמשים' });
  }
}

/**
 * Lift 24-hour restriction (admin)
 */
async function adminLiftRestriction(req, res) {
  try {
    const { connectionId } = req.params;
    const adminId = req.user.id;

    await db.query(`
      UPDATE status_bot_connections 
      SET restriction_lifted = true, restriction_lifted_at = NOW(), restriction_lifted_by = $1, updated_at = NOW()
      WHERE id = $2
    `, [adminId, connectionId]);

    res.json({ success: true, message: 'החסימה הוסרה' });

  } catch (error) {
    console.error('[StatusBot Admin] Lift restriction error:', error);
    res.status(500).json({ error: 'שגיאה בהסרת חסימה' });
  }
}

/**
 * Get status bot stats (admin)
 */
async function adminGetStats(req, res) {
  try {
    const stats = {};

    // Total connections
    const connResult = await db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE connection_status = 'connected') as connected,
        COUNT(*) FILTER (WHERE restriction_lifted = false AND first_connected_at IS NOT NULL 
          AND first_connected_at > NOW() - INTERVAL '24 hours') as restricted
      FROM status_bot_connections
    `);
    stats.connections = connResult.rows[0];

    // Total statuses today
    const statusResult = await db.query(`
      SELECT COUNT(*) FROM status_bot_statuses 
      WHERE sent_at > NOW() - INTERVAL '24 hours'
    `);
    stats.statusesToday = parseInt(statusResult.rows[0].count);

    // Queue status
    const queueResult = await db.query(`
      SELECT 
        COUNT(*) FILTER (WHERE queue_status = 'pending') as pending,
        COUNT(*) FILTER (WHERE queue_status = 'processing') as processing,
        COUNT(*) FILTER (WHERE queue_status = 'failed') as failed
      FROM status_bot_queue
    `);
    stats.queue = queueResult.rows[0];

    res.json({ stats });

  } catch (error) {
    console.error('[StatusBot Admin] Get stats error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת סטטיסטיקות' });
  }
}

// ============================================
// WEBHOOK HANDLER
// ============================================

/**
 * Handle WAHA webhook events for status bot
 */
async function handleWebhook(req, res) {
  try {
    const { userId } = req.params;
    const { event, payload, session } = req.body;

    console.log(`[StatusBot Webhook] Event: ${event} for user ${userId}`);

    // Find connection by session name
    const connResult = await db.query(
      'SELECT * FROM status_bot_connections WHERE session_name = $1',
      [session]
    );

    if (connResult.rows.length === 0) {
      return res.json({ received: true });
    }

    const connection = connResult.rows[0];

    switch (event) {
      case 'session.status':
        await handleSessionStatus(connection, payload);
        break;

      case 'message.ack':
        // Handle status view
        if (payload?.from === 'status@broadcast' && payload?.ackLevel >= 3) {
          await handleStatusView(connection, payload);
        }
        break;

      case 'message.reaction':
        // Handle status reaction
        if (payload?.from === 'status@broadcast') {
          await handleStatusReaction(connection, payload);
        }
        break;
    }

    res.json({ received: true });

  } catch (error) {
    console.error('[StatusBot Webhook] Error:', error);
    res.json({ received: true, error: error.message });
  }
}

async function handleSessionStatus(connection, payload) {
  try {
    const { status } = payload;
    const previousStatus = connection.connection_status;
    
    let newStatus = 'disconnected';
    
    if (status === 'WORKING') {
      newStatus = 'connected';
      
      // Set first_connected_at if not set, and always update last_connected_at
      // Also reset restriction if reconnecting after disconnection
      const wasDisconnected = previousStatus !== 'connected';
      
      if (!connection.first_connected_at) {
        await db.query(`
          UPDATE status_bot_connections 
          SET first_connected_at = NOW(), last_connected_at = NOW()
          WHERE id = $1 AND first_connected_at IS NULL
        `, [connection.id]);
      } else if (wasDisconnected) {
        // Reconnecting - update last_connected_at and reset restriction
        console.log(`[StatusBot] Reconnection detected for ${connection.id}, resetting 24h restriction`);
        await db.query(`
          UPDATE status_bot_connections 
          SET last_connected_at = NOW(), restriction_lifted = false
          WHERE id = $1
        `, [connection.id]);
      }
    } else if (status === 'SCAN_QR_CODE') {
      newStatus = 'qr_pending';
    } else if (status === 'FAILED') {
      newStatus = 'failed';
    }

    // Get phone number if available
    if (payload.me?.id) {
      const phoneNumber = payload.me.id.split('@')[0];
      const displayName = payload.me.pushName || null;

      await db.query(`
        UPDATE status_bot_connections 
        SET connection_status = $1, phone_number = $2, display_name = $3, updated_at = NOW()
        WHERE id = $4
      `, [newStatus, phoneNumber, displayName, connection.id]);
    } else {
      await db.query(`
        UPDATE status_bot_connections 
        SET connection_status = $1, updated_at = NOW()
        WHERE id = $2
      `, [newStatus, connection.id]);
    }

  } catch (error) {
    console.error('[StatusBot] Handle session status error:', error);
  }
}

async function handleStatusView(connection, payload) {
  try {
    const { id: messageId, participant } = payload;

    if (!messageId || !participant) return;

    // Find the status by waha_message_id
    const statusResult = await db.query(`
      SELECT id FROM status_bot_statuses 
      WHERE connection_id = $1 AND waha_message_id = $2
    `, [connection.id, messageId]);

    if (statusResult.rows.length === 0) return;

    const statusId = statusResult.rows[0].id;
    const viewerPhone = participant.split('@')[0];

    // Insert view (ignore duplicate)
    await db.query(`
      INSERT INTO status_bot_views (status_id, viewer_phone)
      VALUES ($1, $2)
      ON CONFLICT (status_id, viewer_phone) DO NOTHING
    `, [statusId, viewerPhone]);

    // Update view count
    await db.query(`
      UPDATE status_bot_statuses 
      SET view_count = (SELECT COUNT(*) FROM status_bot_views WHERE status_id = $1)
      WHERE id = $1
    `, [statusId]);

  } catch (error) {
    console.error('[StatusBot] Handle status view error:', error);
  }
}

async function handleStatusReaction(connection, payload) {
  try {
    const { id: messageId, reaction, participant } = payload;

    if (!messageId || !reaction || !participant) return;

    // Find the status
    const statusResult = await db.query(`
      SELECT id FROM status_bot_statuses 
      WHERE connection_id = $1 AND waha_message_id = $2
    `, [connection.id, messageId]);

    if (statusResult.rows.length === 0) return;

    const statusId = statusResult.rows[0].id;
    const reactorPhone = participant.split('@')[0];

    // Insert/update reaction
    await db.query(`
      INSERT INTO status_bot_reactions (status_id, reactor_phone, reaction)
      VALUES ($1, $2, $3)
      ON CONFLICT (status_id, reactor_phone) 
      DO UPDATE SET reaction = $3, reacted_at = NOW()
    `, [statusId, reactorPhone, reaction.text || '❤️']);

    // Update reaction count
    await db.query(`
      UPDATE status_bot_statuses 
      SET reaction_count = (SELECT COUNT(*) FROM status_bot_reactions WHERE status_id = $1)
      WHERE id = $1
    `, [statusId]);

  } catch (error) {
    console.error('[StatusBot] Handle status reaction error:', error);
  }
}

module.exports = {
  // Connection
  getConnection,
  checkExisting,
  startConnection,
  getQR,
  disconnect,
  
  // Authorized numbers
  getAuthorizedNumbers,
  addAuthorizedNumber,
  removeAuthorizedNumber,
  
  // Status upload
  uploadTextStatus,
  uploadImageStatus,
  uploadVideoStatus,
  uploadVoiceStatus,
  deleteStatus,
  
  // History
  getStatusHistory,
  getStatusDetails,
  
  // Queue
  getQueueStatus,
  
  // Admin
  adminGetUsers,
  adminLiftRestriction,
  adminGetStats,
  
  // Webhook
  handleWebhook,
};
