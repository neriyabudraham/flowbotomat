const pool = require('../../config/database');
const { v4: uuidv4 } = require('uuid');
const { getWahaCredentials } = require('../../services/settings/system.service');
const { encrypt, decrypt } = require('../../services/crypto/encrypt.service');
const wahaSession = require('../../services/waha/session.service');

/**
 * Create managed WhatsApp connection (system WAHA)
 */
async function createManaged(req, res) {
  try {
    const userId = req.user.id;
    
    // Check if user already has a connection
    const existing = await pool.query(
      'SELECT id FROM whatsapp_connections WHERE user_id = $1',
      [userId]
    );
    
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'כבר יש לך חיבור WhatsApp' });
    }
    
    // Get system WAHA credentials
    const { baseUrl, apiKey } = await getWahaCredentials();
    
    if (!baseUrl || !apiKey) {
      return res.status(500).json({ error: 'WAHA לא מוגדר במערכת' });
    }
    
    // Generate unique session name
    const sessionName = `user_${userId.split('-')[0]}_${Date.now()}`;
    
    // Create session in WAHA
    await wahaSession.createSession(baseUrl, apiKey, sessionName);
    await wahaSession.startSession(baseUrl, apiKey, sessionName);
    
    // Save connection to DB
    const result = await pool.query(
      `INSERT INTO whatsapp_connections 
       (user_id, connection_type, session_name, status)
       VALUES ($1, 'managed', $2, 'qr_pending')
       RETURNING id, session_name, status, created_at`,
      [userId, sessionName]
    );
    
    res.json({ 
      success: true, 
      connection: result.rows[0],
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
      'SELECT id FROM whatsapp_connections WHERE user_id = $1',
      [userId]
    );
    
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'כבר יש לך חיבור WhatsApp' });
    }
    
    // Test connection to external WAHA
    try {
      await wahaSession.getSessionStatus(baseUrl, apiKey, sessionName);
    } catch (err) {
      return res.status(400).json({ error: 'לא ניתן להתחבר ל-WAHA' });
    }
    
    // Save connection to DB (encrypt sensitive data)
    const result = await pool.query(
      `INSERT INTO whatsapp_connections 
       (user_id, connection_type, external_base_url, external_api_key, session_name, status)
       VALUES ($1, 'external', $2, $3, $4, 'qr_pending')
       RETURNING id, session_name, status, created_at`,
      [userId, encrypt(baseUrl), encrypt(apiKey), sessionName]
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
