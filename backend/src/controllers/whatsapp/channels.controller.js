const db = require('../../config/database');
const { decrypt } = require('../../services/crypto/encrypt.service');
const { getWahaCredentials } = require('../../services/settings/system.service');
const axios = require('axios');

async function getChannels(req, res) {
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
      return res.status(404).json({ error: 'לא נמצא חיבור WhatsApp פעיל', channels: [] });
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
    
    // Fetch channels from WAHA
    console.log('[Channels] Fetching from:', `${baseUrl}/api/${sessionName}/channels`);
    
    const response = await axios.get(
      `${baseUrl}/api/${sessionName}/channels`,
      {
        headers: {
          'accept': 'application/json',
          'X-Api-Key': apiKey
        },
        timeout: 30000
      }
    );
    
    console.log('[Channels] Raw response sample:', JSON.stringify(response.data).substring(0, 1000));
    
    // Format channels - WAHA returns array with id, name, description, invite, verified, etc.
    const rawChannels = Array.isArray(response.data) ? response.data : (response.data?.channels || response.data?.data || []);
    
    const channels = rawChannels.map(channel => ({
      id: channel.id || '',
      name: channel.name || 'ערוץ ללא שם',
      description: channel.description || '',
      invite: channel.invite || '',
      picture: channel.picture || channel.preview || '',
      verified: channel.verified || false,
      role: channel.role || 'SUBSCRIBER',
      subscribersCount: channel.subscribersCount || 0,
    })).sort((a, b) => a.name.localeCompare(b.name, 'he')); // Sort alphabetically in Hebrew
    
    console.log('[Channels] Formatted', channels.length, 'channels');
    
    res.json({ channels });
    
  } catch (error) {
    console.error('[Channels] Error fetching channels:', error.message);
    res.status(500).json({ 
      error: 'שגיאה במשיכת ערוצים', 
      channels: [],
      details: error.message 
    });
  }
}

module.exports = { getChannels };
