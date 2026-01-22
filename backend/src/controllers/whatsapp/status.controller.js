const pool = require('../../config/database');
const { getWahaCredentials } = require('../../services/settings/system.service');
const { decrypt } = require('../../services/crypto/encrypt.service');
const wahaSession = require('../../services/waha/session.service');

/**
 * Get user's WhatsApp connection status
 */
async function getStatus(req, res) {
  try {
    const userId = req.user.id;
    
    const result = await pool.query(
      `SELECT id, connection_type, session_name, phone_number, 
              display_name, profile_picture_url, status, 
              connected_at, last_seen_at, created_at,
              external_base_url, external_api_key
       FROM whatsapp_connections WHERE user_id = $1`,
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.json({ connected: false, connection: null });
    }
    
    const connection = result.rows[0];
    
    // Get live status from WAHA
    try {
      const { baseUrl, apiKey } = getCredentials(connection);
      const wahaStatus = await wahaSession.getSessionStatus(
        baseUrl, apiKey, connection.session_name
      );
      
      // Update status if changed
      const newStatus = mapWahaStatus(wahaStatus.status);
      if (newStatus !== connection.status) {
        await updateConnectionStatus(connection.id, newStatus, wahaStatus);
        connection.status = newStatus;
      }
    } catch (err) {
      console.error('WAHA status check failed:', err.message);
    }
    
    // Don't expose encrypted credentials to client
    const { external_base_url, external_api_key, ...safeConnection } = connection;
    
    res.json({ 
      connected: safeConnection.status === 'connected',
      connection: safeConnection,
    });
  } catch (error) {
    console.error('Get status error:', error);
    res.status(500).json({ error: 'שגיאה בקבלת סטטוס' });
  }
}

/**
 * Get QR code for scanning (as image)
 */
async function getQR(req, res) {
  try {
    const userId = req.user.id;
    
    const result = await pool.query(
      `SELECT id, connection_type, session_name, external_base_url, external_api_key
       FROM whatsapp_connections WHERE user_id = $1`,
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'אין חיבור WhatsApp' });
    }
    
    const connection = result.rows[0];
    const { baseUrl, apiKey } = getCredentials(connection);
    
    // First check session status - if not SCAN_QR_CODE, may need to restart
    try {
      const status = await wahaSession.getSessionStatus(baseUrl, apiKey, connection.session_name);
      console.log(`[QR] Session ${connection.session_name} status: ${status.status}`);
      
      if (status.status === 'WORKING') {
        return res.json({ qr: null, status: 'connected', message: 'כבר מחובר' });
      }
      
      if (status.status === 'STOPPED' || status.status === 'FAILED') {
        // Need to start the session first
        console.log(`[QR] Starting session ${connection.session_name}...`);
        await wahaSession.startSession(baseUrl, apiKey, connection.session_name);
        // Wait a bit for session to initialize
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (statusErr) {
      console.error('[QR] Status check error:', statusErr.message);
    }
    
    const qrData = await wahaSession.getQRCode(
      baseUrl, apiKey, connection.session_name
    );
    
    // Save QR to DB (now it's a data URL)
    await pool.query(
      `UPDATE whatsapp_connections 
       SET last_qr_code = $1, last_qr_at = NOW() 
       WHERE id = $2`,
      [qrData.value.substring(0, 100) + '...', connection.id] // Truncate for DB
    );
    
    res.json({ qr: qrData.value, status: 'qr_ready' });
  } catch (error) {
    console.error('Get QR error:', error.message);
    res.status(500).json({ error: 'שגיאה בקבלת QR - נסה שוב' });
  }
}

/**
 * Request pairing code (alternative to QR)
 */
async function requestCode(req, res) {
  try {
    const userId = req.user.id;
    let { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({ error: 'נדרש מספר טלפון' });
    }
    
    // Format phone number to international format
    phoneNumber = formatPhoneNumber(phoneNumber);
    
    const result = await pool.query(
      `SELECT id, connection_type, session_name, external_base_url, external_api_key
       FROM whatsapp_connections WHERE user_id = $1`,
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'אין חיבור WhatsApp' });
    }
    
    const connection = result.rows[0];
    const { baseUrl, apiKey } = getCredentials(connection);
    
    // First check/start session if needed
    try {
      const status = await wahaSession.getSessionStatus(baseUrl, apiKey, connection.session_name);
      
      if (status.status === 'WORKING') {
        return res.json({ success: false, message: 'כבר מחובר' });
      }
      
      if (status.status === 'STOPPED' || status.status === 'FAILED') {
        console.log(`[Code Auth] Starting session ${connection.session_name}...`);
        await wahaSession.startSession(baseUrl, apiKey, connection.session_name);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (err) {
      console.error('[Code Auth] Status check error:', err.message);
    }
    
    // Request the pairing code
    const codeData = await wahaSession.requestPairingCode(
      baseUrl, apiKey, connection.session_name, phoneNumber
    );
    
    console.log(`[Code Auth] Pairing code requested for ${phoneNumber}`);
    
    res.json({ 
      success: true, 
      message: 'קוד נשלח למספר הטלפון שלך',
      code: codeData.code // WAHA returns the code for display
    });
  } catch (error) {
    console.error('Request code error:', error.message);
    res.status(500).json({ error: 'שגיאה בשליחת קוד - וודא שהמספר נכון' });
  }
}

/**
 * Format phone number to international format (972...)
 */
function formatPhoneNumber(phone) {
  // Remove all non-digits
  let clean = phone.replace(/\D/g, '');
  
  // Handle Israeli numbers
  if (clean.startsWith('0')) {
    clean = '972' + clean.substring(1);
  } else if (!clean.startsWith('972') && clean.length === 9) {
    // Assuming Israeli number without prefix
    clean = '972' + clean;
  }
  
  return clean;
}

// Helper: Get WAHA credentials based on connection type
function getCredentials(connection) {
  if (connection.connection_type === 'managed') {
    return getWahaCredentials();
  }
  return {
    baseUrl: decrypt(connection.external_base_url),
    apiKey: decrypt(connection.external_api_key),
  };
}

// Helper: Map WAHA status to our status
function mapWahaStatus(wahaStatus) {
  const map = {
    'WORKING': 'connected',
    'SCAN_QR_CODE': 'qr_pending',
    'STARTING': 'qr_pending',
    'STOPPED': 'disconnected',
    'FAILED': 'failed',
  };
  return map[wahaStatus] || 'disconnected';
}

// Helper: Update connection status in DB
async function updateConnectionStatus(connectionId, status, wahaStatus) {
  const updates = { status };
  
  if (status === 'connected' && wahaStatus.me) {
    updates.phone_number = wahaStatus.me.id?.split('@')[0];
    updates.display_name = wahaStatus.me.pushName;
    updates.connected_at = new Date();
  }
  
  const setClauses = Object.keys(updates)
    .map((key, i) => `${key} = $${i + 2}`)
    .join(', ');
  
  await pool.query(
    `UPDATE whatsapp_connections SET ${setClauses}, updated_at = NOW() WHERE id = $1`,
    [connectionId, ...Object.values(updates)]
  );
}

module.exports = { getStatus, getQR, requestCode };
