const pool = require('../../config/database');
const { v4: uuidv4 } = require('uuid');
const { getWahaCredentials } = require('../../services/settings/system.service');
const { encrypt, decrypt } = require('../../services/crypto/encrypt.service');
const wahaSession = require('../../services/waha/session.service');

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

/**
 * Create managed WhatsApp connection (system WAHA)
 * Session name is based on user email for easy identification
 */
async function createManaged(req, res) {
  try {
    const userId = req.user.id;
    
    // Get user email - from token or from DB
    let userEmail = req.user.email;
    if (!userEmail) {
      const userResult = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
      userEmail = userResult.rows[0]?.email;
    }
    
    if (!userEmail) {
      return res.status(400).json({ error: 'לא נמצא מייל למשתמש' });
    }
    
    // Check if user already has a connection in our DB
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
    
    // Get system WAHA credentials
    const { baseUrl, apiKey } = getWahaCredentials();
    
    if (!baseUrl || !apiKey) {
      return res.status(500).json({ error: 'WAHA לא מוגדר במערכת' });
    }
    
    // First, search for existing session by email in metadata
    console.log(`[WhatsApp] Searching for existing session with email: ${userEmail}`);
    
    let sessionName = null;
    let wahaStatus = null;
    let existingSession = null;
    
    try {
      existingSession = await wahaSession.findSessionByEmail(baseUrl, apiKey, userEmail);
      
      if (existingSession) {
        sessionName = existingSession.name;
        console.log(`[WhatsApp] ✅ Found existing session by email: ${sessionName}`);
        
        // Get current status
        wahaStatus = await wahaSession.getSessionStatus(baseUrl, apiKey, sessionName);
        
        // If stopped, start it
        if (wahaStatus.status === 'STOPPED') {
          await wahaSession.startSession(baseUrl, apiKey, sessionName);
          console.log(`[WhatsApp] ✅ Started existing stopped session: ${sessionName}`);
          wahaStatus = await wahaSession.getSessionStatus(baseUrl, apiKey, sessionName);
        } else {
          console.log(`[WhatsApp] ✅ Session already active: ${sessionName}, status: ${wahaStatus.status}`);
        }
      }
    } catch (err) {
      console.log(`[WhatsApp] Error searching sessions: ${err.message}`);
    }
    
    // If no existing session found, create new one
    if (!sessionName) {
      // Generate unique session name with system prefix
      const uniqueId = require('crypto').randomBytes(4).toString('hex');
      sessionName = `fb_${uniqueId}`;
      
      // Metadata to attach to session (for identification in WAHA)
      const sessionMetadata = {
        'user.email': userEmail,
      };
      
      console.log(`[WhatsApp] Creating new session: ${sessionName}`);
      
      await wahaSession.createSession(baseUrl, apiKey, sessionName, sessionMetadata);
      await wahaSession.startSession(baseUrl, apiKey, sessionName);
      console.log(`[WhatsApp] ✅ Created new session: ${sessionName}`);
      
      // Get status
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
    
    // Save connection to DB
    const result = await pool.query(
      `INSERT INTO whatsapp_connections 
       (user_id, connection_type, session_name, status, phone_number, display_name, connected_at)
       VALUES ($1, 'managed', $2, $3, $4, $5, $6)
       RETURNING id, session_name, status, phone_number, display_name, created_at`,
      [userId, sessionName, ourStatus, phoneNumber, displayName, connectedAt]
    );
    
    res.json({ 
      success: true, 
      connection: result.rows[0],
      sessionExists, // Let frontend know if this was an existing session
    });
  } catch (error) {
    console.error('Create managed connection error:', error);
    res.status(500).json({ error: 'שגיאה ביצירת חיבור' });
  }
}

/**
 * Create external WhatsApp connection (user's own WAHA)
 */
async function createExternal(req, res) {
  try {
    const userId = req.user.id;
    const { baseUrl, apiKey, sessionName } = req.body;
    
    if (!baseUrl || !apiKey || !sessionName) {
      return res.status(400).json({ error: 'נדרשים כל השדות' });
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

module.exports = { createManaged, createExternal };
