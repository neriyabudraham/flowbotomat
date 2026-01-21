const pool = require('../../config/database');
const { decrypt } = require('../../services/crypto/encrypt.service');
const { getWahaCredentials } = require('../../services/settings/system.service');
const { createClient } = require('../../services/waha/client.service');

/**
 * Send message to contact
 */
async function sendMessage(req, res) {
  try {
    const userId = req.user.id;
    const { contactId } = req.params;
    const { content, message_type = 'text' } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'נדרש תוכן הודעה' });
    }
    
    // Get contact and connection
    const contactResult = await pool.query(
      'SELECT * FROM contacts WHERE id = $1 AND user_id = $2',
      [contactId, userId]
    );
    
    if (contactResult.rows.length === 0) {
      return res.status(404).json({ error: 'איש קשר לא נמצא' });
    }
    
    const contact = contactResult.rows[0];
    
    // Get WhatsApp connection
    const connectionResult = await pool.query(
      `SELECT * FROM whatsapp_connections WHERE user_id = $1`,
      [userId]
    );
    
    if (connectionResult.rows.length === 0) {
      return res.status(400).json({ error: 'אין חיבור WhatsApp' });
    }
    
    const connection = connectionResult.rows[0];
    
    // Get WAHA credentials
    let baseUrl, apiKey;
    if (connection.connection_type === 'managed') {
      const creds = getWahaCredentials();
      baseUrl = creds.baseUrl;
      apiKey = creds.apiKey;
    } else {
      baseUrl = decrypt(connection.external_base_url);
      apiKey = decrypt(connection.external_api_key);
    }
    
    // Send via WAHA
    const client = createClient(baseUrl, apiKey);
    const chatId = contact.wa_id || `${contact.phone}@s.whatsapp.net`;
    
    let wahaResponse;
    try {
      wahaResponse = await client.post(`/api/sendText`, {
        session: connection.session_name,
        chatId: chatId,
        text: content,
      });
    } catch (err) {
      console.error('WAHA send error:', err.response?.data || err.message);
      return res.status(500).json({ error: 'שגיאה בשליחת הודעה' });
    }
    
    // Save message to DB
    const messageResult = await pool.query(
      `INSERT INTO messages 
       (user_id, contact_id, wa_message_id, direction, message_type, content, status, sent_at)
       VALUES ($1, $2, $3, 'outgoing', $4, $5, 'sent', NOW())
       RETURNING *`,
      [userId, contactId, wahaResponse.data?.id?.id || null, message_type, content]
    );
    
    // Update contact last message time
    await pool.query(
      'UPDATE contacts SET last_message_at = NOW() WHERE id = $1',
      [contactId]
    );
    
    res.json({ 
      success: true, 
      message: messageResult.rows[0],
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'שגיאה בשליחת הודעה' });
  }
}

module.exports = { sendMessage };
