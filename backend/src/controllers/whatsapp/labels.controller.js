const db = require('../../config/database');
const { decrypt } = require('../../services/crypto/encrypt.service');
const { getWahaCredentials } = require('../../services/settings/system.service');
const axios = require('axios');

/**
 * Get all WhatsApp Business labels
 */
async function getLabels(req, res) {
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
      return res.status(404).json({ error: 'לא נמצא חיבור WhatsApp פעיל', labels: [] });
    }
    
    const connection = result.rows[0];
    let baseUrl, apiKey, sessionName;
    
    if (connection.connection_type === 'external') {
      baseUrl = decrypt(connection.external_base_url);
      apiKey = decrypt(connection.external_api_key);
      sessionName = connection.session_name;
    } else {
      const systemCreds = await getWahaCredentials();
      baseUrl = systemCreds.baseUrl;
      apiKey = systemCreds.apiKey;
      sessionName = connection.session_name;
    }
    
    // Fetch labels from WAHA
    console.log('[Labels] Fetching from:', `${baseUrl}/api/${sessionName}/labels`);
    
    const response = await axios.get(
      `${baseUrl}/api/${sessionName}/labels`,
      {
        headers: {
          'accept': 'application/json',
          'X-Api-Key': apiKey
        },
        timeout: 10000
      }
    );
    
    console.log('[Labels] Raw response:', JSON.stringify(response.data).substring(0, 500));
    
    // Format labels
    const rawLabels = Array.isArray(response.data) ? response.data : (response.data?.labels || []);
    
    const labels = rawLabels.map(label => ({
      id: label.id?.toString() || label.labelId?.toString(),
      name: label.name || label.displayName || `תווית ${label.id}`,
      color: label.color || label.hexColor || null,
    }));
    
    console.log('[Labels] Formatted', labels.length, 'labels');
    
    res.json({ labels });
    
  } catch (error) {
    console.error('[Labels] Error fetching labels:', error.message);
    // Return empty array instead of error for non-business accounts
    res.json({ 
      labels: [],
      warning: 'תוויות זמינות רק ב-WhatsApp Business'
    });
  }
}

module.exports = { getLabels };
