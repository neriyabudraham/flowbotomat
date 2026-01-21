const pool = require('../../config/database');
const { getWahaCredentials } = require('../../services/settings/system.service');
const { decrypt } = require('../../services/crypto/encrypt.service');
const wahaSession = require('../../services/waha/session.service');

/**
 * Disconnect WhatsApp connection (soft - keeps WAHA session alive)
 * Just removes from our DB, session stays connected in WAHA
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
    
    // Just delete from DB - keep WAHA session alive
    // User can reconnect later and the session will still be authenticated
    await pool.query(
      'DELETE FROM whatsapp_connections WHERE id = $1',
      [connection.id]
    );
    
    res.json({ 
      success: true, 
      message: 'החיבור נותק. ה-session נשאר פעיל ב-WhatsApp.' 
    });
  } catch (error) {
    console.error('Disconnect error:', error);
    res.status(500).json({ error: 'שגיאה בניתוק' });
  }
}

/**
 * Full logout and delete - completely removes WAHA session
 * Use this when user wants to logout from WhatsApp entirely
 */
async function deleteConnection(req, res) {
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
    
    // For managed connections, logout and delete session from WAHA
    if (connection.connection_type === 'managed') {
      try {
        const { baseUrl, apiKey } = getWahaCredentials();
        // First logout (this disconnects WhatsApp)
        await wahaSession.logoutSession(baseUrl, apiKey, connection.session_name);
        // Then stop the session
        await wahaSession.stopSession(baseUrl, apiKey, connection.session_name);
        // Finally delete it
        await wahaSession.deleteSession(baseUrl, apiKey, connection.session_name);
      } catch (err) {
        console.error('WAHA session delete failed:', err.message);
      }
    } else {
      // For external connections, just stop and delete if we can
      try {
        const baseUrl = decrypt(connection.external_base_url);
        const apiKey = decrypt(connection.external_api_key);
        await wahaSession.logoutSession(baseUrl, apiKey, connection.session_name);
      } catch (err) {
        console.error('External WAHA logout failed:', err.message);
      }
    }
    
    // Delete from DB
    await pool.query(
      'DELETE FROM whatsapp_connections WHERE id = $1',
      [connection.id]
    );
    
    res.json({ 
      success: true, 
      message: 'החיבור נמחק לגמרי. תצטרך לסרוק QR מחדש.' 
    });
  } catch (error) {
    console.error('Delete connection error:', error);
    res.status(500).json({ error: 'שגיאה במחיקת חיבור' });
  }
}

module.exports = { disconnect, deleteConnection };
