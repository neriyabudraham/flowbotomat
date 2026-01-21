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
        timeout: 10000
      }
    );
    
    console.log('[Groups] Raw response:', JSON.stringify(response.data).substring(0, 500));
    
    // Format groups - handle different WAHA response formats
    const rawGroups = Array.isArray(response.data) ? response.data : (response.data?.groups || response.data?.data || []);
    
    const groups = rawGroups.map(group => ({
      id: group.id || group.chatId || group.jid,
      name: group.name || group.subject || group.groupName || 'קבוצה ללא שם',
      participants: group.participants?.length || group.participantsCount || 0,
    }));
    
    console.log('[Groups] Formatted', groups.length, 'groups');
    
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
