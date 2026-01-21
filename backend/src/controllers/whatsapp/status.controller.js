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
              connected_at, last_seen_at, created_at
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
    
    res.json({ 
      connected: connection.status === 'connected',
      connection,
    });
  } catch (error) {
    console.error('Get status error:', error);
    res.status(500).json({ error: 'שגיאה בקבלת סטטוס' });
  }
}

/**
 * Get QR code for scanning
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
    
    const qrData = await wahaSession.getQRCode(
      baseUrl, apiKey, connection.session_name
    );
    
    // Save QR to DB
    await pool.query(
      `UPDATE whatsapp_connections 
       SET last_qr_code = $1, last_qr_at = NOW() 
       WHERE id = $2`,
      [qrData.value, connection.id]
    );
    
    res.json({ qr: qrData.value });
  } catch (error) {
    console.error('Get QR error:', error);
    res.status(500).json({ error: 'שגיאה בקבלת QR' });
  }
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

module.exports = { getStatus, getQR };
