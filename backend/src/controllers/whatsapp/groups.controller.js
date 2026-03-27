const db = require('../../config/database');
const { getWahaCredentialsForConnection } = require('../../services/settings/system.service');
const axios = require('axios');

async function getGroups(req, res) {
  try {
    const userId = req.user.id;
    
    // Get user's WhatsApp connection
    const result = await db.query(
      `SELECT * FROM whatsapp_connections 
       WHERE user_id = $1 AND status = 'connected' 
       ORDER BY connected_at DESC LIMIT 1`,
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'לא נמצא חיבור WhatsApp פעיל', groups: [] });
    }
    
    const connection = result.rows[0];
    const { baseUrl, apiKey } = await getWahaCredentialsForConnection(connection);
    const sessionName = connection.session_name;
    
    // Fetch groups from WAHA
    const response = await axios.get(
      `${baseUrl}/api/${sessionName}/groups`,
      {
        headers: {
          'accept': 'application/json',
          'X-Api-Key': apiKey
        },
        timeout: 30000
      }
    );
    
    // Format groups - handle WAHA response format
    // WAHA returns array with JID, Name, Participants (array)
    const rawGroups = Array.isArray(response.data) ? response.data : (response.data?.groups || response.data?.data || []);
    
    const groups = rawGroups.map(group => {
      // Keep original format for compatibility
      const jid = group.JID || group.id || group.chatId || group.jid || '';
      const name = group.Name || group.name || group.subject || group.groupName || '';
      const participants = group.Participants || group.participants || [];
      
      return {
        // Original fields for backwards compatibility
        id: jid,
        name: name || jid.replace('@g.us', '') || jid,
        participants: participants.length,
        // Keep WAHA fields for the modal
        JID: jid,
        Name: name || jid.replace('@g.us', '') || jid,
        Participants: participants,
      };
    }).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'he')); // Sort alphabetically in Hebrew
    
    res.json({ groups });
    
  } catch (error) {
    console.error('[Groups] Error fetching groups:', error.message);
    res.status(500).json({ 
      error: 'שגיאה במשיכת קבוצות', 
      groups: [],
      details: error.message 
    });
  }
}

module.exports = { getGroups };
