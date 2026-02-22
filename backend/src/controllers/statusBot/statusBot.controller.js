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

    // Add custom_colors column if not exists
    await db.query(`
      ALTER TABLE status_bot_connections 
      ADD COLUMN IF NOT EXISTS custom_colors JSONB
    `).catch(() => {});

    // Add last_connected_at column if not exists
    await db.query(`
      ALTER TABLE status_bot_connections 
      ADD COLUMN IF NOT EXISTS last_connected_at TIMESTAMP
    `).catch(() => {});

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
      CREATE TABLE IF NOT EXISTS status_bot_replies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        status_id UUID NOT NULL REFERENCES status_bot_statuses(id) ON DELETE CASCADE,
        replier_phone VARCHAR(20) NOT NULL,
        replier_name VARCHAR(100),
        reply_text TEXT,
        replied_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(status_id, replier_phone)
      )
    `);

    // Add reply_count column if not exists
    await db.query(`
      ALTER TABLE status_bot_statuses 
      ADD COLUMN IF NOT EXISTS reply_count INTEGER DEFAULT 0
    `).catch(() => {});

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

    // Cloud API conversation states for WhatsApp Business API bot
    await db.query(`
      CREATE TABLE IF NOT EXISTS cloud_api_conversation_states (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        phone_number VARCHAR(20) NOT NULL UNIQUE,
        connection_id UUID REFERENCES status_bot_connections(id) ON DELETE SET NULL,
        state VARCHAR(50) NOT NULL DEFAULT 'idle',
        state_data JSONB,
        pending_status JSONB,
        pending_statuses JSONB DEFAULT '{}',
        last_message_at TIMESTAMP DEFAULT NOW(),
        blocked_until TIMESTAMP,
        notified_not_authorized BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // Add pending_statuses column if not exists (for existing tables)
    await db.query(`
      ALTER TABLE cloud_api_conversation_states 
      ADD COLUMN IF NOT EXISTS pending_statuses JSONB DEFAULT '{}'
    `);

    // Create indexes
    await db.query(`CREATE INDEX IF NOT EXISTS idx_status_bot_queue_status ON status_bot_queue(queue_status)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_status_bot_statuses_waha_id ON status_bot_statuses(waha_message_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_cloud_api_conv_phone ON cloud_api_conversation_states(phone_number)`);

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
    
    // Trust DB status - webhooks keep it updated in real-time
    // No live WAHA check needed on every request

    // Check restrictions (24-hour or short 30-min "system updates")
    let isRestricted = false;
    let restrictionEndsAt = null;
    let restrictionType = null; // 'full' (24h) or 'short' (30 min system updates)
    
    // First check short restriction (system updates)
    if (connection.short_restriction_until && new Date(connection.short_restriction_until) > new Date()) {
      isRestricted = true;
      restrictionEndsAt = new Date(connection.short_restriction_until);
      restrictionType = 'short';
    } else {
      // Check full 24-hour restriction
      const connectionDate = connection.last_connected_at || connection.first_connected_at;
      if (connectionDate && !connection.restriction_lifted) {
        const connectedAt = new Date(connectionDate);
        const restrictionEnd = new Date(connectedAt.getTime() + 24 * 60 * 60 * 1000);
        
        if (new Date() < restrictionEnd) {
          isRestricted = true;
          restrictionEndsAt = restrictionEnd;
          restrictionType = 'full';
        }
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

    // Auto-add connected phone to authorized numbers if missing (self-healing)
    if (connection.connection_status === 'connected' && connection.phone_number) {
      try {
        await db.query(`
          INSERT INTO status_bot_authorized_numbers (connection_id, phone_number, name, is_active)
          VALUES ($1, $2, $3, true)
          ON CONFLICT (connection_id, phone_number) DO NOTHING
        `, [connection.id, connection.phone_number, connection.display_name || 'המספר המחובר']);
      } catch (authErr) {
        // Ignore - phone may already be in authorized numbers
      }
    }

    res.json({
      connection: {
        ...connection,
        isRestricted,
        restrictionEndsAt,
        restrictionType, // 'full' (24h) or 'short' (30 min system updates)
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
    
    // First check if we have a connection record in DB
    const dbConnection = await db.query(
      'SELECT * FROM status_bot_connections WHERE user_id = $1',
      [userId]
    );
    
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
    
    // Search in WAHA by email, preferring sessions with status-bot webhook configured
    console.log(`[StatusBot] Checking existing session for: ${userEmail}`);
    // Use the main webhook pattern - Status Bot shares the main webhook
    const webhookPattern = `/api/webhook/waha/${userId}`;
    
    const existingSession = await wahaSession.findSessionByEmailWithWebhookPriority(baseUrl, apiKey, userEmail, webhookPattern);
    
    if (existingSession) {
      console.log(`[StatusBot] ✅ Found existing session: ${existingSession.name} (status: ${existingSession.status})`);
      
      // Use the main webhook URL - Status Bot uses the same webhook as the main system
      // The addWebhook function will properly configure both main + intelligence webhooks
      const webhookUrl = `${process.env.APP_URL}/api/webhook/waha/${userId}`;
      const WEBHOOK_EVENTS = [
        'message', 'message.ack', 'session.status', 'call.received', 'call.accepted', 'call.rejected',
        'label.upsert', 'label.deleted', 'label.chat.added', 'label.chat.deleted',
        'poll.vote.failed', 'poll.vote', 'group.leave', 'group.join', 'group.v2.participants',
        'group.v2.update', 'group.v2.leave', 'group.v2.join', 'presence.update', 'message.reaction',
        'message.any', 'message.ack.group', 'message.waiting', 'message.revoked', 'message.edited',
        'chat.archive', 'event.response', 'event.response.failed',
      ];
      wahaSession.addWebhook(baseUrl, apiKey, existingSession.name, webhookUrl, WEBHOOK_EVENTS)
        .catch(err => console.error(`[StatusBot Webhook] Update failed:`, err.message));
      
      // If WORKING - return connected
      if (existingSession.status === 'WORKING') {
        // Update DB if needed
        if (dbConnection.rows.length > 0 && dbConnection.rows[0].connection_status !== 'connected') {
          await db.query(`
            UPDATE status_bot_connections 
            SET connection_status = 'connected', 
                session_name = $2,
                phone_number = COALESCE($3, phone_number),
                display_name = COALESCE($4, display_name),
                updated_at = NOW()
            WHERE user_id = $1
          `, [userId, existingSession.name, 
              existingSession.me?.id?.split('@')[0],
              existingSession.me?.pushName]);
        }
        
        return res.json({
          exists: true,
          sessionName: existingSession.name,
          status: existingSession.status,
          isConnected: true,
          phoneNumber: existingSession.me?.id?.split('@')[0],
          displayName: existingSession.me?.pushName,
        });
      }
      
      // If STARTING - return exists but not connected yet (let frontend poll)
      if (existingSession.status === 'STARTING') {
        console.log(`[StatusBot] Session is STARTING, returning exists=true`);
        return res.json({
          exists: true,
          sessionName: existingSession.name,
          status: existingSession.status,
          isConnected: false,
          isStarting: true,
        });
      }
      
      // If STOPPED - restart it and return exists
      if (existingSession.status === 'STOPPED') {
        console.log(`[StatusBot] Session is STOPPED, restarting...`);
        try {
          await wahaSession.startSession(baseUrl, apiKey, existingSession.name);
          console.log(`[StatusBot] ✅ Restarted session: ${existingSession.name}`);
        } catch (e) {
          console.error(`[StatusBot] Restart failed:`, e.message);
        }
        return res.json({
          exists: true,
          sessionName: existingSession.name,
          status: 'STARTING',
          isConnected: false,
          isStarting: true,
        });
      }
      
      // If SCAN_QR_CODE - return needs QR
      if (existingSession.status === 'SCAN_QR_CODE') {
        return res.json({
          exists: true,
          sessionName: existingSession.name,
          status: existingSession.status,
          isConnected: false,
          needsQR: true,
        });
      }
    }
    
    // No session in WAHA - check if we have DB record with session_name
    if (dbConnection.rows.length > 0 && dbConnection.rows[0].session_name) {
      console.log(`[StatusBot] DB has session_name but not found in WAHA, may need reconnection`);
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
    
    // Step 1: Search in WAHA by email, preferring sessions with webhook configured
    // Use main webhook pattern - Status Bot shares the main webhook
    console.log(`[StatusBot] Searching WAHA for session with email: ${userEmail}`);
    const webhookPattern = `/api/webhook/waha/${userId}`;
    
    try {
      existingSession = await wahaSession.findSessionByEmailWithWebhookPriority(baseUrl, apiKey, userEmail, webhookPattern);
      
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
    
    // Setup webhook for this user - use main webhook URL (shared with bots system)
    const webhookUrl = `${process.env.APP_URL}/api/webhook/waha/${userId}`;
    const WEBHOOK_EVENTS = [
      'message', 'message.ack', 'session.status', 'call.received', 'call.accepted', 'call.rejected',
      'label.upsert', 'label.deleted', 'label.chat.added', 'label.chat.deleted',
      'poll.vote.failed', 'poll.vote', 'group.leave', 'group.join', 'group.v2.participants',
      'group.v2.update', 'group.v2.leave', 'group.v2.join', 'presence.update', 'message.reaction',
      'message.any', 'message.ack.group', 'message.waiting', 'message.revoked', 'message.edited',
      'chat.archive', 'event.response', 'event.response.failed',
    ];
    try {
      await wahaSession.addWebhook(baseUrl, apiKey, sessionName, webhookUrl, WEBHOOK_EVENTS);
      console.log(`[StatusBot Webhook] ✅ Configured main webhook for user ${userId}`);
    } catch (err) {
      console.error('[StatusBot Webhook] Setup failed:', err.message);
    }
    
    // Check if connection record exists
    const existingConn = await db.query(
      'SELECT * FROM status_bot_connections WHERE user_id = $1',
      [userId]
    );
    
    let result;
    if (existingConn.rows.length > 0) {
      // Update existing record - preserve first_connected_at and restriction history
      console.log(`[StatusBot] Updating existing connection record`);
      result = await db.query(`
        UPDATE status_bot_connections 
        SET session_name = $2, 
            connection_status = $3, 
            phone_number = COALESCE($4, phone_number),
            display_name = COALESCE($5, display_name),
            updated_at = NOW()
        WHERE user_id = $1
        RETURNING *
      `, [userId, sessionName, ourStatus, phoneNumber, displayName]);
    } else {
      // Create new record
      console.log(`[StatusBot] Creating new connection record`);
      result = await db.query(`
        INSERT INTO status_bot_connections 
        (user_id, session_name, connection_status, phone_number, display_name, first_connected_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [userId, sessionName, ourStatus, phoneNumber, displayName, 
          ourStatus === 'connected' ? firstConnectedAt : null]);
    }
    
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
      'SELECT id, phone_number, display_name, connection_status FROM status_bot_connections WHERE user_id = $1',
      [userId]
    );

    if (connResult.rows.length === 0) {
      return res.json({ numbers: [] });
    }

    const connection = connResult.rows[0];

    // Auto-add connected phone to authorized numbers if missing (self-healing)
    if (connection.connection_status === 'connected' && connection.phone_number) {
      try {
        await db.query(`
          INSERT INTO status_bot_authorized_numbers (connection_id, phone_number, name, is_active)
          VALUES ($1, $2, $3, true)
          ON CONFLICT (connection_id, phone_number) DO NOTHING
        `, [connection.id, connection.phone_number, connection.display_name || 'המספר המחובר']);
      } catch (authErr) {
        // Ignore - phone may already be in authorized numbers
      }
    }

    const result = await db.query(`
      SELECT * FROM status_bot_authorized_numbers 
      WHERE connection_id = $1 AND is_active = true
      ORDER BY created_at DESC
    `, [connection.id]);

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
    const { text, backgroundColor, font = 0, linkPreview = true, scheduled_for } = req.body;

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

    // Check if can upload (skip for scheduled statuses)
    if (!scheduled_for) {
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
      INSERT INTO status_bot_queue (connection_id, status_type, content, source, scheduled_for)
      VALUES ($1, 'text', $2, 'web', $3)
      RETURNING *
    `, [connection.id, JSON.stringify(content), scheduled_for || null]);

    res.json({ 
      success: true, 
      message: scheduled_for ? 'הסטטוס תוזמן בהצלחה' : 'הסטטוס נוסף לתור',
      queueId: queueResult.rows[0].id,
      scheduled_for: scheduled_for || null
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
    const { url, caption, scheduled_for } = req.body;
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

    // Check if can upload (skip for scheduled statuses)
    if (!scheduled_for) {
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
      INSERT INTO status_bot_queue (connection_id, status_type, content, source, scheduled_for)
      VALUES ($1, 'image', $2, 'web', $3)
      RETURNING *
    `, [connection.id, JSON.stringify(content), scheduled_for || null]);

    res.json({ 
      success: true, 
      message: scheduled_for ? 'הסטטוס תוזמן בהצלחה' : 'הסטטוס נשלח',
      queueId: queueResult.rows[0].id,
      scheduled_for: scheduled_for || null
    });

  } catch (error) {
    console.error('[StatusBot] Upload image status error:', error);
    res.status(500).json({ error: 'שגיאה בהעלאת סטטוס' });
  }
}

/**
 * Upload video status
 * Supports auto-splitting videos over 60 seconds
 */
async function uploadVideoStatus(req, res) {
  try {
    const userId = req.user.id;
    const { url, caption, scheduled_for, parts: partsJson } = req.body;
    const file = req.file;

    if (!url && !file && !partsJson) {
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

    // Check if can upload (skip for scheduled statuses)
    if (!scheduled_for) {
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
    }

    // Handle multi-part video (already split by frontend)
    if (partsJson) {
      const parts = JSON.parse(partsJson);
      const partGroupId = require('uuid').v4();
      const queueIds = [];
      
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const content = {
          file: {
            mimetype: 'video/mp4',
            filename: `status_part${i + 1}.mp4`,
            url: part.url
          },
          convert: true,
          caption: part.caption || ''
        };
        
        const queueResult = await db.query(`
          INSERT INTO status_bot_queue (connection_id, status_type, content, source, scheduled_for, part_group_id, part_number, total_parts)
          VALUES ($1, 'video', $2, 'web', $3, $4, $5, $6)
          RETURNING *
        `, [connection.id, JSON.stringify(content), scheduled_for || null, partGroupId, i + 1, parts.length]);
        
        queueIds.push(queueResult.rows[0].id);
      }
      
      return res.json({ 
        success: true, 
        message: scheduled_for ? `${parts.length} חלקי סרטון תוזמנו בהצלחה` : `${parts.length} חלקי סרטון נוספו לתור`,
        queueIds,
        partsCount: parts.length,
        scheduled_for: scheduled_for || null
      });
    }

    // Determine video URL
    let videoUrl;
    if (file) {
      const baseUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 3000}/api`;
      videoUrl = `${baseUrl}/uploads/status-bot/${file.filename}`;
    } else {
      videoUrl = url;
    }

    // Try to check video duration and split if needed
    let splitResult = null;
    try {
      const videoSplit = require('../../services/statusBot/videoSplit.service');
      splitResult = await videoSplit.processVideo(videoUrl);
    } catch (splitErr) {
      console.log('[StatusBot] Video split check skipped:', splitErr.message);
      // Continue without splitting if ffprobe fails
    }

    // If video needs splitting
    if (splitResult && splitResult.needsSplit) {
      const parts = splitResult.parts;
      const partGroupId = require('uuid').v4();
      const queueIds = [];
      
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const partCaption = i === 0 ? (caption || '') : '';
        const content = {
          file: {
            mimetype: 'video/mp4',
            filename: `status_part${i + 1}.mp4`,
            url: part.url
          },
          convert: true,
          caption: partCaption
        };
        
        const queueResult = await db.query(`
          INSERT INTO status_bot_queue (connection_id, status_type, content, source, scheduled_for, part_group_id, part_number, total_parts)
          VALUES ($1, 'video', $2, 'web', $3, $4, $5, $6)
          RETURNING *
        `, [connection.id, JSON.stringify(content), scheduled_for || null, partGroupId, i + 1, parts.length]);
        
        queueIds.push(queueResult.rows[0].id);
      }
      
      return res.json({ 
        success: true, 
        message: scheduled_for ? `הסרטון חולק ל-${parts.length} חלקים ותוזמן בהצלחה` : `הסרטון חולק ל-${parts.length} חלקים ונוסף לתור`,
        queueIds,
        partsCount: parts.length,
        partDuration: splitResult.partDuration,
        wasSplit: true,
        scheduled_for: scheduled_for || null
      });
    }

    // Normal single video (no split needed or split failed)
    let content;
    if (file) {
      content = {
        file: {
          mimetype: file.mimetype,
          filename: file.originalname,
          url: videoUrl
        },
        convert: true,
        caption: caption || ''
      };
    } else {
      content = {
        file: {
          mimetype: 'video/mp4',
          filename: 'status.mp4',
          url: videoUrl
        },
        convert: true,
        caption: caption || ''
      };
    }

    const queueResult = await db.query(`
      INSERT INTO status_bot_queue (connection_id, status_type, content, source, scheduled_for)
      VALUES ($1, 'video', $2, 'web', $3)
      RETURNING *
    `, [connection.id, JSON.stringify(content), scheduled_for || null]);

    res.json({ 
      success: true, 
      message: scheduled_for ? 'הסטטוס תוזמן בהצלחה' : 'הסטטוס נשלח',
      queueId: queueResult.rows[0].id,
      scheduled_for: scheduled_for || null
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
    const { url, backgroundColor, scheduled_for } = req.body;
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

    // Check if can upload (skip for scheduled statuses)
    if (!scheduled_for) {
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
      INSERT INTO status_bot_queue (connection_id, status_type, content, source, scheduled_for)
      VALUES ($1, 'voice', $2, 'web', $3)
      RETURNING *
    `, [connection.id, JSON.stringify(content), scheduled_for || null]);

    res.json({ 
      success: true, 
      message: scheduled_for ? 'הסטטוס תוזמן בהצלחה' : 'הסטטוס נשלח',
      queueId: queueResult.rows[0].id,
      scheduled_for: scheduled_for || null
    });

  } catch (error) {
    console.error('[StatusBot] Upload voice status error:', error);
    res.status(500).json({ error: 'שגיאה בהעלאת סטטוס' });
  }
}

/**
 * Delete a status
 * Handles both queued (not yet sent) and sent statuses
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

    // Get status with queue info
    const statusResult = await db.query(`
      SELECT s.*, q.queue_status 
      FROM status_bot_statuses s
      LEFT JOIN status_bot_queue q ON q.id = s.queue_id
      WHERE s.id = $1 AND s.connection_id = $2
    `, [statusId, connection.id]);

    if (statusResult.rows.length === 0) {
      return res.status(404).json({ error: 'סטטוס לא נמצא' });
    }

    const status = statusResult.rows[0];
    let deletedFromWhatsApp = false;
    let cancelledFromQueue = false;

    // If status is pending in queue, cancel it
    if (status.queue_id && (status.queue_status === 'pending' || status.queue_status === 'processing')) {
      await db.query(`
        UPDATE status_bot_queue SET queue_status = 'cancelled' WHERE id = $1
      `, [status.queue_id]);
      cancelledFromQueue = true;
      console.log(`[StatusBot] Cancelled queued status ${statusId}`);
    }

    // If status was sent and has waha_message_id, delete from WhatsApp
    if (status.waha_message_id) {
      const { baseUrl, apiKey } = await getWahaCredentials();

      try {
        await wahaSession.makeRequest(baseUrl, apiKey, 'POST', `/api/${connection.session_name}/status/delete`, {
          id: status.waha_message_id,
          contacts: null
        });
        deletedFromWhatsApp = true;
        console.log(`[StatusBot] Deleted status ${statusId} from WhatsApp`);
      } catch (wahaError) {
        console.error('[StatusBot] WAHA delete error:', wahaError.message);
        // Continue anyway - mark as deleted in DB
      }
    }

    // Mark as deleted in DB
    await db.query(`
      UPDATE status_bot_statuses SET deleted_at = NOW() WHERE id = $1
    `, [statusId]);

    res.json({ 
      success: true, 
      deletedFromWhatsApp,
      cancelledFromQueue,
      message: cancelledFromQueue 
        ? 'הסטטוס הוסר מהתור' 
        : deletedFromWhatsApp 
          ? 'הסטטוס נמחק מווצאפ' 
          : 'הסטטוס סומן כנמחק'
    });

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

    const repliesResult = await db.query(`
      SELECT * FROM status_bot_replies WHERE status_id = $1 ORDER BY replied_at DESC
    `, [statusId]);

    res.json({
      status: statusResult.rows[0],
      views: viewsResult.rows,
      reactions: reactionsResult.rows,
      replies: repliesResult.rows
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
      return res.json({ queue: [], scheduled: [], position: null });
    }

    // Get user's pending items (no scheduled_for)
    const userQueue = await db.query(`
      SELECT * FROM status_bot_queue 
      WHERE connection_id = $1 AND queue_status IN ('pending', 'processing') AND scheduled_for IS NULL
      ORDER BY created_at ASC
    `, [connResult.rows[0].id]);

    // Get user's scheduled items (including 'scheduled' status for backwards compatibility)
    const scheduledQueue = await db.query(`
      SELECT * FROM status_bot_queue 
      WHERE connection_id = $1 AND queue_status IN ('pending', 'scheduled') AND scheduled_for IS NOT NULL
      ORDER BY scheduled_for ASC
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
      scheduled: scheduledQueue.rows,
      globalPending: parseInt(globalQueue.rows[0].count),
      lastSentAt: lockResult.rows[0]?.last_sent_at
    });

  } catch (error) {
    console.error('[StatusBot] Get queue status error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת תור' });
  }
}

/**
 * Delete/cancel a queue item
 */
async function deleteQueueItem(req, res) {
  try {
    const userId = req.user.id;
    const { queueId } = req.params;

    // Verify the queue item belongs to the user
    const result = await db.query(`
      SELECT q.* FROM status_bot_queue q
      JOIN status_bot_connections c ON c.id = q.connection_id
      WHERE q.id = $1 AND c.user_id = $2
    `, [queueId, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'לא נמצא פריט בתור' });
    }

    const queueItem = result.rows[0];

    // Allow cancelling pending or scheduled items (not processing or sent)
    if (!['pending', 'scheduled'].includes(queueItem.queue_status)) {
      return res.status(400).json({ error: 'לא ניתן לבטל פריט שכבר בעיבוד או נשלח' });
    }

    // Update status to cancelled
    await db.query(`
      UPDATE status_bot_queue 
      SET queue_status = 'cancelled'
      WHERE id = $1
    `, [queueId]);

    res.json({ success: true, message: 'התזמון בוטל' });

  } catch (error) {
    console.error('[StatusBot] Delete queue item error:', error);
    res.status(500).json({ error: 'שגיאה בביטול התזמון' });
  }
}

/**
 * Send a queued item immediately (removes scheduled time)
 */
async function sendQueueItemNow(req, res) {
  try {
    const userId = req.user.id;
    const { queueId } = req.params;

    // Verify the queue item belongs to the user
    const result = await db.query(`
      SELECT q.* FROM status_bot_queue q
      JOIN status_bot_connections c ON c.id = q.connection_id
      WHERE q.id = $1 AND c.user_id = $2
    `, [queueId, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'לא נמצא פריט בתור' });
    }

    const queueItem = result.rows[0];

    // Allow for pending or scheduled items (not processing or sent)
    if (!['pending', 'scheduled'].includes(queueItem.queue_status)) {
      return res.status(400).json({ error: 'לא ניתן לשלוח פריט שכבר בעיבוד או נשלח' });
    }

    // Remove scheduled_for to make it send immediately
    await db.query(`
      UPDATE status_bot_queue 
      SET scheduled_for = NULL, queue_status = 'pending'
      WHERE id = $1
    `, [queueId]);

    res.json({ success: true, message: 'הסטטוס יישלח בקרוב' });

  } catch (error) {
    console.error('[StatusBot] Send queue item now error:', error);
    res.status(500).json({ error: 'שגיאה בשליחת הסטטוס' });
  }
}

/**
 * Update a queue item (e.g., reschedule)
 */
async function updateQueueItem(req, res) {
  try {
    const userId = req.user.id;
    const { queueId } = req.params;
    const { scheduled_for } = req.body;

    // Verify the queue item belongs to the user
    const result = await db.query(`
      SELECT q.* FROM status_bot_queue q
      JOIN status_bot_connections c ON c.id = q.connection_id
      WHERE q.id = $1 AND c.user_id = $2
    `, [queueId, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'לא נמצא פריט בתור' });
    }

    const queueItem = result.rows[0];

    // Allow for pending or scheduled items (not processing or sent)
    if (!['pending', 'scheduled'].includes(queueItem.queue_status)) {
      return res.status(400).json({ error: 'לא ניתן לעדכן פריט שכבר בעיבוד או נשלח' });
    }

    // Validate scheduled_for if provided
    if (scheduled_for) {
      const scheduledDate = new Date(scheduled_for);
      if (isNaN(scheduledDate.getTime())) {
        return res.status(400).json({ error: 'תאריך לא תקין' });
      }
      if (scheduledDate < new Date()) {
        return res.status(400).json({ error: 'לא ניתן לתזמן לעבר' });
      }
    }

    // Update the queue item
    await db.query(`
      UPDATE status_bot_queue 
      SET scheduled_for = $1
      WHERE id = $2
    `, [scheduled_for || null, queueId]);

    res.json({ success: true, message: 'התזמון עודכן' });

  } catch (error) {
    console.error('[StatusBot] Update queue item error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון התזמון' });
  }
}

/**
 * Get failed/cancelled statuses for user
 */
async function getFailedStatuses(req, res) {
  try {
    const userId = req.user.id;

    const connResult = await db.query(
      'SELECT id FROM status_bot_connections WHERE user_id = $1',
      [userId]
    );

    if (connResult.rows.length === 0) {
      return res.json({ failedStatuses: [] });
    }

    // Get failed/cancelled items from last 7 days
    const result = await db.query(`
      SELECT id, status_type, content, queue_status, error_message, retry_count, created_at
      FROM status_bot_queue 
      WHERE connection_id = $1 AND queue_status IN ('failed', 'cancelled')
      AND created_at > NOW() - INTERVAL '7 days'
      ORDER BY created_at DESC
      LIMIT 50
    `, [connResult.rows[0].id]);

    res.json({ failedStatuses: result.rows });

  } catch (error) {
    console.error('[StatusBot] Get failed statuses error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת סטטוסים שנכשלו' });
  }
}

/**
 * Retry a failed/cancelled status
 */
async function retryFailedStatus(req, res) {
  try {
    const userId = req.user.id;
    const { queueId } = req.params;

    // Verify the queue item belongs to the user
    const result = await db.query(`
      SELECT q.* FROM status_bot_queue q
      JOIN status_bot_connections c ON c.id = q.connection_id
      WHERE q.id = $1 AND c.user_id = $2
    `, [queueId, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'לא נמצא פריט' });
    }

    const queueItem = result.rows[0];

    // Only allow retrying failed or cancelled items
    if (!['failed', 'cancelled'].includes(queueItem.queue_status)) {
      return res.status(400).json({ error: 'ניתן לנסות מחדש רק פריטים שנכשלו או בוטלו' });
    }

    // Reset to pending
    await db.query(`
      UPDATE status_bot_queue 
      SET queue_status = 'pending', error_message = NULL, retry_count = 0, updated_at = NOW()
      WHERE id = $1
    `, [queueId]);

    res.json({ success: true, message: 'הסטטוס הוכנס מחדש לתור' });

  } catch (error) {
    console.error('[StatusBot] Retry failed status error:', error);
    res.status(500).json({ error: 'שגיאה בניסיון מחדש' });
  }
}

/**
 * Delete a failed/cancelled status permanently
 */
async function deleteFailedStatus(req, res) {
  try {
    const userId = req.user.id;
    const { queueId } = req.params;

    // Verify the queue item belongs to the user
    const result = await db.query(`
      SELECT q.* FROM status_bot_queue q
      JOIN status_bot_connections c ON c.id = q.connection_id
      WHERE q.id = $1 AND c.user_id = $2
    `, [queueId, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'לא נמצא פריט' });
    }

    const queueItem = result.rows[0];

    // Only allow deleting failed or cancelled items
    if (!['failed', 'cancelled'].includes(queueItem.queue_status)) {
      return res.status(400).json({ error: 'ניתן למחוק רק פריטים שנכשלו או בוטלו' });
    }

    // Delete the item
    await db.query('DELETE FROM status_bot_queue WHERE id = $1', [queueId]);

    res.json({ success: true, message: 'הסטטוס נמחק' });

  } catch (error) {
    console.error('[StatusBot] Delete failed status error:', error);
    res.status(500).json({ error: 'שגיאה במחיקה' });
  }
}

/**
 * Update and retry a failed/cancelled status
 */
async function updateAndRetryStatus(req, res) {
  try {
    const userId = req.user.id;
    const { queueId } = req.params;
    const { content } = req.body;

    // Verify the queue item belongs to the user
    const result = await db.query(`
      SELECT q.* FROM status_bot_queue q
      JOIN status_bot_connections c ON c.id = q.connection_id
      WHERE q.id = $1 AND c.user_id = $2
    `, [queueId, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'לא נמצא פריט' });
    }

    const queueItem = result.rows[0];

    // Only allow editing failed or cancelled items
    if (!['failed', 'cancelled'].includes(queueItem.queue_status)) {
      return res.status(400).json({ error: 'ניתן לערוך רק פריטים שנכשלו או בוטלו' });
    }

    // Update content and reset to pending
    await db.query(`
      UPDATE status_bot_queue 
      SET content = $1, queue_status = 'pending', error_message = NULL, retry_count = 0
      WHERE id = $2
    `, [JSON.stringify(content), queueId]);

    res.json({ success: true, message: 'הסטטוס עודכן והוכנס לתור' });

  } catch (error) {
    console.error('[StatusBot] Update and retry status error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון' });
  }
}

/**
 * Get in-progress statuses (pending/processing) for user
 */
async function getInProgressStatuses(req, res) {
  try {
    const userId = req.user.id;

    const connResult = await db.query(
      'SELECT id FROM status_bot_connections WHERE user_id = $1',
      [userId]
    );

    if (connResult.rows.length === 0) {
      return res.json({ inProgress: [] });
    }

    // Get pending and processing items (not scheduled)
    const result = await db.query(`
      SELECT id, status_type, content, queue_status, created_at
      FROM status_bot_queue 
      WHERE connection_id = $1 AND queue_status IN ('pending', 'processing') AND scheduled_for IS NULL
      ORDER BY created_at ASC
    `, [connResult.rows[0].id]);

    res.json({ inProgress: result.rows });

  } catch (error) {
    console.error('[StatusBot] Get in-progress statuses error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת סטטוסים בתהליך' });
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
 * Lift restriction (admin) - works for both 24h and 30min restrictions
 */
async function adminLiftRestriction(req, res) {
  try {
    const { connectionId } = req.params;
    const adminId = req.user.id;

    await db.query(`
      UPDATE status_bot_connections 
      SET restriction_lifted = true, 
          restriction_lifted_at = NOW(), 
          restriction_lifted_by = $1, 
          short_restriction_until = NULL,
          updated_at = NOW()
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

/**
 * Get active processes for admin monitoring (real-time dashboard)
 * Shows active conversations with the bot and currently processing uploads
 */
async function adminGetActiveProcesses(req, res) {
  try {
    // Get active conversations (not idle, updated in last 10 minutes)
    const conversationsResult = await db.query(`
      SELECT 
        c.phone_number,
        c.state,
        c.state_data,
        c.last_message_at,
        c.connection_id,
        conn.display_name,
        conn.phone_number as bot_phone,
        u.name as user_name,
        u.email as user_email
      FROM cloud_api_conversation_states c
      LEFT JOIN status_bot_connections conn ON conn.id = c.connection_id
      LEFT JOIN users u ON conn.user_id = u.id
      WHERE c.state != 'idle' 
        AND c.last_message_at > NOW() - INTERVAL '10 minutes'
      ORDER BY c.last_message_at DESC
    `);

    // Get currently processing queue items
    const processingResult = await db.query(`
      SELECT 
        q.id,
        q.status_type,
        q.content,
        q.processing_started_at,
        q.source,
        q.source_phone,
        q.part_number,
        q.total_parts,
        conn.display_name,
        conn.phone_number as bot_phone,
        u.name as user_name,
        u.email as user_email
      FROM status_bot_queue q
      JOIN status_bot_connections conn ON conn.id = q.connection_id
      JOIN users u ON conn.user_id = u.id
      WHERE q.queue_status = 'processing'
      ORDER BY q.processing_started_at ASC
    `);

    // Get queue lock status
    const lockResult = await db.query(`
      SELECT is_processing, processing_started_at, last_sent_at
      FROM status_bot_queue_lock WHERE id = 1
    `);

    // Get pending count
    const pendingResult = await db.query(`
      SELECT COUNT(*) as count FROM status_bot_queue WHERE queue_status = 'pending'
    `);

    res.json({
      activeConversations: conversationsResult.rows.map(c => ({
        phone: c.phone_number,
        state: c.state,
        stateData: c.state_data,
        lastMessageAt: c.last_message_at,
        botPhone: c.bot_phone,
        displayName: c.display_name,
        userName: c.user_name,
        userEmail: c.user_email
      })),
      processingUploads: processingResult.rows.map(p => ({
        id: p.id,
        statusType: p.status_type,
        content: p.content,
        startedAt: p.processing_started_at,
        source: p.source,
        sourcePhone: p.source_phone,
        partNumber: p.part_number,
        totalParts: p.total_parts,
        displayName: p.display_name,
        botPhone: p.bot_phone,
        userName: p.user_name,
        userEmail: p.user_email
      })),
      queueLock: lockResult.rows[0] || null,
      pendingCount: parseInt(pendingResult.rows[0].count)
    });

  } catch (error) {
    console.error('[StatusBot Admin] Get active processes error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת תהליכים פעילים' });
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
        console.log(`[StatusBot Webhook] 📡 Session status: ${payload?.status} (was: ${connection.connection_status})`);
        await handleSessionStatus(connection, payload);
        break;

      case 'message.ack':
        const ackLevel = payload?.ack || payload?.ackLevel;
        
        // Check if this is a status view - try multiple conditions
        const isStatusView = 
          payload?.from === 'status@broadcast' || 
          payload?.chatId === 'status@broadcast' ||
          (payload?.id && typeof payload.id === 'string' && payload.id.includes('status@broadcast'));
        
        if (isStatusView && ackLevel >= 3) {
          // Status view logging disabled to reduce log noise
          await handleStatusView(connection, payload);
        }
        break;

      case 'message.reaction':
        // Handle status reaction - try multiple conditions
        const isStatusReaction = 
          payload?.from === 'status@broadcast' || 
          payload?.to === 'status@broadcast' ||
          payload?.chatId === 'status@broadcast';
        
        if (isStatusReaction) {
          // Status reaction logging disabled to reduce log noise
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
      
      // Check how long the connection was down
      const disconnectionDuration = connection.updated_at 
        ? (Date.now() - new Date(connection.updated_at).getTime()) / 1000 
        : 999999;
      
      const requiresReauthentication = previousStatus === 'qr_pending' || previousStatus === 'failed';
      const wasDisconnected = previousStatus === 'disconnected' || previousStatus === 'failed' || previousStatus === 'qr_pending';
      
      if (!connection.first_connected_at) {
        // First time connecting - 24h restriction
        await db.query(`
          UPDATE status_bot_connections 
          SET first_connected_at = NOW(), last_connected_at = NOW(), short_restriction_until = NULL
          WHERE id = $1 AND first_connected_at IS NULL
        `, [connection.id]);
      } else if (wasDisconnected && disconnectionDuration < 60) {
        // Short disconnection (< 1 minute) - use 30 min "system updates" restriction
        const shortRestrictionUntil = new Date(Date.now() + 30 * 60 * 1000);
        await db.query(`
          UPDATE status_bot_connections 
          SET restriction_lifted = true, short_restriction_until = $2
          WHERE id = $1
        `, [connection.id, shortRestrictionUntil]);
      } else if (requiresReauthentication) {
        // Re-authentication required (QR scan) with longer disconnection - 24h restriction
        await db.query(`
          UPDATE status_bot_connections 
          SET last_connected_at = NOW(), restriction_lifted = false, short_restriction_until = NULL
          WHERE id = $1
        `, [connection.id]);
      }
    } else if (status === 'SCAN_QR_CODE') {
      newStatus = 'qr_pending';
    } else if (status === 'FAILED') {
      newStatus = 'failed';
    } else if (status === 'STOPPED') {
      newStatus = 'disconnected';
      
      // Schedule a check after 60 seconds to determine restriction type
      if (connection.first_connected_at) {
        const connectionId = connection.id;
        const sessionName = connection.session_name;
        console.log(`[StatusBot] ⏰ Scheduling reconnection check in 60 seconds for connection ${connectionId}`);
        
        setTimeout(async () => {
          try {
            console.log(`[StatusBot] ⏰ Running scheduled reconnection check for ${connectionId}`);
            
            // Get fresh connection data
            const connResult = await db.query('SELECT * FROM status_bot_connections WHERE id = $1', [connectionId]);
            if (connResult.rows.length === 0) {
              console.log(`[StatusBot] ⏰ Connection ${connectionId} no longer exists, skipping check`);
              return;
            }
            
            const freshConnection = connResult.rows[0];
            
            // If already reconnected via webhook, skip
            if (freshConnection.connection_status === 'connected') {
              console.log(`[StatusBot] ⏰ Connection ${connectionId} already reconnected (via webhook), skipping`);
              return;
            }
            
            // Check WAHA status
            const { baseUrl, apiKey } = await getWahaCredentials();
            const wahaStatus = await wahaSession.getSessionStatus(baseUrl, apiKey, sessionName);
            
            console.log(`[StatusBot] ⏰ WAHA status for ${sessionName}: ${wahaStatus?.status}`);
            
            if (wahaStatus?.status === 'WORKING') {
              // Reconnected without webhook! Apply 30 min restriction
              const shortRestrictionUntil = new Date(Date.now() + 30 * 60 * 1000);
              console.log(`[StatusBot] ⏰ WAHA is WORKING but no webhook received - applying 30 min restriction`);
              
              const phoneNumber = wahaStatus.me?.id?.split('@')[0] || freshConnection.phone_number;
              const displayName = wahaStatus.me?.pushName || freshConnection.display_name;
              
              await db.query(`
                UPDATE status_bot_connections 
                SET connection_status = 'connected', 
                    phone_number = COALESCE($2, phone_number),
                    display_name = COALESCE($3, display_name),
                    short_restriction_until = $4,
                    restriction_lifted = true,
                    updated_at = NOW()
                WHERE id = $1
              `, [connectionId, phoneNumber, displayName, shortRestrictionUntil]);
              
              console.log(`[StatusBot] ⏰ Applied 30 min restriction until ${shortRestrictionUntil.toISOString()}`);
            } else {
              // Still disconnected after 60 seconds - will get full restriction when reconnects
              console.log(`[StatusBot] ⏰ Still disconnected after 60s, will get full restriction on reconnect`);
            }
          } catch (err) {
            console.error(`[StatusBot] ⏰ Error in scheduled reconnection check:`, err);
          }
        }, 60 * 1000); // 60 seconds
      }
    } else {
      console.log(`[StatusBot] ➡️ Unknown WAHA status "${status}", defaulting to disconnected`);
    }

    // Get phone number if available
    const now = new Date();
    console.log(`[StatusBot] 💾 Saving to DB: status=${newStatus}, timestamp=${now.toISOString()}`);
    
    if (payload.me?.id) {
      const phoneNumber = payload.me.id.split('@')[0];
      const displayName = payload.me.pushName || null;

      await db.query(`
        UPDATE status_bot_connections 
        SET connection_status = $1, phone_number = $2, display_name = $3, updated_at = NOW()
        WHERE id = $4
      `, [newStatus, phoneNumber, displayName, connection.id]);

      // Auto-add connected phone to authorized numbers (if not already exists)
      if (newStatus === 'connected' && phoneNumber) {
        try {
          await db.query(`
            INSERT INTO status_bot_authorized_numbers (connection_id, phone_number, name, is_active)
            VALUES ($1, $2, $3, true)
            ON CONFLICT (connection_id, phone_number) DO NOTHING
          `, [connection.id, phoneNumber, displayName || 'המספר המחובר']);
          console.log(`[StatusBot] Auto-added connected phone ${phoneNumber} to authorized numbers`);
        } catch (authErr) {
          console.log(`[StatusBot] Phone ${phoneNumber} may already be in authorized numbers`);
        }
      }
    } else {
      await db.query(`
        UPDATE status_bot_connections 
        SET connection_status = $1, updated_at = NOW()
        WHERE id = $2
      `, [newStatus, connection.id]);
    }
    
    console.log(`[StatusBot] ========== END handleSessionStatus ==========`);

  } catch (error) {
    console.error('[StatusBot] Handle session status error:', error);
  }
}

async function handleStatusView(connection, payload) {
  try {
    // Message ID can be in different formats
    const messageId = payload?.id?._serialized || payload?.id;
    const participant = payload?.participant;

    if (!messageId) return;

    // Find the status by waha_message_id (try multiple formats)
    let statusResult = await db.query(`
      SELECT id FROM status_bot_statuses 
      WHERE connection_id = $1 AND waha_message_id = $2
    `, [connection.id, messageId]);

    // If not found, try extracting the hex ID from the full message ID
    // Format: true_status@broadcast_3EB045A56403626C1E6CE9_972553180071@c.us
    if (statusResult.rows.length === 0 && messageId.includes('status@broadcast')) {
      const parts = messageId.split('_');
      let hexId = null;
      for (const part of parts) {
        if (/^[A-F0-9]{20,}$/i.test(part)) {
          hexId = part;
          break;
        }
      }
      
      if (hexId) {
        statusResult = await db.query(`
          SELECT id FROM status_bot_statuses 
          WHERE connection_id = $1 AND waha_message_id LIKE $2
        `, [connection.id, `%${hexId}%`]);
      }
    }

    if (statusResult.rows.length === 0) return;

    const statusId = statusResult.rows[0].id;
    
    // Get viewer phone - might be in participant or elsewhere
    let viewerPhone = participant?.split('@')[0];
    if (!viewerPhone && payload?.to) {
      viewerPhone = payload.to.split('@')[0];
    }
    
    if (!viewerPhone || viewerPhone === 'status') return;
    
    // Check if viewerPhone is a LID (15+ digits, not starting with country code pattern)
    // LIDs are typically 15-18 digit numbers that start with 2-3
    const isLid = /^\d{15,18}$/.test(viewerPhone) && /^[23]/.test(viewerPhone);
    
    if (isLid) {
      // Try to resolve LID to phone number
      try {
        const systemCreds = getWahaCredentials();
        const wahaConnection = {
          base_url: systemCreds.baseUrl,
          api_key: systemCreds.apiKey,
          session_name: connection.session_name
        };
        
        const resolvedPhone = await wahaSession.resolveLid(wahaConnection, viewerPhone);
        if (resolvedPhone) {
          viewerPhone = resolvedPhone;
        }
      } catch (lidErr) {
        // Continue with original viewerPhone if resolution fails
      }
    }

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
    // For reactions, the actual status message ID is in reaction.messageId
    const reactionData = payload?.reaction;
    const messageId = reactionData?.messageId || payload?.id?._serialized || payload?.id;
    const participant = payload?.participant || payload?.from;

    if (!messageId) return;

    // Find the status (try multiple formats)
    let statusResult = await db.query(`
      SELECT id FROM status_bot_statuses 
      WHERE connection_id = $1 AND waha_message_id = $2
    `, [connection.id, messageId]);

    // If not found, try extracting the hex ID
    if (statusResult.rows.length === 0 && messageId.includes('status@broadcast')) {
      const parts = messageId.split('_');
      let hexId = null;
      for (const part of parts) {
        if (/^[A-F0-9]{20,}$/i.test(part)) {
          hexId = part;
          break;
        }
      }
      
      if (hexId) {
        statusResult = await db.query(`
          SELECT id FROM status_bot_statuses 
          WHERE connection_id = $1 AND waha_message_id LIKE $2
        `, [connection.id, `%${hexId}%`]);
      }
    }

    if (statusResult.rows.length === 0) return;

    const statusId = statusResult.rows[0].id;
    
    // Get reactor phone
    let reactorPhone = participant?.split('@')[0];
    if (!reactorPhone || reactorPhone === 'status') return;
    
    // Check if reactorPhone is a LID and resolve it
    const isLid = /^\d{15,18}$/.test(reactorPhone) && /^[23]/.test(reactorPhone);
    
    if (isLid) {
      try {
        const systemCreds = getWahaCredentials();
        const wahaConnection = {
          base_url: systemCreds.baseUrl,
          api_key: systemCreds.apiKey,
          session_name: connection.session_name
        };
        
        const resolvedPhone = await wahaSession.resolveLid(wahaConnection, reactorPhone);
        if (resolvedPhone) {
          reactorPhone = resolvedPhone;
        }
      } catch (lidErr) {
        // Continue with original reactorPhone if resolution fails
      }
    }

    // Get reaction text (emoji)
    const reactionText = reactionData?.text || reactionData?.emoji || reactionData || '❤️';

    // Insert or update reaction (user can only have one reaction per status)
    await db.query(`
      INSERT INTO status_bot_reactions (status_id, reactor_phone, reaction)
      VALUES ($1, $2, $3)
      ON CONFLICT (status_id, reactor_phone) DO UPDATE SET reaction = $3, reacted_at = NOW()
    `, [statusId, reactorPhone, reactionText]);

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

/**
 * Analyze video to check if it needs splitting
 * Returns split info without actually splitting
 */
async function analyzeVideo(req, res) {
  try {
    const { url } = req.body;
    const file = req.file;
    
    if (!url && !file) {
      return res.status(400).json({ error: 'נדרש URL או קובץ וידאו' });
    }
    
    let videoUrl;
    if (file) {
      const baseUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 3000}/api`;
      videoUrl = `${baseUrl}/uploads/status-bot/${file.filename}`;
    } else {
      videoUrl = url;
    }
    
    const videoSplit = require('../../services/statusBot/videoSplit.service');
    
    // Get video duration
    const duration = await videoSplit.getVideoDuration(videoUrl);
    const needsSplit = duration > videoSplit.MAX_DURATION;
    
    if (!needsSplit) {
      return res.json({
        needsSplit: false,
        duration,
        formattedDuration: videoSplit.formatDuration(duration)
      });
    }
    
    // Calculate split info without actually splitting
    const { partCount, partDuration } = videoSplit.calculateSplit(duration);
    
    res.json({
      needsSplit: true,
      duration,
      formattedDuration: videoSplit.formatDuration(duration),
      partCount,
      partDuration,
      formattedPartDuration: videoSplit.formatDuration(partDuration)
    });
    
  } catch (error) {
    console.error('[StatusBot] Analyze video error:', error);
    res.status(500).json({ error: 'שגיאה בניתוח הסרטון' });
  }
}

/**
 * Process and split a video into parts
 * Returns URLs of split video parts
 */
async function processVideoSplit(req, res) {
  try {
    const { url } = req.body;
    const file = req.file;
    
    if (!url && !file) {
      return res.status(400).json({ error: 'נדרש URL או קובץ וידאו' });
    }
    
    let videoUrl;
    if (file) {
      const baseUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 3000}/api`;
      videoUrl = `${baseUrl}/uploads/status-bot/${file.filename}`;
    } else {
      videoUrl = url;
    }
    
    const videoSplit = require('../../services/statusBot/videoSplit.service');
    const result = await videoSplit.processVideo(videoUrl);
    
    res.json({
      needsSplit: result.needsSplit,
      duration: result.duration,
      partDuration: result.partDuration,
      parts: result.parts.map(p => ({
        url: p.url,
        partNumber: p.partNumber,
        totalParts: p.totalParts
      }))
    });
    
  } catch (error) {
    console.error('[StatusBot] Process video split error:', error);
    res.status(500).json({ error: 'שגיאה בעיבוד הסרטון' });
  }
}

// ============================================
// PENDING STATUSES (from WhatsApp bot conversations)
// ============================================

/**
 * Get pending statuses for a user (from WhatsApp bot conversations)
 */
async function getPendingStatuses(req, res) {
  try {
    const userId = req.user.id;
    
    // Get user's connection
    const connResult = await db.query(
      `SELECT id, phone_number FROM status_bot_connections WHERE user_id = $1`,
      [userId]
    );
    
    if (connResult.rows.length === 0) {
      return res.json({ pendingStatuses: [] });
    }
    
    const connection = connResult.rows[0];
    
    // Get authorized numbers for this connection
    const authResult = await db.query(
      `SELECT phone_number FROM status_bot_authorized_numbers WHERE connection_id = $1 AND is_active = true`,
      [connection.id]
    );
    
    const authorizedPhones = authResult.rows.map(r => r.phone_number);
    
    // Add connected phone to authorized list
    if (connection.phone_number) {
      authorizedPhones.push(connection.phone_number);
    }
    
    if (authorizedPhones.length === 0) {
      return res.json({ pendingStatuses: [] });
    }
    
    // Get pending statuses from conversation states for these phones
    const pendingResult = await db.query(
      `SELECT phone_number, pending_statuses, last_message_at
       FROM cloud_api_conversation_states
       WHERE phone_number = ANY($1)
         AND pending_statuses IS NOT NULL
         AND pending_statuses != '{}'::jsonb`,
      [authorizedPhones]
    );
    
    // Format response
    const allPendingStatuses = [];
    
    for (const row of pendingResult.rows) {
      const pendingStatuses = typeof row.pending_statuses === 'string'
        ? JSON.parse(row.pending_statuses)
        : (row.pending_statuses || {});
      
      for (const [statusId, status] of Object.entries(pendingStatuses)) {
        // Filter out statuses in intermediate states or being processed
        if (status.processingVideo) continue;
        
        allPendingStatuses.push({
          id: statusId,
          phone: row.phone_number,
          type: status.type,
          text: status.text,
          url: status.url,
          caption: status.caption || status.originalCaption,
          backgroundColor: status.backgroundColor,
          videoDuration: status.videoDuration,
          parts: status.parts,
          totalParts: status.totalParts,
          partCaptions: status.partCaptions,
          connectionId: status.connectionId,
          subState: status.subState,
          askSplit: status.askSplit,
          createdAt: status.createdAt,
          lastMessageAt: row.last_message_at
        });
      }
    }
    
    // Sort by creation time, newest first
    allPendingStatuses.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    res.json({ pendingStatuses: allPendingStatuses, connectionId: connection.id });
    
  } catch (error) {
    console.error('[StatusBot] Get pending statuses error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת סטטוסים ממתינים' });
  }
}

/**
 * Send a pending status immediately
 */
async function sendPendingStatus(req, res) {
  try {
    const userId = req.user.id;
    const { statusId } = req.params;
    
    // Get user's connection
    const connResult = await db.query(
      `SELECT id FROM status_bot_connections WHERE user_id = $1`,
      [userId]
    );
    
    if (connResult.rows.length === 0) {
      return res.status(404).json({ error: 'לא נמצא חיבור' });
    }
    
    const connectionId = connResult.rows[0].id;
    
    // Find the pending status
    const stateResult = await db.query(
      `SELECT phone_number, pending_statuses FROM cloud_api_conversation_states
       WHERE pending_statuses ? $1`,
      [statusId]
    );
    
    if (stateResult.rows.length === 0) {
      return res.status(404).json({ error: 'סטטוס לא נמצא' });
    }
    
    const phone = stateResult.rows[0].phone_number;
    const pendingStatuses = typeof stateResult.rows[0].pending_statuses === 'string'
      ? JSON.parse(stateResult.rows[0].pending_statuses)
      : stateResult.rows[0].pending_statuses;
    
    const pendingStatus = pendingStatuses[statusId];
    if (!pendingStatus) {
      return res.status(404).json({ error: 'סטטוס לא נמצא' });
    }
    
    // Add to queue
    if (pendingStatus.type === 'video_split' || (pendingStatus.parts && pendingStatus.parts.length > 0)) {
      // Multiple parts
      const parts = pendingStatus.parts || [];
      const captions = pendingStatus.partCaptions || Array(parts.length).fill('');
      const partGroupId = require('uuid').v4();
      
      for (let i = 0; i < parts.length; i++) {
        await db.query(`
          INSERT INTO status_bot_queue 
          (connection_id, status_type, content, queue_status, source, part_group_id, part_number, total_parts)
          VALUES ($1, 'video', $2, 'pending', 'website', $3, $4, $5)
        `, [connectionId, JSON.stringify({ url: parts[i], caption: captions[i] || '' }), partGroupId, i + 1, parts.length]);
      }
    } else {
      // Single status
      let content = {};
      if (pendingStatus.type === 'text') {
        content = { text: pendingStatus.text, backgroundColor: pendingStatus.backgroundColor };
      } else if (pendingStatus.type === 'image') {
        content = { url: pendingStatus.url, caption: pendingStatus.caption || '' };
      } else if (pendingStatus.type === 'video') {
        content = { url: pendingStatus.url, caption: pendingStatus.caption || '' };
      } else if (pendingStatus.type === 'voice') {
        content = { url: pendingStatus.url, backgroundColor: pendingStatus.backgroundColor };
      }
      
      await db.query(`
        INSERT INTO status_bot_queue 
        (connection_id, status_type, content, queue_status, source)
        VALUES ($1, $2, $3, 'pending', 'website')
      `, [connectionId, pendingStatus.type, JSON.stringify(content)]);
    }
    
    // Remove from pending
    delete pendingStatuses[statusId];
    await db.query(
      `UPDATE cloud_api_conversation_states SET pending_statuses = $1 WHERE phone_number = $2`,
      [JSON.stringify(pendingStatuses), phone]
    );
    
    // Emit socket event
    emitPendingStatusUpdate(userId);
    
    res.json({ success: true, message: 'הסטטוס נוסף לתור' });
    
  } catch (error) {
    console.error('[StatusBot] Send pending status error:', error);
    res.status(500).json({ error: 'שגיאה בשליחת הסטטוס' });
  }
}

/**
 * Schedule a pending status
 */
async function schedulePendingStatus(req, res) {
  try {
    const userId = req.user.id;
    const { statusId } = req.params;
    const { scheduledFor } = req.body; // ISO date string
    
    if (!scheduledFor) {
      return res.status(400).json({ error: 'נדרש תאריך ושעה לתזמון' });
    }
    
    // Get user's connection
    const connResult = await db.query(
      `SELECT id FROM status_bot_connections WHERE user_id = $1`,
      [userId]
    );
    
    if (connResult.rows.length === 0) {
      return res.status(404).json({ error: 'לא נמצא חיבור' });
    }
    
    const connectionId = connResult.rows[0].id;
    
    // Find the pending status
    const stateResult = await db.query(
      `SELECT phone_number, pending_statuses FROM cloud_api_conversation_states
       WHERE pending_statuses ? $1`,
      [statusId]
    );
    
    if (stateResult.rows.length === 0) {
      return res.status(404).json({ error: 'סטטוס לא נמצא' });
    }
    
    const phone = stateResult.rows[0].phone_number;
    const pendingStatuses = typeof stateResult.rows[0].pending_statuses === 'string'
      ? JSON.parse(stateResult.rows[0].pending_statuses)
      : stateResult.rows[0].pending_statuses;
    
    const pendingStatus = pendingStatuses[statusId];
    if (!pendingStatus) {
      return res.status(404).json({ error: 'סטטוס לא נמצא' });
    }
    
    const scheduledTime = new Date(scheduledFor);
    
    // Add to queue as scheduled
    if (pendingStatus.type === 'video_split' || (pendingStatus.parts && pendingStatus.parts.length > 0)) {
      const parts = pendingStatus.parts || [];
      const captions = pendingStatus.partCaptions || Array(parts.length).fill('');
      const partGroupId = require('uuid').v4();
      
      for (let i = 0; i < parts.length; i++) {
        await db.query(`
          INSERT INTO status_bot_queue 
          (connection_id, status_type, content, queue_status, scheduled_for, source, part_group_id, part_number, total_parts)
          VALUES ($1, 'video', $2, 'scheduled', $3, 'website', $4, $5, $6)
        `, [connectionId, JSON.stringify({ url: parts[i], caption: captions[i] || '' }), scheduledTime, partGroupId, i + 1, parts.length]);
      }
    } else {
      let content = {};
      if (pendingStatus.type === 'text') {
        content = { text: pendingStatus.text, backgroundColor: pendingStatus.backgroundColor };
      } else if (pendingStatus.type === 'image') {
        content = { url: pendingStatus.url, caption: pendingStatus.caption || '' };
      } else if (pendingStatus.type === 'video') {
        content = { url: pendingStatus.url, caption: pendingStatus.caption || '' };
      } else if (pendingStatus.type === 'voice') {
        content = { url: pendingStatus.url, backgroundColor: pendingStatus.backgroundColor };
      }
      
      await db.query(`
        INSERT INTO status_bot_queue 
        (connection_id, status_type, content, queue_status, scheduled_for, source)
        VALUES ($1, $2, $3, 'scheduled', $4, 'website')
      `, [connectionId, pendingStatus.type, JSON.stringify(content), scheduledTime]);
    }
    
    // Remove from pending
    delete pendingStatuses[statusId];
    await db.query(
      `UPDATE cloud_api_conversation_states SET pending_statuses = $1 WHERE phone_number = $2`,
      [JSON.stringify(pendingStatuses), phone]
    );
    
    // Emit socket event
    emitPendingStatusUpdate(userId);
    
    res.json({ success: true, message: 'הסטטוס תוזמן בהצלחה' });
    
  } catch (error) {
    console.error('[StatusBot] Schedule pending status error:', error);
    res.status(500).json({ error: 'שגיאה בתזמון הסטטוס' });
  }
}

/**
 * Cancel a pending status
 */
async function cancelPendingStatus(req, res) {
  try {
    const userId = req.user.id;
    const { statusId } = req.params;
    
    // Find the pending status
    const stateResult = await db.query(
      `SELECT phone_number, pending_statuses FROM cloud_api_conversation_states
       WHERE pending_statuses ? $1`,
      [statusId]
    );
    
    if (stateResult.rows.length === 0) {
      return res.status(404).json({ error: 'סטטוס לא נמצא' });
    }
    
    const phone = stateResult.rows[0].phone_number;
    const pendingStatuses = typeof stateResult.rows[0].pending_statuses === 'string'
      ? JSON.parse(stateResult.rows[0].pending_statuses)
      : stateResult.rows[0].pending_statuses;
    
    // Remove from pending
    delete pendingStatuses[statusId];
    await db.query(
      `UPDATE cloud_api_conversation_states SET pending_statuses = $1 WHERE phone_number = $2`,
      [JSON.stringify(pendingStatuses), phone]
    );
    
    // Emit socket event
    emitPendingStatusUpdate(userId);
    
    res.json({ success: true, message: 'הסטטוס בוטל' });
    
  } catch (error) {
    console.error('[StatusBot] Cancel pending status error:', error);
    res.status(500).json({ error: 'שגיאה בביטול הסטטוס' });
  }
}

/**
 * Emit socket event for pending status updates
 */
function emitPendingStatusUpdate(userId) {
  try {
    const socketManager = require('../../services/socket/manager.service').getSocketManager();
    if (socketManager) {
      socketManager.emitToUser(userId, 'statusbot:pending_update', { timestamp: Date.now() });
    }
  } catch (e) {
    // Socket not initialized
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
  
  // Video processing
  analyzeVideo,
  processVideoSplit,
  
  // History
  getStatusHistory,
  getStatusDetails,
  
  // Queue
  getQueueStatus,
  deleteQueueItem,
  sendQueueItemNow,
  updateQueueItem,
  
  // Failed statuses
  getFailedStatuses,
  retryFailedStatus,
  deleteFailedStatus,
  updateAndRetryStatus,
  getInProgressStatuses,
  
  // Pending statuses
  getPendingStatuses,
  sendPendingStatus,
  schedulePendingStatus,
  cancelPendingStatus,
  
  // Admin
  adminGetUsers,
  adminLiftRestriction,
  adminGetStats,
  adminGetActiveProcesses,
  
  // Webhook
  handleWebhook,
};
