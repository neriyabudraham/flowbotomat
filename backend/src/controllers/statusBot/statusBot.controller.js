const db = require('../../config/database');
const wahaSession = require('../../services/waha/session.service');
const { getWahaCredentials, getWahaCredentialsForConnection } = require('../../services/settings/system.service');
const { assignProxy, removeProxy } = require('../../services/proxy/proxy.service');
const crypto = require('crypto');
const botEngine = require('../../services/botEngine.service');

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get the effective restriction end time for a connection.
 * Prefers restriction_until (explicit), falls back to last_connected_at + 24h.
 * Returns a Date if currently restricted, or null if not restricted.
 */
function getEffectiveRestrictionEnd(connection) {
  if (connection.restriction_lifted) return null;
  const now = new Date();
  if (connection.restriction_until) {
    const until = new Date(connection.restriction_until);
    if (until > now) return until;
  }
  const base = connection.last_connected_at || connection.first_connected_at;
  if (base) {
    const end = new Date(new Date(base).getTime() + 24 * 60 * 60 * 1000);
    if (end > now) return end;
  }
  return null;
}

/**
 * Normalize content structure for frontend display
 * Handles various content formats and ensures file.url exists for media types
 */
function normalizeContent(content, statusType) {
  if (!content) return content;
  
  // Parse content if it's a string
  if (typeof content === 'string') {
    try {
      content = JSON.parse(content);
    } catch (e) {
      console.error('[StatusBot] Failed to parse content:', e);
      return content;
    }
  }
  
  // Normalize media content structure
  if (['image', 'video', 'voice'].includes(statusType)) {
    const getMimeType = () => statusType === 'image' ? 'image/jpeg' : 
                              statusType === 'video' ? 'video/mp4' : 'audio/ogg';
    const getFilename = () => `status.${statusType === 'image' ? 'jpg' : 
                                        statusType === 'video' ? 'mp4' : 'ogg'}`;
    
    // If content.file is a string URL, convert to object
    if (typeof content.file === 'string') {
      content.file = {
        url: content.file,
        mimetype: getMimeType(),
        filename: getFilename()
      };
    }
    // If content.file is already an object with url, ensure structure is correct
    else if (content.file && typeof content.file === 'object' && content.file.url) {
      // Already correct format, do nothing
    }
    // If content has url directly but not file
    else if (content.url && !content.file) {
      // content.url might be a string or an object with url property
      let actualUrl = content.url;
      if (typeof content.url === 'object' && content.url.url) {
        actualUrl = content.url.url;
      }
      content.file = {
        url: actualUrl,
        mimetype: getMimeType(),
        filename: getFilename()
      };
    }
  }
  
  return content;
}

/**
 * Normalize a row (status or queue item) content
 */
function normalizeRow(row) {
  if (row && row.content) {
    row.content = normalizeContent(row.content, row.status_type);
  }
  return row;
}

/**
 * Normalize an array of rows
 */
function normalizeRows(rows) {
  return rows.map(normalizeRow);
}

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

    // Add split_video_caption_mode column if not exists (default: 'first' = caption only on first part)
    await db.query(`
      ALTER TABLE status_bot_connections 
      ADD COLUMN IF NOT EXISTS split_video_caption_mode VARCHAR(10) DEFAULT 'first'
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

    // Add proxy_ip column if not exists
    await db.query(`
      ALTER TABLE status_bot_connections ADD COLUMN IF NOT EXISTS proxy_ip VARCHAR(50)
    `).catch(() => {});

    // Create indexes
    await db.query(`CREATE INDEX IF NOT EXISTS idx_status_bot_queue_status ON status_bot_queue(queue_status)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_status_bot_statuses_waha_id ON status_bot_statuses(waha_message_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_status_bot_statuses_conn_sent ON status_bot_statuses(connection_id, COALESCE(sent_at, created_at))`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_status_bot_views_phone_status ON status_bot_views(viewer_phone, status_id)`);
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
      // Check restriction: prefer restriction_until, fall back to last_connected_at + 24h
      const restrictionEnd = getEffectiveRestrictionEnd(connection);
      if (restrictionEnd) {
        isRestricted = true;
        restrictionEndsAt = restrictionEnd;
        restrictionType = 'full';
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

    // Exclude large contacts_cache blob from connection response
    const { contacts_cache, ...connectionData } = connection;
    res.json({
      connection: {
        ...connectionData,
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
    
    // Get WAHA credentials - use existing connection source or fall back to system defaults
    const existingConn = dbConnection.rows[0] || null;
    const { baseUrl, apiKey } = await getWahaCredentialsForConnection(existingConn);

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

    const WEBHOOK_EVENTS = [
      'message', 'message.ack', 'session.status', 'call.received', 'call.accepted', 'call.rejected',
      'label.upsert', 'label.deleted', 'label.chat.added', 'label.chat.deleted',
      'poll.vote.failed', 'poll.vote', 'group.leave', 'group.join', 'group.v2.participants',
      'group.v2.update', 'group.v2.leave', 'group.v2.join', 'presence.update', 'message.reaction',
      'message.any', 'message.ack.group', 'message.waiting', 'message.revoked', 'message.edited',
      'chat.archive', 'event.response', 'event.response.failed',
    ];
    const webhookUrl = `${process.env.APP_URL}/api/webhook/waha/${userId}`;

    // Step 0: Prefer the user's existing main WhatsApp connection - reuse that session + add proxy
    const mainConnResult = await db.query(
      "SELECT * FROM whatsapp_connections WHERE user_id = $1 AND status = 'connected'",
      [userId]
    );

    if (mainConnResult.rows.length > 0) {
      const mainConn = mainConnResult.rows[0];
      console.log(`[StatusBot] ✅ Reusing main WhatsApp session: ${mainConn.session_name}`);

      const { baseUrl, apiKey } = await getWahaCredentialsForConnection(mainConn);

      // Add webhook (shared with bots system)
      try {
        await wahaSession.addWebhook(baseUrl, apiKey, mainConn.session_name, webhookUrl, WEBHOOK_EVENTS);
        console.log(`[StatusBot Webhook] ✅ Configured webhook for user ${userId}`);
      } catch (err) {
        console.error('[StatusBot Webhook] Setup failed:', err.message);
      }

      // Assign proxy to the existing session
      let proxyIp = null;
      if (mainConn.phone_number) {
        try {
          proxyIp = await assignProxy(mainConn.phone_number, { baseUrl, apiKey, sessionName: mainConn.session_name });
          console.log(`[StatusBot] ✅ Proxy assigned: ${proxyIp}`);
        } catch (proxyErr) {
          console.error('[StatusBot] Proxy assignment error:', proxyErr.message);
        }
      }

      // Get restriction time for main-bot users (default 30 min)
      const restrictionMinsResult = await db.query(
        `SELECT value FROM system_settings WHERE key = 'statusbot_restriction_with_main_bot_minutes'`
      );
      const restrictionMins = restrictionMinsResult.rows.length > 0
        ? parseFloat(JSON.parse(restrictionMinsResult.rows[0].value)) || 30
        : 30;
      const newRestrictionUntil = new Date(Date.now() + restrictionMins * 60000);

      // Upsert status_bot_connections referencing the same session
      const existingStatusConn = await db.query(
        'SELECT * FROM status_bot_connections WHERE user_id = $1', [userId]
      );
      let result;
      if (existingStatusConn.rows.length > 0) {
        result = await db.query(`
          UPDATE status_bot_connections
          SET session_name = $2, connection_status = 'connected',
              phone_number = $3, display_name = $4,
              proxy_ip = COALESCE($5, proxy_ip),
              waha_source_id = $6,
              first_connected_at = COALESCE(first_connected_at, NOW()),
              restriction_until = GREATEST(COALESCE(restriction_until, NOW() - interval '1 second'), $7),
              updated_at = NOW()
          WHERE user_id = $1
          RETURNING *
        `, [userId, mainConn.session_name, mainConn.phone_number, mainConn.display_name,
            proxyIp, mainConn.waha_source_id, newRestrictionUntil]);
      } else {
        result = await db.query(`
          INSERT INTO status_bot_connections
          (user_id, session_name, connection_status, phone_number, display_name, proxy_ip, first_connected_at, waha_source_id, restriction_until)
          VALUES ($1, $2, 'connected', $3, $4, $5, NOW(), $6, $7)
          RETURNING *
        `, [userId, mainConn.session_name, mainConn.phone_number, mainConn.display_name,
            proxyIp, mainConn.waha_source_id, newRestrictionUntil]);
      }

      console.log(`[StatusBot] ✅ Saved to DB (reused main session): ${mainConn.session_name}`);
      return res.json({
        success: true,
        connection: result.rows[0],
        existingSession: true,
        usedMainConnection: true,
      });
    }

    // Step 1: No main connection — search ALL WAHA servers for existing session by email
    const { pickSourceForNewSession, getAllSourceCredentials } = require('../../services/waha/sources.service');

    let sessionName = null;
    let wahaStatus = null;
    let existingSession = null;
    let foundBaseUrl = null;
    let foundApiKey = null;
    let foundSourceId = null;

    console.log(`[StatusBot] No main connection, searching ALL WAHA servers for session with email: ${userEmail}`);
    const webhookPattern = `/api/webhook/waha/${userId}`;

    try {
      const allSources = await getAllSourceCredentials();
      for (const src of allSources) {
        try {
          const session = await wahaSession.findSessionByEmailWithWebhookPriority(src.baseUrl, src.apiKey, userEmail, webhookPattern);
          if (session) {
            existingSession = session;
            foundBaseUrl = src.baseUrl;
            foundApiKey = src.apiKey;
            foundSourceId = src.id;
            sessionName = session.name;
            console.log(`[StatusBot] ✅ Found existing session by email on source ${src.id}: ${sessionName}`);
            break;
          }
        } catch (err) {
          console.log(`[StatusBot] Source ${src.id} unreachable: ${err.message}`);
        }
      }

      if (existingSession && foundBaseUrl) {
        wahaStatus = await wahaSession.getSessionStatus(foundBaseUrl, foundApiKey, sessionName);

        if (wahaStatus && (wahaStatus.status === 'STOPPED' || wahaStatus.status === 'FAILED')) {
          console.log(`[StatusBot] Session is ${wahaStatus.status}, restarting...`);
          try {
            await wahaSession.stopSession(foundBaseUrl, foundApiKey, sessionName);
          } catch (e) { /* ignore */ }
          await wahaSession.startSession(foundBaseUrl, foundApiKey, sessionName);
          console.log(`[StatusBot] ✅ Restarted session: ${sessionName}`);
          wahaStatus = await wahaSession.getSessionStatus(foundBaseUrl, foundApiKey, sessionName);
        } else {
          console.log(`[StatusBot] Session status: ${wahaStatus?.status}`);
        }
      }
    } catch (err) {
      console.log(`[StatusBot] Error searching sessions: ${err.message}`);
    }

    // Pick a source for new session creation (fallback)
    if (!foundBaseUrl) {
      const wahaSource = await pickSourceForNewSession();
      foundBaseUrl = wahaSource?.baseUrl || process.env.WAHA_BASE_URL;
      foundApiKey = wahaSource?.apiKey || process.env.WAHA_API_KEY;
      foundSourceId = wahaSource?.id || null;
    }

    const baseUrl = foundBaseUrl;
    const apiKey = foundApiKey;

    if (!baseUrl || !apiKey) {
      return res.status(500).json({ error: 'WAHA לא מוגדר במערכת' });
    }

    // Step 2: If no session found on ANY server, create new one
    if (!sessionName) {
      sessionName = `session_${crypto.randomBytes(4).toString('hex')}`;
      const sessionMetadata = { 'user.email': userEmail };
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

    let phoneNumber = null;
    let displayName = null;
    let firstConnectedAt = null;

    if (ourStatus === 'connected' && wahaStatus?.me) {
      phoneNumber = wahaStatus.me.id?.split('@')[0] || null;
      displayName = wahaStatus.me.pushName || null;
      firstConnectedAt = new Date();
    }

    try {
      await wahaSession.addWebhook(baseUrl, apiKey, sessionName, webhookUrl, WEBHOOK_EVENTS);
      console.log(`[StatusBot Webhook] ✅ Configured main webhook for user ${userId}`);
    } catch (err) {
      console.error('[StatusBot Webhook] Setup failed:', err.message);
    }

    const existingConn = await db.query(
      'SELECT * FROM status_bot_connections WHERE user_id = $1',
      [userId]
    );

    let result;
    if (existingConn.rows.length > 0) {
      console.log(`[StatusBot] Updating existing connection record`);
      result = await db.query(`
        UPDATE status_bot_connections
        SET session_name = $2,
            connection_status = $3,
            phone_number = COALESCE($4, phone_number),
            display_name = COALESCE($5, display_name),
            waha_source_id = COALESCE($6, waha_source_id),
            updated_at = NOW()
        WHERE user_id = $1
        RETURNING *
      `, [userId, sessionName, ourStatus, phoneNumber, displayName, foundSourceId]);
    } else {
      console.log(`[StatusBot] Creating new connection record`);
      result = await db.query(`
        INSERT INTO status_bot_connections
        (user_id, session_name, connection_status, phone_number, display_name, first_connected_at, waha_source_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [userId, sessionName, ourStatus, phoneNumber, displayName,
          ourStatus === 'connected' ? firstConnectedAt : null, foundSourceId]);
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

    let { baseUrl, apiKey } = await getWahaCredentialsForConnection(connection);

    // First check if session exists on the known server
    let sessionStatus = await wahaSession.getSessionStatus(baseUrl, apiKey, connection.session_name);

    if (!sessionStatus) {
      // Session not found on known server — search ALL servers before giving up
      console.log(`[StatusBot] Session ${connection.session_name} not found on known server, searching all WAHA servers...`);
      const { healWahaConnectionByEmail } = require('../../services/waha/heal.service');
      const userRes = await db.query('SELECT email FROM users WHERE id = $1', [userId]);
      const email = userRes.rows[0]?.email;

      if (email) {
        const healed = await healWahaConnectionByEmail(email);
        if (healed) {
          console.log(`[StatusBot] ✅ Found session on another server: ${healed.sessionName}`);
          // Update status_bot_connections with the correct server
          const srcRes = await db.query('SELECT id FROM waha_sources WHERE base_url = $1 LIMIT 1', [healed.baseUrl]);
          const sourceId = srcRes.rows[0]?.id;
          await db.query(
            `UPDATE status_bot_connections SET session_name = $1, waha_source_id = $2, waha_base_url = $3, updated_at = NOW() WHERE id = $4`,
            [healed.sessionName, sourceId, healed.baseUrl, connection.id]
          );
          baseUrl = healed.baseUrl;
          apiKey = healed.apiKey;
          connection.session_name = healed.sessionName;
          sessionStatus = await wahaSession.getSessionStatus(baseUrl, apiKey, healed.sessionName);
        }
      }

      if (!sessionStatus) {
        // Truly not found on any server - clean up stale DB record
        console.log(`[StatusBot] Session ${connection.session_name} not found on ANY WAHA server, cleaning up DB`);
        await db.query('DELETE FROM status_bot_connections WHERE id = $1', [connection.id]);
        return res.json({ status: 'need_connect' });
      }
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

      // Assign proxy if not already assigned
      if (phoneNumber && !connection.proxy_ip) {
        try {
          const proxyIp = await assignProxy(phoneNumber, { baseUrl, apiKey, sessionName: connection.session_name });
          if (proxyIp) {
            await db.query(`UPDATE status_bot_connections SET proxy_ip = $1 WHERE id = $2`, [proxyIp, connection.id]);
          }
        } catch (proxyErr) {
          console.error('[StatusBot] Proxy assignment error:', proxyErr.message);
        }
      }

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
    const { baseUrl, apiKey } = await getWahaCredentialsForConnection(connection);

    // Only stop the WAHA session if it's not shared with the main WhatsApp connection
    const mainConnCheck = await db.query(
      "SELECT id FROM whatsapp_connections WHERE user_id = $1 AND session_name = $2",
      [userId, connection.session_name]
    );
    if (mainConnCheck.rows.length === 0) {
      // Session belongs only to status bot - stop it
      try {
        await wahaSession.stopSession(baseUrl, apiKey, connection.session_name);
      } catch (e) {
        console.error('[StatusBot] Stop session error:', e.message);
      }
    } else {
      console.log(`[StatusBot] Session ${connection.session_name} is shared with main connection - skipping stop`);
    }

    // Remove proxy assignment before clearing phone_number (also clears WAHA session proxy)
    if (connection.phone_number) {
      try {
        await removeProxy(connection.phone_number, { baseUrl, apiKey, sessionName: connection.session_name });
      } catch (proxyErr) {
        console.error('[StatusBot] Proxy removal error:', proxyErr.message);
      }
    }

    // Update DB
    await db.query(`
      UPDATE status_bot_connections
      SET connection_status = 'disconnected', phone_number = NULL, display_name = NULL, proxy_ip = NULL, updated_at = NOW()
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

  // Check restriction: prefer restriction_until, fall back to last_connected_at + 24h
  const restrictionEnd = getEffectiveRestrictionEnd(connection);
  if (restrictionEnd) {
    const msLeft = restrictionEnd - new Date();
    const hoursLeft = Math.ceil(msLeft / (1000 * 60 * 60));
    const minutesLeft = Math.ceil(msLeft / (1000 * 60)) % 60;
    return {
      canUpload: false,
      reason: hoursLeft >= 1
        ? `יש להמתין ${hoursLeft} שעות ו-${minutesLeft} דקות לאחר החיבור`
        : `יש להמתין עוד ${Math.ceil(msLeft / 60000)} דקות לאחר החיבור`,
      restrictionEndsAt: restrictionEnd,
      isRestricted: true
    };
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
    if (sub.status === 'active') {
      return { canUpload: true }; // active subscription always allowed
    }

    if (sub.status === 'trial') {
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
      const { baseUrl, apiKey } = await getWahaCredentialsForConnection(connection);

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

    // Get statuses with queue status + new viewer count (optimized with CTE)
    const connectionId = connResult.rows[0].id;
    const result = await db.query(`
      WITH first_views AS (
        SELECT DISTINCT ON (v.viewer_phone) v.viewer_phone, v.status_id AS first_status_id
        FROM status_bot_views v
        JOIN status_bot_statuses s ON s.id = v.status_id
        WHERE s.connection_id = $1
        ORDER BY v.viewer_phone, COALESCE(s.sent_at, s.created_at) ASC
      ),
      new_counts AS (
        SELECT fv.first_status_id AS status_id, COUNT(*) AS new_viewer_count
        FROM first_views fv
        GROUP BY fv.first_status_id
      )
      SELECT
        s.*,
        s.deleted_at IS NOT NULL as is_deleted,
        q.queue_status,
        COALESCE(nc.new_viewer_count, 0) as new_viewer_count
      FROM status_bot_statuses s
      LEFT JOIN status_bot_queue q ON q.id = s.queue_id
      LEFT JOIN new_counts nc ON nc.status_id = s.id
      WHERE s.connection_id = $1
        AND NOT (s.uncertain_upload = true AND s.view_count = 0)
      ORDER BY COALESCE(s.sent_at, s.created_at) DESC
      LIMIT $2 OFFSET $3
    `, [connectionId, limit, offset]);

    res.json({ 
      statuses: normalizeRows(result.rows),
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

    const connectionId = connResult.rows[0].id;

    // Pre-compute each viewer's first status for this connection (one query, reused for count + per-viewer flag)
    const [statusResult, firstViewsResult] = await Promise.all([
      db.query(`SELECT * FROM status_bot_statuses WHERE id = $1 AND connection_id = $2`, [statusId, connectionId]),
      db.query(`
        SELECT DISTINCT ON (v.viewer_phone) v.viewer_phone, v.status_id AS first_status_id
        FROM status_bot_views v
        JOIN status_bot_statuses s ON s.id = v.status_id
        WHERE s.connection_id = $1
        ORDER BY v.viewer_phone, COALESCE(s.sent_at, s.created_at) ASC
      `, [connectionId]),
    ]);

    if (statusResult.rows.length === 0) {
      return res.status(404).json({ error: 'סטטוס לא נמצא' });
    }

    // Build a set of phones whose first-ever view is this status
    const firstViewPhones = new Set();
    for (const row of firstViewsResult.rows) {
      if (row.first_status_id === parseInt(statusId)) {
        firstViewPhones.add(row.viewer_phone);
      }
    }
    statusResult.rows[0].new_viewer_count = firstViewPhones.size;

    const viewsResult = await db.query(`
      SELECT * FROM status_bot_views WHERE status_id = $1 ORDER BY viewed_at DESC
    `, [statusId]);
    // Mark each view with is_new_viewer flag
    for (const view of viewsResult.rows) {
      view.is_new_viewer = firstViewPhones.has(view.viewer_phone);
    }

    const reactionsResult = await db.query(`
      SELECT * FROM status_bot_reactions WHERE status_id = $1 ORDER BY reacted_at DESC
    `, [statusId]);

    const repliesResult = await db.query(`
      SELECT * FROM status_bot_replies WHERE status_id = $1 ORDER BY replied_at DESC
    `, [statusId]);

    // Per-contact send log (contacts format only — empty for default format)
    const contactSendsResult = await db.query(`
      SELECT phone, batch_number, success, error_message, sent_at
      FROM status_bot_contact_sends
      WHERE history_id = $1
      ORDER BY batch_number ASC, sent_at ASC
    `, [statusId]).catch(() => ({ rows: [] }));

    // Normalize status content for frontend
    const status = normalizeRow(statusResult.rows[0]);

    res.json({
      status: status,
      views: viewsResult.rows,
      reactions: reactionsResult.rows,
      replies: repliesResult.rows,
      contactSends: contactSendsResult.rows,
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

    // Get user's queue items: immediate items + scheduled items whose time has arrived
    const userQueue = await db.query(`
      SELECT * FROM status_bot_queue
      WHERE connection_id = $1
        AND queue_status IN ('pending', 'processing')
        AND (scheduled_for IS NULL OR scheduled_for <= NOW())
      ORDER BY COALESCE(scheduled_for, created_at) ASC
    `, [connResult.rows[0].id]);

    // Get user's future scheduled items only (time not yet arrived)
    const scheduledQueue = await db.query(`
      SELECT * FROM status_bot_queue
      WHERE connection_id = $1
        AND queue_status IN ('pending', 'scheduled')
        AND scheduled_for IS NOT NULL
        AND scheduled_for > NOW()
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
      queue: normalizeRows(userQueue.rows),
      scheduled: normalizeRows(scheduledQueue.rows),
      globalPending: parseInt(globalQueue.rows[0].count),
      lastSentAt: lockResult.rows[0]?.last_sent_at
    });

  } catch (error) {
    console.error('[StatusBot] Get queue status error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת תור' });
  }
}

/**
 * Delete/cancel a queue item (including stuck processing items)
 */
async function deleteQueueItem(req, res) {
  try {
    const userId = req.user.id;
    const { queueId } = req.params;
    const { force } = req.query; // Allow force cancel for stuck items

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

    // For processing items, check if stuck (more than 3 minutes) or force flag
    if (queueItem.queue_status === 'processing') {
      const processingTime = queueItem.processing_started_at 
        ? Date.now() - new Date(queueItem.processing_started_at).getTime()
        : 0;
      const isStuck = processingTime > 180000; // 3 minutes
      
      if (!isStuck && force !== 'true') {
        return res.status(400).json({ 
          error: 'הפריט בתהליך שליחה. אם הוא תקוע, נסה שוב עם force=true',
          processingTime: Math.round(processingTime / 1000)
        });
      }
      
      // Reset queue lock if this item was processing
      await db.query(`
        UPDATE status_bot_queue_lock 
        SET is_processing = false, processing_started_at = NULL
        WHERE id = 1
      `);
    }
    
    // Allow cancelling pending, scheduled, or stuck processing items
    if (!['pending', 'scheduled', 'processing'].includes(queueItem.queue_status)) {
      return res.status(400).json({ error: 'לא ניתן לבטל פריט שכבר נשלח' });
    }

    // Update status to cancelled
    await db.query(`
      UPDATE status_bot_queue 
      SET queue_status = 'cancelled', error_message = $1
      WHERE id = $2
    `, [queueItem.queue_status === 'processing' ? 'בוטל ידנית - תקוע' : null, queueId]);

    res.json({ success: true, message: 'הפריט בוטל בהצלחה' });

  } catch (error) {
    console.error('[StatusBot] Delete queue item error:', error);
    res.status(500).json({ error: 'שגיאה בביטול הפריט' });
  }
}

/**
 * Force cancel a stuck processing item
 */
async function forceCancelProcessing(req, res) {
  try {
    const userId = req.user.id;
    const { queueId } = req.params;

    // Verify the queue item belongs to the user
    const result = await db.query(`
      SELECT q.* FROM status_bot_queue q
      JOIN status_bot_connections c ON c.id = q.connection_id
      WHERE q.id = $1 AND c.user_id = $2 AND q.queue_status = 'processing'
    `, [queueId, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'לא נמצא פריט בעיבוד' });
    }

    // Signal the in-memory processing loop to stop this item
    const { forceStopItem } = require('../../services/statusBot/queue.service');
    forceStopItem(parseInt(queueId));

    // Reset queue lock
    await db.query(`
      UPDATE status_bot_queue_lock
      SET is_processing = false, processing_started_at = NULL
      WHERE id = 1
    `);

    // Mark as failed
    await db.query(`
      UPDATE status_bot_queue
      SET queue_status = 'failed', error_message = 'בוטל ידנית - תקוע'
      WHERE id = $1
    `, [queueId]);

    res.json({ success: true, message: 'התהליך התקוע בוטל' });

  } catch (error) {
    console.error('[StatusBot] Force cancel processing error:', error);
    res.status(500).json({ error: 'שגיאה בביטול התהליך' });
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

    res.json({ failedStatuses: normalizeRows(result.rows) });

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
      SET queue_status = 'pending', error_message = NULL, retry_count = 0
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

    // Get pending and processing items (including scheduled ones whose time has arrived)
    const result = await db.query(`
      SELECT id, status_type, content, queue_status, created_at, scheduled_for, contacts_sent, contacts_total
      FROM status_bot_queue
      WHERE connection_id = $1
        AND queue_status IN ('pending', 'processing')
        AND (scheduled_for IS NULL OR scheduled_for <= NOW())
      ORDER BY COALESCE(scheduled_for, created_at) ASC
    `, [connResult.rows[0].id]);

    res.json({ inProgress: normalizeRows(result.rows) });

  } catch (error) {
    console.error('[StatusBot] Get in-progress statuses error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת סטטוסים בתהליך' });
  }
}

// ============================================
// ADMIN ENDPOINTS
// ============================================

/**
 * Get all status bot users (admin) - comprehensive stats
 */
async function adminGetUsers(req, res) {
  try {
    const result = await db.query(`
      SELECT 
        sbc.*,
        u.email, u.name as user_name,
        -- Total statuses ever sent
        (SELECT COUNT(*) FROM status_bot_statuses WHERE connection_id = sbc.id) as total_statuses,
        -- Statuses sent today
        (SELECT COUNT(*) FROM status_bot_statuses WHERE connection_id = sbc.id AND sent_at > NOW() - INTERVAL '24 hours') as statuses_today,
        -- Authorized numbers
        (SELECT COUNT(*) FROM status_bot_authorized_numbers WHERE connection_id = sbc.id AND is_active = true) as authorized_count,
        -- Queue stats
        (SELECT COUNT(*) FROM status_bot_queue WHERE connection_id = sbc.id AND queue_status = 'pending') as pending_count,
        (SELECT COUNT(*) FROM status_bot_queue WHERE connection_id = sbc.id AND queue_status = 'processing') as processing_count,
        (SELECT COUNT(*) FROM status_bot_queue WHERE connection_id = sbc.id AND queue_status = 'failed') as failed_count,
        (SELECT COUNT(*) FROM status_bot_queue WHERE connection_id = sbc.id AND queue_status = 'scheduled') as scheduled_count,
        -- Engagement stats (last 24h)
        (SELECT COALESCE(SUM(view_count), 0) FROM status_bot_statuses WHERE connection_id = sbc.id AND sent_at > NOW() - INTERVAL '24 hours') as views_today,
        (SELECT COALESCE(SUM(reaction_count), 0) FROM status_bot_statuses WHERE connection_id = sbc.id AND sent_at > NOW() - INTERVAL '24 hours') as reactions_today,
        (SELECT COALESCE(SUM(reply_count), 0) FROM status_bot_statuses WHERE connection_id = sbc.id AND sent_at > NOW() - INTERVAL '24 hours') as replies_today,
        -- Last activity
        (SELECT MAX(sent_at) FROM status_bot_statuses WHERE connection_id = sbc.id) as last_status_sent,
        -- Error messages (get last 5)
        (SELECT json_agg(errors ORDER BY created_at DESC) FROM (
          SELECT id, error_message, status_type, created_at, content 
          FROM status_bot_queue 
          WHERE connection_id = sbc.id AND queue_status = 'failed' 
          ORDER BY created_at DESC LIMIT 5
        ) errors) as recent_errors
      FROM status_bot_connections sbc
      JOIN users u ON u.id = sbc.user_id
      ORDER BY sbc.last_connected_at DESC NULLS LAST, sbc.created_at DESC
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
 * Get status bot stats (admin) - comprehensive global stats
 */
async function adminGetStats(req, res) {
  try {
    const stats = {};

    // Total connections with more details
    const connResult = await db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE connection_status = 'connected') as connected,
        COUNT(*) FILTER (WHERE connection_status = 'disconnected') as disconnected,
        COUNT(*) FILTER (WHERE connection_status = 'qr_pending') as qr_pending,
        COUNT(*) FILTER (WHERE restriction_lifted = false AND first_connected_at IS NOT NULL 
          AND first_connected_at > NOW() - INTERVAL '24 hours') as restricted_24h,
        COUNT(*) FILTER (WHERE short_restriction_until IS NOT NULL 
          AND short_restriction_until > NOW()) as restricted_30min
      FROM status_bot_connections
    `);
    stats.connections = connResult.rows[0];

    // Statuses stats
    const statusResult = await db.query(`
      SELECT 
        COUNT(*) as total_ever,
        COUNT(*) FILTER (WHERE sent_at > NOW() - INTERVAL '24 hours') as today,
        COUNT(*) FILTER (WHERE sent_at > NOW() - INTERVAL '1 hour') as last_hour,
        COALESCE(SUM(view_count) FILTER (WHERE sent_at > NOW() - INTERVAL '24 hours'), 0) as views_today,
        COALESCE(SUM(reaction_count) FILTER (WHERE sent_at > NOW() - INTERVAL '24 hours'), 0) as reactions_today,
        COALESCE(SUM(reply_count) FILTER (WHERE sent_at > NOW() - INTERVAL '24 hours'), 0) as replies_today
      FROM status_bot_statuses
    `);
    stats.statuses = statusResult.rows[0];
    stats.statusesToday = parseInt(statusResult.rows[0].today); // backward compat

    // Queue status with more details
    const queueResult = await db.query(`
      SELECT 
        COUNT(*) FILTER (WHERE queue_status = 'pending') as pending,
        COUNT(*) FILTER (WHERE queue_status = 'processing') as processing,
        COUNT(*) FILTER (WHERE queue_status = 'failed') as failed,
        COUNT(*) FILTER (WHERE queue_status = 'scheduled') as scheduled,
        COUNT(*) FILTER (WHERE queue_status = 'sent' AND sent_at > NOW() - INTERVAL '24 hours') as sent_today,
        COUNT(*) FILTER (WHERE queue_status = 'failed' AND created_at > NOW() - INTERVAL '24 hours') as failed_today
      FROM status_bot_queue
    `);
    stats.queue = queueResult.rows[0];

    // Top users today
    const topUsersResult = await db.query(`
      SELECT 
        sbc.display_name,
        sbc.phone_number,
        u.name as user_name,
        u.email,
        COUNT(*) as status_count
      FROM status_bot_statuses sbs
      JOIN status_bot_connections sbc ON sbc.id = sbs.connection_id
      JOIN users u ON u.id = sbc.user_id
      WHERE sbs.sent_at > NOW() - INTERVAL '24 hours'
      GROUP BY sbc.id, sbc.display_name, sbc.phone_number, u.name, u.email
      ORDER BY status_count DESC
      LIMIT 5
    `);
    stats.topUsersToday = topUsersResult.rows;

    // Hourly distribution (last 24h)
    const hourlyResult = await db.query(`
      SELECT 
        date_trunc('hour', sent_at) as hour,
        COUNT(*) as count
      FROM status_bot_statuses
      WHERE sent_at > NOW() - INTERVAL '24 hours'
      GROUP BY date_trunc('hour', sent_at)
      ORDER BY hour
    `);
    stats.hourlyDistribution = hourlyResult.rows;

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
    
    // Get ALL users who sent a message in the last 10 minutes (regardless of state)
    // Use subquery to find sender name from authorized numbers by matching phone (last 9 digits)
    const recentMessagesResult = await db.query(`
      SELECT 
        c.phone_number,
        c.state,
        c.last_message_at,
        c.connection_id,
        conn.display_name as bot_display_name,
        conn.phone_number as bot_phone,
        u.name as owner_name,
        u.email as owner_email,
        (
          SELECT an.name 
          FROM status_bot_authorized_numbers an
          WHERE an.is_active = true
            AND RIGHT(REGEXP_REPLACE(an.phone_number, '[^0-9]', '', 'g'), 9) = RIGHT(REGEXP_REPLACE(c.phone_number, '[^0-9]', '', 'g'), 9)
          LIMIT 1
        ) as sender_name
      FROM cloud_api_conversation_states c
      LEFT JOIN status_bot_connections conn ON conn.id = c.connection_id
      LEFT JOIN users u ON conn.user_id = u.id
      WHERE c.last_message_at > NOW() - INTERVAL '10 minutes'
      ORDER BY c.last_message_at DESC
    `);

    // Get currently processing queue items with linked status engagement data
    const processingResult = await db.query(`
      SELECT
        q.id,
        q.status_type,
        q.content,
        q.processing_started_at,
        q.created_at,
        q.source,
        q.source_phone,
        q.part_number,
        q.total_parts,
        q.contacts_sent,
        q.contacts_total,
        conn.display_name,
        conn.phone_number as bot_phone,
        u.name as user_name,
        u.email as user_email,
        s.view_count,
        s.reaction_count,
        s.reply_count
      FROM status_bot_queue q
      JOIN status_bot_connections conn ON conn.id = q.connection_id
      JOIN users u ON conn.user_id = u.id
      LEFT JOIN status_bot_statuses s ON s.queue_id = q.id
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

    // Get pending queue items (next 20)
    const pendingQueueResult = await db.query(`
      SELECT 
        q.id,
        q.status_type,
        q.created_at,
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
      WHERE q.queue_status = 'pending'
      ORDER BY q.created_at ASC
      LIMIT 20
    `);

    // Get scheduled statuses
    const scheduledResult = await db.query(`
      SELECT 
        q.id,
        q.status_type,
        q.scheduled_for,
        q.created_at,
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
      WHERE q.queue_status = 'scheduled'
        AND q.scheduled_for > NOW()
      ORDER BY q.scheduled_for ASC
      LIMIT 20
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
      recentMessages: recentMessagesResult.rows.map(c => ({
        phone: c.phone_number,
        state: c.state,
        lastMessageAt: c.last_message_at,
        botPhone: c.bot_phone,
        botDisplayName: c.bot_display_name,
        senderName: c.sender_name,
        ownerName: c.owner_name,
        ownerEmail: c.owner_email
      })),
      processingUploads: processingResult.rows.map(p => ({
        id: p.id,
        statusType: p.status_type,
        content: p.content,
        startedAt: p.processing_started_at,
        createdAt: p.created_at,
        source: p.source,
        sourcePhone: p.source_phone,
        partNumber: p.part_number,
        totalParts: p.total_parts,
        contactsSent: p.contacts_sent || 0,
        contactsTotal: p.contacts_total || 0,
        displayName: p.display_name,
        botPhone: p.bot_phone,
        userName: p.user_name,
        userEmail: p.user_email,
        viewCount: p.view_count || 0,
        reactionCount: p.reaction_count || 0,
        replyCount: p.reply_count || 0
      })),
      queueLock: lockResult.rows[0] || null,
      pendingCount: parseInt(pendingResult.rows[0].count),
      pendingQueue: pendingQueueResult.rows.map(p => ({
        id: p.id,
        statusType: p.status_type,
        createdAt: p.created_at,
        source: p.source,
        sourcePhone: p.source_phone,
        partNumber: p.part_number,
        totalParts: p.total_parts,
        displayName: p.display_name,
        botPhone: p.bot_phone,
        userName: p.user_name,
        userEmail: p.user_email
      })),
      scheduledStatuses: scheduledResult.rows.map(s => ({
        id: s.id,
        statusType: s.status_type,
        scheduledFor: s.scheduled_for,
        createdAt: s.created_at,
        source: s.source,
        sourcePhone: s.source_phone,
        partNumber: s.part_number,
        totalParts: s.total_parts,
        displayName: s.display_name,
        botPhone: s.bot_phone,
        userName: s.user_name,
        userEmail: s.user_email
      }))
    });

  } catch (error) {
    console.error('[StatusBot Admin] Get active processes error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת תהליכים פעילים' });
  }
}

/**
 * Admin: Force reset queue lock and cancel stuck processing items
 */
async function adminResetQueueLock(req, res) {
  try {
    // Get any currently processing items
    const processingResult = await db.query(`
      SELECT id FROM status_bot_queue WHERE queue_status = 'processing'
    `);

    // Mark all processing items as failed
    if (processingResult.rows.length > 0) {
      await db.query(`
        UPDATE status_bot_queue 
        SET queue_status = 'failed', error_message = 'בוטל ע"י מנהל - איפוס תור'
        WHERE queue_status = 'processing'
      `);
    }

    // Reset the queue lock
    await db.query(`
      UPDATE status_bot_queue_lock 
      SET is_processing = false, processing_started_at = NULL
      WHERE id = 1
    `);

    res.json({ 
      success: true, 
      message: `התור אופס. ${processingResult.rows.length} פריטים בעיבוד בוטלו.`,
      cancelledCount: processingResult.rows.length
    });

  } catch (error) {
    console.error('[StatusBot Admin] Reset queue lock error:', error);
    res.status(500).json({ error: 'שגיאה באיפוס התור' });
  }
}

/**
 * Admin: Force cancel a specific stuck processing item
 */
async function adminForceCancelItem(req, res) {
  try {
    const { queueId } = req.params;

    const result = await db.query(`
      SELECT * FROM status_bot_queue WHERE id = $1
    `, [queueId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'פריט לא נמצא' });
    }

    const item = result.rows[0];

    if (item.queue_status === 'processing') {
      // Reset queue lock
      await db.query(`
        UPDATE status_bot_queue_lock
        SET is_processing = false, processing_started_at = NULL
        WHERE id = 1
      `);
    }

    // Mark as failed
    await db.query(`
      UPDATE status_bot_queue
      SET queue_status = 'failed', error_message = 'בוטל ע"י מנהל'
      WHERE id = $1
    `, [queueId]);

    res.json({ success: true, message: 'הפריט בוטל בהצלחה' });

  } catch (error) {
    console.error('[StatusBot Admin] Force cancel item error:', error);
    res.status(500).json({ error: 'שגיאה בביטול הפריט' });
  }
}

/**
 * Admin: force-stop a processing item — ends sending immediately,
 * marks as sent with whatever was already sent (partial).
 */
async function adminForceStopItem(req, res) {
  try {
    const { queueId } = req.params;

    const result = await db.query(
      `SELECT id, queue_status FROM status_bot_queue WHERE id = $1`,
      [queueId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'פריט לא נמצא' });
    }

    if (result.rows[0].queue_status !== 'processing') {
      return res.status(400).json({ error: 'הפריט לא בתהליך עיבוד' });
    }

    // Signal the queue processor to stop this item gracefully
    const { forceStopItem } = require('../../services/statusBot/queue.service');
    forceStopItem(queueId);

    res.json({ success: true, message: 'נשלח אות עצירה — התהליך ייעצר בסיום הבאץ\' הנוכחי' });

  } catch (error) {
    console.error('[StatusBot Admin] Force stop item error:', error);
    res.status(500).json({ error: 'שגיאה בעצירת התהליך' });
  }
}

/**
 * Admin: Get all errors/failures for a specific connection
 */
async function adminGetUserErrors(req, res) {
  try {
    const { connectionId } = req.params;

    const result = await db.query(`
      SELECT 
        q.id,
        q.status_type,
        q.content,
        q.error_message,
        q.created_at,
        q.source,
        q.source_phone,
        q.part_number,
        q.total_parts
      FROM status_bot_queue q
      WHERE q.connection_id = $1 AND q.queue_status = 'failed'
      ORDER BY q.created_at DESC
      LIMIT 50
    `, [connectionId]);

    res.json({ errors: result.rows });

  } catch (error) {
    console.error('[StatusBot Admin] Get user errors:', error);
    res.status(500).json({ error: 'שגיאה בטעינת שגיאות' });
  }
}

/**
 * Admin: Get detailed stats for a specific connection
 */
async function adminGetUserDetails(req, res) {
  try {
    const { connectionId } = req.params;

    // Get connection info
    const connResult = await db.query(`
      SELECT 
        sbc.*,
        u.email, u.name as user_name
      FROM status_bot_connections sbc
      JOIN users u ON u.id = sbc.user_id
      WHERE sbc.id = $1
    `, [connectionId]);

    if (connResult.rows.length === 0) {
      return res.status(404).json({ error: 'חיבור לא נמצא' });
    }

    const connection = connResult.rows[0];

    // Get recent statuses
    const statusesResult = await db.query(`
      SELECT 
        id, queue_id, status_type, content, sent_at, created_at,
        view_count, reaction_count, reply_count, waha_message_id
      FROM status_bot_statuses
      WHERE connection_id = $1
      ORDER BY created_at DESC
      LIMIT 30
    `, [connectionId]);

    // Get queue items
    const queueResult = await db.query(`
      SELECT
        id, status_type, content, queue_status, error_message,
        created_at, processing_started_at, sent_at, scheduled_for,
        source, source_phone, part_number, total_parts,
        contacts_sent, contacts_total
      FROM status_bot_queue
      WHERE connection_id = $1
      ORDER BY created_at DESC
      LIMIT 30
    `, [connectionId]);

    // Get authorized numbers
    const numbersResult = await db.query(`
      SELECT phone_number, name, is_active, created_at
      FROM status_bot_authorized_numbers
      WHERE connection_id = $1
      ORDER BY created_at DESC
    `, [connectionId]);

    // Get activity log (recent conversations)
    const activityResult = await db.query(`
      SELECT phone_number, state, last_message_at
      FROM cloud_api_conversation_states
      WHERE connection_id = $1
      ORDER BY last_message_at DESC
      LIMIT 10
    `, [connectionId]);

    res.json({
      connection,
      recentStatuses: statusesResult.rows,
      queueItems: queueResult.rows,
      authorizedNumbers: numbersResult.rows,
      recentActivity: activityResult.rows
    });

  } catch (error) {
    console.error('[StatusBot Admin] Get user details:', error);
    res.status(500).json({ error: 'שגיאה בטעינת פרטי משתמש' });
  }
}

/**
 * Admin: Get status details (views/reactions/replies) by status ID
 */
async function adminGetStatusDetails(req, res) {
  try {
    const { statusId } = req.params;
    const statusResult = await db.query(`SELECT * FROM status_bot_statuses WHERE id = $1`, [statusId]);
    if (statusResult.rows.length === 0) return res.status(404).json({ error: 'סטטוס לא נמצא' });

    const [viewsRes, reactionsRes, repliesRes] = await Promise.all([
      db.query(`SELECT * FROM status_bot_views WHERE status_id = $1 ORDER BY viewed_at DESC`, [statusId]),
      db.query(`SELECT * FROM status_bot_reactions WHERE status_id = $1 ORDER BY reacted_at DESC`, [statusId]),
      db.query(`SELECT * FROM status_bot_replies WHERE status_id = $1 ORDER BY replied_at DESC`, [statusId]),
    ]);

    const status = normalizeRow(statusResult.rows[0]);
    res.json({ status, views: viewsRes.rows, reactions: reactionsRes.rows, replies: repliesRes.rows });
  } catch (error) {
    console.error('[StatusBot Admin] Get status details:', error);
    res.status(500).json({ error: 'שגיאה בטעינת פרטי סטטוס' });
  }
}

/**
 * Admin: Get queue item details (content + linked status engagement data)
 */
async function adminGetQueueItemDetails(req, res) {
  try {
    const { queueId } = req.params;
    const queueResult = await db.query(`SELECT * FROM status_bot_queue WHERE id = $1`, [queueId]);
    if (queueResult.rows.length === 0) return res.status(404).json({ error: 'פריט לא נמצא' });

    const queueItem = queueResult.rows[0];
    // Parse content if it's a string
    if (typeof queueItem.content === 'string') {
      try { queueItem.content = JSON.parse(queueItem.content); } catch {}
    }

    // Find linked status record
    const statusResult = await db.query(`SELECT * FROM status_bot_statuses WHERE queue_id = $1`, [queueId]);
    let status = statusResult.rows.length > 0 ? normalizeRow(statusResult.rows[0]) : null;

    let views = [], reactions = [], replies = [];
    if (status) {
      const [viewsRes, reactionsRes, repliesRes] = await Promise.all([
        db.query(`SELECT * FROM status_bot_views WHERE status_id = $1 ORDER BY viewed_at DESC`, [status.id]),
        db.query(`SELECT * FROM status_bot_reactions WHERE status_id = $1 ORDER BY reacted_at DESC`, [status.id]),
        db.query(`SELECT * FROM status_bot_replies WHERE status_id = $1 ORDER BY replied_at DESC`, [status.id]),
      ]);
      views = viewsRes.rows;
      reactions = reactionsRes.rows;
      replies = repliesRes.rows;
    }

    res.json({ queueItem, status, views, reactions, replies });
  } catch (error) {
    console.error('[StatusBot Admin] Get queue item details:', error);
    res.status(500).json({ error: 'שגיאה בטעינת פרטי פריט' });
  }
}

/**
 * Admin: Delete all failed items for a user
 */
async function adminClearUserErrors(req, res) {
  try {
    const { connectionId } = req.params;

    const result = await db.query(`
      DELETE FROM status_bot_queue 
      WHERE connection_id = $1 AND queue_status = 'failed'
      RETURNING id
    `, [connectionId]);

    res.json({ 
      success: true, 
      message: `${result.rowCount} שגיאות נמחקו`,
      deletedCount: result.rowCount
    });

  } catch (error) {
    console.error('[StatusBot Admin] Clear user errors:', error);
    res.status(500).json({ error: 'שגיאה במחיקת שגיאות' });
  }
}

/**
 * Admin: Retry all failed items for a user
 */
async function adminRetryUserErrors(req, res) {
  try {
    const { connectionId } = req.params;

    const result = await db.query(`
      UPDATE status_bot_queue 
      SET queue_status = 'pending', error_message = NULL
      WHERE connection_id = $1 AND queue_status = 'failed'
      RETURNING id
    `, [connectionId]);

    res.json({ 
      success: true, 
      message: `${result.rowCount} פריטים הוחזרו לתור`,
      retriedCount: result.rowCount
    });

  } catch (error) {
    console.error('[StatusBot Admin] Retry user errors:', error);
    res.status(500).json({ error: 'שגיאה בהחזרה לתור' });
  }
}

/**
 * Admin: Sync phone numbers from WAHA for all connected sessions
 */
async function adminSyncPhoneNumbers(req, res) {
  try {
    // Get all connections that are supposed to be connected but may have missing phone numbers
    const connectionsResult = await db.query(`
      SELECT * FROM status_bot_connections
      WHERE connection_status = 'connected' OR session_name IS NOT NULL
    `);

    const results = [];

    for (const connection of connectionsResult.rows) {
      try {
        const { baseUrl, apiKey } = await getWahaCredentialsForConnection(connection);
        // Get session info from WAHA
        const sessionStatus = await wahaSession.getSessionStatus(baseUrl, apiKey, connection.session_name);
        
        if (sessionStatus && sessionStatus.status === 'WORKING') {
          const phoneNumber = sessionStatus.me?.id?.split('@')[0] || null;
          const displayName = sessionStatus.me?.pushName || null;
          
          // Update if we got new info
          if (phoneNumber && (!connection.phone_number || connection.phone_number !== phoneNumber)) {
            await db.query(`
              UPDATE status_bot_connections 
              SET phone_number = $1, display_name = COALESCE($2, display_name), 
                  connection_status = 'connected', updated_at = NOW()
              WHERE id = $3
            `, [phoneNumber, displayName, connection.id]);
            
            results.push({
              id: connection.id,
              sessionName: connection.session_name,
              oldPhone: connection.phone_number,
              newPhone: phoneNumber,
              status: 'updated'
            });
          } else if (phoneNumber) {
            results.push({
              id: connection.id,
              sessionName: connection.session_name,
              phone: phoneNumber,
              status: 'unchanged'
            });
          } else {
            results.push({
              id: connection.id,
              sessionName: connection.session_name,
              status: 'no_phone_in_waha',
              wahaResponse: sessionStatus.me
            });
          }
        } else if (sessionStatus) {
          // Session exists but not working
          await db.query(`
            UPDATE status_bot_connections 
            SET connection_status = 'disconnected', updated_at = NOW()
            WHERE id = $1
          `, [connection.id]);
          
          results.push({
            id: connection.id,
            sessionName: connection.session_name,
            status: 'disconnected',
            wahaStatus: sessionStatus.status
          });
        } else {
          // Session doesn't exist
          results.push({
            id: connection.id,
            sessionName: connection.session_name,
            status: 'session_not_found'
          });
        }
      } catch (sessionError) {
        results.push({
          id: connection.id,
          sessionName: connection.session_name,
          status: 'error',
          error: sessionError.message
        });
      }
    }
    
    res.json({ 
      success: true, 
      totalConnections: connectionsResult.rows.length,
      results 
    });
    
  } catch (error) {
    console.error('[StatusBot Admin] Sync phone numbers error:', error);
    res.status(500).json({ error: 'שגיאה בסנכרון מספרי טלפון' });
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
        // First time connecting - set restriction_until only if not already set by startConnection
        await db.query(`
          UPDATE status_bot_connections
          SET first_connected_at = NOW(), last_connected_at = NOW(), short_restriction_until = NULL,
              restriction_until = COALESCE(restriction_until, NOW() + interval '24 hours')
          WHERE id = $1 AND first_connected_at IS NULL
        `, [connection.id]);
        // Trigger background contacts cache sync on first connect
        if (!connection.contacts_cache_synced_at) {
          setImmediate(async () => {
            try {
              const { getWahaCredentialsForConnection } = require('../../services/settings/system.service');
              const creds = await getWahaCredentialsForConnection(connection);
              const { fetchAndCacheContacts } = require('../../services/statusBot/queue.service');
              const contacts = await fetchAndCacheContacts(creds.baseUrl, creds.apiKey, connection.session_name, connection.id);
              console.log(`[StatusBot] 📞 Initial contacts cache: ${contacts.length} contacts for connection ${connection.id}`);
            } catch (err) {
              console.error('[StatusBot] Background contacts sync error:', err.message);
            }
          });
        }
      } else if (wasDisconnected && disconnectionDuration < 60) {
        // Short disconnection (< 1 minute) - use 30 min "system updates" restriction
        const shortRestrictionUntil = new Date(Date.now() + 30 * 60 * 1000);
        await db.query(`
          UPDATE status_bot_connections
          SET restriction_lifted = true, short_restriction_until = $2
          WHERE id = $1
        `, [connection.id, shortRestrictionUntil]);
      } else if (requiresReauthentication) {
        // Re-authentication required (QR scan) - keep restriction_until if already set (shorter),
        // otherwise set to 24h from now
        await db.query(`
          UPDATE status_bot_connections
          SET last_connected_at = NOW(), restriction_lifted = false, short_restriction_until = NULL,
              restriction_until = COALESCE(restriction_until, NOW() + interval '24 hours')
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
            const { baseUrl, apiKey } = await getWahaCredentialsForConnection(freshConnection);
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
        const resolvedPhone = await wahaSession.resolveLid(connection, viewerPhone);
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

    // Update view count and check for first view on uncertain status
    const updateResult = await db.query(`
      UPDATE status_bot_statuses
      SET view_count = (SELECT COUNT(*) FROM status_bot_views WHERE status_id = $1)
      WHERE id = $1
      RETURNING view_count, uncertain_upload
    `, [statusId]);

    const { view_count, uncertain_upload } = updateResult.rows[0] || {};

    // If this is the first view on an uncertain (500-error) status → reveal it in frontend
    if (uncertain_upload && view_count === 1) {
      try {
        const fullStatus = await db.query(`
          SELECT s.*, s.deleted_at IS NOT NULL as is_deleted, q.queue_status
          FROM status_bot_statuses s
          LEFT JOIN status_bot_queue q ON q.id = s.queue_id
          WHERE s.id = $1
        `, [statusId]);
        const socketManager = require('../../services/socket/manager.service').getSocketManager();
        if (socketManager && fullStatus.rows.length > 0) {
          socketManager.emitToUser(connection.user_id, 'statusbot:status_revealed', {
            status: fullStatus.rows[0]
          });
        }
      } catch (e) {
        // Socket not initialized
      }
    }

    // Trigger bot engine for status_viewed event
    try {
      const userId = connection.user_id;
      if (userId && viewerPhone) {
        await botEngine.processEvent(userId, viewerPhone, 'status_viewed', {
          messageId: messageId,
          fromMe: false
        });
      }
    } catch (botErr) {
      console.error('[StatusBot] Bot engine trigger on view error:', botErr.message);
    }

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
        const resolvedPhone = await wahaSession.resolveLid(connection, reactorPhone);
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

    // Trigger bot engine for status_reaction event
    try {
      const userId = connection.user_id;
      if (userId && reactorPhone) {
        const reactionEmoji = reactionText || '❤️';
        const reactionMsgId = reactionData?.messageId || '';
        await botEngine.processEvent(userId, reactorPhone, 'status_reaction', {
          reaction: reactionEmoji,
          messageId: reactionMsgId,
          fromMe: false
        });
      }
    } catch (botErr) {
      console.error('[StatusBot] Bot engine trigger on reaction error:', botErr.message);
    }

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
        // Extract URL - parts[i] might be an object with url property or just a string
        const partUrl = typeof parts[i] === 'object' ? parts[i].url : parts[i];
        const partCaption = parts[i]?.caption || captions[i] || '';
        await db.query(`
          INSERT INTO status_bot_queue 
          (connection_id, status_type, content, queue_status, source, part_group_id, part_number, total_parts)
          VALUES ($1, 'video', $2, 'pending', 'website', $3, $4, $5)
        `, [connectionId, JSON.stringify({ url: partUrl, caption: partCaption }), partGroupId, i + 1, parts.length]);
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
        // Extract URL - parts[i] might be an object with url property or just a string
        const partUrl = typeof parts[i] === 'object' ? parts[i].url : parts[i];
        const partCaption = parts[i]?.caption || captions[i] || '';
        await db.query(`
          INSERT INTO status_bot_queue 
          (connection_id, status_type, content, queue_status, scheduled_for, source, part_group_id, part_number, total_parts)
          VALUES ($1, 'video', $2, 'scheduled', $3, 'website', $4, $5, $6)
        `, [connectionId, JSON.stringify({ url: partUrl, caption: partCaption }), scheduledTime, partGroupId, i + 1, parts.length]);
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

/**
 * Update connection settings
 */
async function updateSettings(req, res) {
  try {
    const userId = req.user.id;
    const { split_video_caption_mode } = req.body;

    // Validate values
    const allowedCaptionModes = ['first', 'all'];
    if (split_video_caption_mode && !allowedCaptionModes.includes(split_video_caption_mode)) {
      return res.status(400).json({ error: 'ערך לא תקין עבור split_video_caption_mode' });
    }

    // Build dynamic update query
    const updates = [];
    const params = [userId];
    let paramIndex = 2;

    if (split_video_caption_mode) {
      updates.push(`split_video_caption_mode = $${paramIndex}`);
      params.push(split_video_caption_mode);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'לא נשלחו הגדרות לעדכון' });
    }

    const result = await db.query(`
      UPDATE status_bot_connections
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE user_id = $1
      RETURNING *
    `, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'חיבור לא נמצא' });
    }

    res.json({ 
      success: true,
      connection: result.rows[0]
    });
  } catch (error) {
    console.error('[StatusBot] Update settings error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון הגדרות' });
  }
}

const queueService = require('../../services/statusBot/queue.service');

/**
 * Admin: get queue global settings
 */
async function adminGetQueueSettings(req, res) {
  try {
    const keys = [
      'statusbot_upload_timeout_minutes',
      'statusbot_max_parallel_total',
      'statusbot_max_parallel_per_source',
      'statusbot_delay_between_statuses_seconds',
      'statusbot_restriction_new_session_hours',
      'statusbot_restriction_with_main_bot_minutes',
      'statusbot_delay_on_disconnect_minutes',
      'statusbot_contacts_parallel_batches',
      'statusbot_contacts_batch_size',
      'statusbot_contacts_timeout_ms',
      'statusbot_contacts_pause_ms',
      'statusbot_contacts_max_consecutive_timeouts',
      'statusbot_contacts_viewer_batch_cap',
      'statusbot_contacts_wave_delay_ms',
      'statusbot_contacts_retry_pause_minutes',
      'statusbot_viewer_timeout_ms',
      'statusbot_viewer_timeout_retries',
    ];
    const result = await db.query(`SELECT key, value FROM system_settings WHERE key = ANY($1)`, [keys]);
    const settings = {
      timeoutMinutes: 10,
      maxParallelTotal: 5,
      maxParallelPerSource: 2,
      delayBetweenStatusesSeconds: 30,
      restrictionNewSessionHours: 24,
      restrictionWithMainBotMinutes: 30,
      delayOnDisconnectMinutes: 0,
      contactsParallelBatches: 3,
      contactsBatchSize: 500,
      contactsTimeoutMs: 120000,
      contactsPauseMs: 60000,
      contactsMaxConsecutiveTimeouts: 4,
      contactsViewerBatchCap: 5000,
      contactsWaveDelayMs: 30000,
      contactsRetryPauseMinutes: 3,
      viewerTimeoutMs: 180000,
      viewerTimeoutRetries: 2,
    };
    for (const row of result.rows) {
      const val = parseFloat(JSON.parse(row.value));
      if (isNaN(val)) continue;
      if (row.key === 'statusbot_upload_timeout_minutes') settings.timeoutMinutes = val;
      if (row.key === 'statusbot_max_parallel_total') settings.maxParallelTotal = val;
      if (row.key === 'statusbot_max_parallel_per_source') settings.maxParallelPerSource = val;
      if (row.key === 'statusbot_delay_between_statuses_seconds') settings.delayBetweenStatusesSeconds = val;
      if (row.key === 'statusbot_restriction_new_session_hours') settings.restrictionNewSessionHours = val;
      if (row.key === 'statusbot_restriction_with_main_bot_minutes') settings.restrictionWithMainBotMinutes = val;
      if (row.key === 'statusbot_delay_on_disconnect_minutes') settings.delayOnDisconnectMinutes = val;
      if (row.key === 'statusbot_contacts_parallel_batches') settings.contactsParallelBatches = val;
      if (row.key === 'statusbot_contacts_batch_size') settings.contactsBatchSize = val;
      if (row.key === 'statusbot_contacts_timeout_ms') settings.contactsTimeoutMs = val;
      if (row.key === 'statusbot_contacts_pause_ms') settings.contactsPauseMs = val;
      if (row.key === 'statusbot_contacts_max_consecutive_timeouts') settings.contactsMaxConsecutiveTimeouts = val;
      if (row.key === 'statusbot_contacts_viewer_batch_cap') settings.contactsViewerBatchCap = val;
      if (row.key === 'statusbot_contacts_wave_delay_ms') settings.contactsWaveDelayMs = val;
      if (row.key === 'statusbot_contacts_retry_pause_minutes') settings.contactsRetryPauseMinutes = val;
      if (row.key === 'statusbot_viewer_timeout_ms') settings.viewerTimeoutMs = val;
      if (row.key === 'statusbot_viewer_timeout_retries') settings.viewerTimeoutRetries = val;
    }
    res.json(settings);
  } catch (error) {
    console.error('[StatusBot] adminGetQueueSettings error:', error);
    res.status(500).json({ error: 'שגיאה' });
  }
}

/**
 * Admin: manually set restriction end time for a connection
 */
async function adminSetRestriction(req, res) {
  try {
    const { connectionId } = req.params;
    const { restrictionUntil } = req.body; // ISO timestamp or null/''
    const adminId = req.user.id;

    if (!restrictionUntil) {
      // Lift restriction entirely
      await db.query(`
        UPDATE status_bot_connections
        SET restriction_until = NULL, restriction_lifted = true,
            restriction_lifted_at = NOW(), restriction_lifted_by = $1,
            short_restriction_until = NULL, updated_at = NOW()
        WHERE id = $2
      `, [adminId, connectionId]);
    } else {
      const until = new Date(restrictionUntil);
      if (isNaN(until.getTime())) return res.status(400).json({ error: 'תאריך לא תקין' });
      await db.query(`
        UPDATE status_bot_connections
        SET restriction_until = $1, restriction_lifted = false, updated_at = NOW()
        WHERE id = $2
      `, [until, connectionId]);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[StatusBot Admin] Set restriction error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון הגבלה' });
  }
}

/**
 * POST /status-bot/contacts/refresh
 * Fetch all contacts from WAHA and persist in DB cache. Returns { count, synced_at }.
 */
async function refreshContactsCache(req, res) {
  try {
    const userId = req.user.id;
    const connRes = await db.query(
      `SELECT * FROM status_bot_connections WHERE user_id = $1`,
      [userId]
    );
    if (!connRes.rows.length) return res.status(404).json({ error: 'אין חיבור' });
    const connection = connRes.rows[0];
    if (connection.connection_status !== 'connected') {
      return res.status(400).json({ error: 'הסשן אינו מחובר' });
    }
    const { getWahaCredentialsForConnection } = require('../../services/settings/system.service');
    const creds = await getWahaCredentialsForConnection(connection);
    const { fetchAndCacheContacts } = require('../../services/statusBot/queue.service');
    const contacts = await fetchAndCacheContacts(creds.baseUrl, creds.apiKey, connection.session_name, connection.id);
    res.json({ count: contacts.length, synced_at: new Date().toISOString() });
  } catch (error) {
    console.error('[StatusBot] Refresh contacts cache error:', error);
    res.status(500).json({ error: 'שגיאה בסנכרון אנשי הקשר' });
  }
}

/**
 * Admin: set status send format for a connection ('default' | 'contacts')
 */
async function adminSetSendFormat(req, res) {
  try {
    const { connectionId } = req.params;
    const { format } = req.body;
    if (!['default', 'contacts'].includes(format)) {
      return res.status(400).json({ error: 'פורמט לא תקין — allowed: default, contacts' });
    }
    await db.query(
      `UPDATE status_bot_connections SET status_send_format = $1, updated_at = NOW() WHERE id = $2`,
      [format, connectionId]
    );
    res.json({ success: true, format });
  } catch (error) {
    console.error('[StatusBot Admin] Set send format error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון פורמט שליחה' });
  }
}

/**
 * Admin: toggle viewers-first mode for a connection
 */
async function adminSetViewersFirstMode(req, res) {
  try {
    const { connectionId } = req.params;
    const { enabled } = req.body;
    await db.query(
      `UPDATE status_bot_connections SET viewers_first_mode = $1, updated_at = NOW() WHERE id = $2`,
      [!!enabled, connectionId]
    );
    res.json({ success: true, viewers_first_mode: !!enabled });
  } catch (error) {
    console.error('[StatusBot Admin] Set viewers-first mode error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון מצב צופים קודם' });
  }
}

/**
 * Admin: update queue global settings
 */
async function adminUpdateQueueSettings(req, res) {
  try {
    const { timeoutMinutes } = req.body;
    if (timeoutMinutes !== undefined && (isNaN(timeoutMinutes) || timeoutMinutes <= 0)) {
      return res.status(400).json({ error: 'ערך טיימאאוט לא תקין' });
    }
    const settingsMap = {
      timeoutMinutes: 'statusbot_upload_timeout_minutes',
      maxParallelTotal: 'statusbot_max_parallel_total',
      maxParallelPerSource: 'statusbot_max_parallel_per_source',
      delayBetweenStatusesSeconds: 'statusbot_delay_between_statuses_seconds',
      restrictionNewSessionHours: 'statusbot_restriction_new_session_hours',
      restrictionWithMainBotMinutes: 'statusbot_restriction_with_main_bot_minutes',
      delayOnDisconnectMinutes: 'statusbot_delay_on_disconnect_minutes',
      contactsParallelBatches: 'statusbot_contacts_parallel_batches',
      contactsBatchSize: 'statusbot_contacts_batch_size',
      contactsTimeoutMs: 'statusbot_contacts_timeout_ms',
      contactsPauseMs: 'statusbot_contacts_pause_ms',
      contactsMaxConsecutiveTimeouts: 'statusbot_contacts_max_consecutive_timeouts',
      contactsViewerBatchCap: 'statusbot_contacts_viewer_batch_cap',
      contactsWaveDelayMs: 'statusbot_contacts_wave_delay_ms',
      contactsRetryPauseMinutes: 'statusbot_contacts_retry_pause_minutes',
      viewerTimeoutMs: 'statusbot_viewer_timeout_ms',
      viewerTimeoutRetries: 'statusbot_viewer_timeout_retries',
    };
    for (const [field, key] of Object.entries(settingsMap)) {
      if (req.body[field] !== undefined) {
        const val = parseFloat(req.body[field]);
        if (!isNaN(val) && val >= 0) {
          await db.query(
            `INSERT INTO system_settings (key, value, updated_at, updated_by)
             VALUES ($1, $2, NOW(), $3)
             ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW(), updated_by = $3`,
            [key, JSON.stringify(val), req.user.id]
          );
        }
      }
    }
    queueService.invalidateSettingsCache();
    res.json({ success: true });
  } catch (error) {
    console.error('[StatusBot] adminUpdateQueueSettings error:', error);
    res.status(500).json({ error: 'שגיאה' });
  }
}

/**
 * Admin: get average upload duration per user per status type
 * Returns avg seconds from queue creation to sent_at, grouped by user and type
 */
async function adminGetUploadStats(req, res) {
  try {
    const result = await db.query(`
      SELECT
        sbc.id as connection_id,
        u.id as user_id,
        u.email,
        u.name as user_name,
        sbc.phone_number,
        AVG(EXTRACT(EPOCH FROM (sbq.sent_at - sbq.created_at))) FILTER (WHERE sbq.status_type = 'text' AND sbq.sent_at IS NOT NULL) as avg_text_seconds,
        AVG(EXTRACT(EPOCH FROM (sbq.sent_at - sbq.created_at))) FILTER (WHERE sbq.status_type = 'image' AND sbq.sent_at IS NOT NULL) as avg_image_seconds,
        AVG(EXTRACT(EPOCH FROM (sbq.sent_at - sbq.created_at))) FILTER (WHERE sbq.status_type = 'video' AND sbq.sent_at IS NOT NULL) as avg_video_seconds,
        AVG(EXTRACT(EPOCH FROM (sbq.sent_at - sbq.created_at))) FILTER (WHERE sbq.status_type = 'voice' AND sbq.sent_at IS NOT NULL) as avg_voice_seconds,
        COUNT(*) FILTER (WHERE sbq.status_type = 'text' AND sbq.queue_status = 'sent') as text_count,
        COUNT(*) FILTER (WHERE sbq.status_type = 'image' AND sbq.queue_status = 'sent') as image_count,
        COUNT(*) FILTER (WHERE sbq.status_type = 'video' AND sbq.queue_status = 'sent') as video_count,
        COUNT(*) FILTER (WHERE sbq.status_type = 'voice' AND sbq.queue_status = 'sent') as voice_count
      FROM status_bot_connections sbc
      JOIN users u ON u.id = sbc.user_id
      LEFT JOIN status_bot_queue sbq ON sbq.connection_id = sbc.id AND sbq.queue_status = 'sent'
      GROUP BY sbc.id, u.id, u.email, u.name, sbc.phone_number
      HAVING COUNT(sbq.id) > 0
      ORDER BY (COUNT(*) FILTER (WHERE sbq.queue_status = 'sent')) DESC
    `);
    res.json({ stats: result.rows });
  } catch (error) {
    console.error('[StatusBot Admin] Get upload stats error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת סטטיסטיקות' });
  }
}

/**
 * Admin: list all pending + scheduled queue items across all users
 */
async function adminGetAllQueueItems(req, res) {
  try {
    const result = await db.query(`
      SELECT q.id, q.queue_status, q.status_type, q.created_at, q.scheduled_for,
             q.processing_started_at, q.content,
             q.contacts_sent, q.contacts_total,
             sbc.phone_number, u.email, u.name as user_name, u.id as user_id
      FROM status_bot_queue q
      JOIN status_bot_connections sbc ON sbc.id = q.connection_id
      JOIN users u ON u.id = sbc.user_id
      WHERE q.queue_status IN ('pending', 'processing', 'scheduled')
      ORDER BY COALESCE(q.scheduled_for, q.created_at) ASC
    `);
    res.json({ items: result.rows });
  } catch (e) {
    console.error('[StatusBot Admin] adminGetAllQueueItems error:', e);
    res.status(500).json({ error: 'שגיאה בטעינת תור' });
  }
}

/**
 * Admin: cancel (delete) any queue item regardless of owner
 */
async function adminCancelQueueItem(req, res) {
  try {
    const { queueId } = req.params;
    const result = await db.query(
      `UPDATE status_bot_queue SET queue_status = 'cancelled', error_message = 'בוטל על ידי מנהל'
       WHERE id = $1 AND queue_status IN ('pending', 'processing', 'scheduled')
       RETURNING id, queue_status`,
      [queueId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'פריט לא נמצא או כבר בוטל' });
    res.json({ success: true });
  } catch (e) {
    console.error('[StatusBot Admin] adminCancelQueueItem error:', e);
    res.status(500).json({ error: 'שגיאה בביטול' });
  }
}

/**
 * Admin: bulk cancel all pending + scheduled items (optionally filtered by status)
 */
async function adminBulkCancelQueue(req, res) {
  try {
    const { statuses = ['pending', 'scheduled'] } = req.body; // which statuses to cancel
    const validStatuses = ['pending', 'scheduled', 'processing'];
    const toCancel = statuses.filter(s => validStatuses.includes(s));
    if (toCancel.length === 0) return res.status(400).json({ error: 'לא צוינו סטטוסים לביטול' });

    const result = await db.query(
      `UPDATE status_bot_queue SET queue_status = 'cancelled', error_message = 'ביטול גורף על ידי מנהל'
       WHERE queue_status = ANY($1::text[])
       RETURNING id`,
      [toCancel]
    );
    console.log(`[StatusBot Admin] Bulk cancelled ${result.rowCount} items`);
    res.json({ success: true, cancelled: result.rowCount });
  } catch (e) {
    console.error('[StatusBot Admin] adminBulkCancelQueue error:', e);
    res.status(500).json({ error: 'שגיאה בביטול גורף' });
  }
}

/**
 * Admin: set global queue pause until a specific time (stores in system_settings)
 * Body: { minutes } — pause for X minutes from now
 */
async function adminPauseQueue(req, res) {
  try {
    const minutes = parseFloat(req.body.minutes) || 30;
    const pauseUntil = new Date(Date.now() + minutes * 60000).toISOString();
    await db.query(`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES ('statusbot_global_pause_until', $1, NOW())
      ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
    `, [JSON.stringify(pauseUntil)]);
    console.log(`[StatusBot Admin] Queue paused until ${pauseUntil}`);
    res.json({ success: true, pausedUntil: pauseUntil });
  } catch (e) {
    console.error('[StatusBot Admin] adminPauseQueue error:', e);
    res.status(500).json({ error: 'שגיאה בהשהיית התור' });
  }
}

/**
 * Admin: remove global queue pause
 */
async function adminResumeQueue(req, res) {
  try {
    await db.query(`DELETE FROM system_settings WHERE key = 'statusbot_global_pause_until'`);
    res.json({ success: true });
  } catch (e) {
    console.error('[StatusBot Admin] adminResumeQueue error:', e);
    res.status(500).json({ error: 'שגיאה בהסרת ההשהייה' });
  }
}

/**
 * Admin: get current global pause status
 */
async function adminGetQueuePauseStatus(req, res) {
  try {
    const result = await db.query(`SELECT value FROM system_settings WHERE key = 'statusbot_global_pause_until'`);
    if (result.rows.length === 0) return res.json({ paused: false });
    const pauseUntil = JSON.parse(result.rows[0].value);
    const paused = new Date(pauseUntil) > new Date();
    res.json({ paused, pausedUntil: paused ? pauseUntil : null });
  } catch (e) {
    res.json({ paused: false });
  }
}

/**
 * Admin: restrict ALL users from uploading for X minutes
 */
async function adminRestrictAllUsers(req, res) {
  try {
    const minutes = parseFloat(req.body.minutes) || 60;
    const restrictUntil = new Date(Date.now() + minutes * 60000);
    // Restrict ALL connections (not just 'connected') — set both short_restriction and mark not lifted
    const result = await db.query(`
      UPDATE status_bot_connections
      SET short_restriction_until = $1, restriction_lifted = false, updated_at = NOW()
      RETURNING id
    `, [restrictUntil]);
    console.log(`[StatusBot Admin] Restricted ${result.rowCount} users until ${restrictUntil}`);
    res.json({ success: true, restricted: result.rowCount, until: restrictUntil });
  } catch (e) {
    console.error('[StatusBot Admin] adminRestrictAllUsers error:', e);
    res.status(500).json({ error: 'שגיאה בחסימה' });
  }
}

/**
 * Admin: remove restriction from all connected users
 */
async function adminUnrestrictAllUsers(req, res) {
  try {
    // Lift ALL restrictions: clear short_restriction, clear restriction_until, mark lifted
    const result = await db.query(`
      UPDATE status_bot_connections
      SET short_restriction_until = NULL,
          restriction_lifted = true,
          restriction_lifted_at = NOW(),
          updated_at = NOW()
      RETURNING id
    `);
    console.log(`[StatusBot Admin] Unrestricted ${result.rowCount} users`);
    res.json({ success: true, unrestricted: result.rowCount });
  } catch (e) {
    console.error('[StatusBot Admin] adminUnrestrictAllUsers error:', e);
    res.status(500).json({ error: 'שגיאה בהסרת חסימה' });
  }
}

/**
 * User: reorder two adjacent queue items by swapping their created_at
 */
async function reorderQueueItems(req, res) {
  try {
    const userId = req.user.id;
    const { itemId, direction } = req.body; // direction: 'up' | 'down'

    // Get user's connection
    const connResult = await db.query(
      `SELECT id FROM status_bot_connections WHERE user_id = $1`, [userId]
    );
    if (connResult.rows.length === 0) return res.status(404).json({ error: 'חיבור לא נמצא' });
    const connectionId = connResult.rows[0].id;

    // Get the target item
    const itemResult = await db.query(
      `SELECT id, created_at FROM status_bot_queue
       WHERE id = $1 AND connection_id = $2 AND queue_status IN ('pending', 'scheduled')`,
      [itemId, connectionId]
    );
    if (itemResult.rows.length === 0) return res.status(404).json({ error: 'פריט לא נמצא' });

    const item = itemResult.rows[0];

    // Find adjacent item
    const adjacentResult = await db.query(
      direction === 'up'
        ? `SELECT id, created_at FROM status_bot_queue
           WHERE connection_id = $1 AND queue_status IN ('pending', 'scheduled')
             AND (scheduled_for IS NULL OR scheduled_for <= NOW())
             AND created_at < $2
           ORDER BY created_at DESC LIMIT 1`
        : `SELECT id, created_at FROM status_bot_queue
           WHERE connection_id = $1 AND queue_status IN ('pending', 'scheduled')
             AND (scheduled_for IS NULL OR scheduled_for <= NOW())
             AND created_at > $2
           ORDER BY created_at ASC LIMIT 1`,
      [connectionId, item.created_at]
    );

    if (adjacentResult.rows.length === 0) return res.json({ success: true, changed: false });

    const adjacent = adjacentResult.rows[0];

    // Swap created_at values
    await db.query(`UPDATE status_bot_queue SET created_at = $1 WHERE id = $2`, [adjacent.created_at, item.id]);
    await db.query(`UPDATE status_bot_queue SET created_at = $1 WHERE id = $2`, [item.created_at, adjacent.id]);

    res.json({ success: true, changed: true });
  } catch (e) {
    console.error('[StatusBot] reorderQueueItems error:', e);
    res.status(500).json({ error: 'שגיאה בשינוי סדר' });
  }
}

module.exports = {
  // Connection
  getConnection,
  checkExisting,
  startConnection,
  getQR,
  disconnect,
  updateSettings,
  
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
  adminGetUploadStats,
  adminResetQueueLock,
  adminForceCancelItem,
  adminForceStopItem,
  adminSyncPhoneNumbers,
  adminGetUserErrors,
  adminGetUserDetails,
  adminGetStatusDetails,
  adminGetQueueItemDetails,
  adminClearUserErrors,
  adminRetryUserErrors,
  
  // Queue management
  forceCancelProcessing,

  // Admin settings (exported below after function definitions)
  adminGetQueueSettings,
  adminUpdateQueueSettings,
  adminSetRestriction,
  adminSetSendFormat,
  adminSetViewersFirstMode,
  refreshContactsCache,
  adminGetAllQueueItems,
  adminCancelQueueItem,
  adminBulkCancelQueue,
  adminPauseQueue,
  adminResumeQueue,
  adminGetQueuePauseStatus,
  adminRestrictAllUsers,
  adminUnrestrictAllUsers,
  reorderQueueItems,

  // Webhook
  handleWebhook,
};
