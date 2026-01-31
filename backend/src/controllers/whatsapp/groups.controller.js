const db = require('../../config/database');
const { decrypt } = require('../../services/crypto/encrypt.service');
const { getWahaCredentials } = require('../../services/settings/system.service');
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
    let baseUrl, apiKey, sessionName;
    
    if (connection.connection_type === 'external') {
      // Decrypt external credentials
      baseUrl = decrypt(connection.external_base_url);
      apiKey = decrypt(connection.external_api_key);
      sessionName = connection.session_name;
    } else {
      // Use system WAHA
      const systemCreds = await getWahaCredentials();
      baseUrl = systemCreds.baseUrl;
      apiKey = systemCreds.apiKey;
      sessionName = connection.session_name;
    }
    
    // Fetch groups from WAHA
    console.log('[Groups] Fetching from:', `${baseUrl}/api/${sessionName}/groups`);
    
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
    
    console.log('[Groups] Raw response sample:', JSON.stringify(response.data).substring(0, 1000));
    
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
        name: name || 'קבוצה ללא שם',
        participants: participants.length,
        // Keep WAHA fields for the modal
        JID: jid,
        Name: name || 'קבוצה ללא שם',
        Participants: participants,
      };
    }).sort((a, b) => a.name.localeCompare(b.name, 'he')); // Sort alphabetically in Hebrew
    
    console.log('[Groups] Formatted', groups.length, 'groups');
    if (groups.length > 0) {
      console.log('[Groups] Sample group:', JSON.stringify(groups[0]));
    }
    
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
