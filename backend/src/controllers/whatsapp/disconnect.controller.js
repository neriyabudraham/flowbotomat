const pool = require('../../config/database');
const { getWahaCredentialsForConnection } = require('../../services/settings/system.service');
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
    
    // Logout and delete session from WAHA
    try {
      const { baseUrl, apiKey } = await getWahaCredentialsForConnection(connection);
      // First logout (this disconnects WhatsApp)
      await wahaSession.logoutSession(baseUrl, apiKey, connection.session_name);
      if (connection.connection_type === 'managed') {
        // Then stop the session
        await wahaSession.stopSession(baseUrl, apiKey, connection.session_name);
        // Finally delete it
        await wahaSession.deleteSession(baseUrl, apiKey, connection.session_name);
      }
    } catch (err) {
      console.error('WAHA session delete failed:', err.message);
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

/**
 * Logout from WhatsApp session (no delete). The WAHA session is logged out
 * so the user can connect a different phone, and the DB row is removed.
 * Unlike deleteConnection, this doesn't stop/delete the WAHA session container
 * itself — it only logs it out so it's ready for a fresh login.
 */
async function logoutSessionOnly(req, res) {
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

    try {
      const { baseUrl, apiKey } = await getWahaCredentialsForConnection(connection);
      // Logout — disconnects the phone from the session without destroying it
      await wahaSession.logoutSession(baseUrl, apiKey, connection.session_name);
    } catch (err) {
      console.error('WAHA logout failed:', err.message);
    }

    await pool.query('DELETE FROM whatsapp_connections WHERE id = $1', [connection.id]);

    res.json({
      success: true,
      message: 'הסשן נותק מ-WhatsApp. תוכל לחבר מספר אחר.'
    });
  } catch (error) {
    console.error('Logout session error:', error);
    res.status(500).json({ error: 'שגיאה בניתוק הסשן' });
  }
}

module.exports = { disconnect, deleteConnection, logoutSessionOnly };
