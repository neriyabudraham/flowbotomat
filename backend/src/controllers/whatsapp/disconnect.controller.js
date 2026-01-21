const pool = require('../../config/database');
const { getWahaCredentials } = require('../../services/settings/system.service');
const { decrypt } = require('../../services/crypto/encrypt.service');
const wahaSession = require('../../services/waha/session.service');

/**
 * Disconnect and remove WhatsApp connection
 */
async function disconnect(req, res) {
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
    
    // For managed connections, delete session from WAHA
    if (connection.connection_type === 'managed') {
      try {
        const { baseUrl, apiKey } = getWahaCredentials();
        await wahaSession.stopSession(baseUrl, apiKey, connection.session_name);
        await wahaSession.deleteSession(baseUrl, apiKey, connection.session_name);
      } catch (err) {
        console.error('WAHA session delete failed:', err.message);
      }
    }
    
    // Delete from DB
    await pool.query(
      'DELETE FROM whatsapp_connections WHERE id = $1',
      [connection.id]
    );
    
    res.json({ success: true, message: 'החיבור הוסר' });
  } catch (error) {
    console.error('Disconnect error:', error);
    res.status(500).json({ error: 'שגיאה בניתוק' });
  }
}

module.exports = { disconnect };
