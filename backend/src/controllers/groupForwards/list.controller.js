const db = require('../../config/database');
const { checkLimit } = require('../subscriptions/subscriptions.controller');
const { decrypt } = require('../../services/crypto/encrypt.service');
const { getWahaCredentials } = require('../../services/settings/system.service');
const axios = require('axios');

/**
 * List all group forwards for the current user
 */
async function listGroupForwards(req, res) {
  try {
    const userId = req.user.id;
    
    const result = await db.query(`
      SELECT 
        gf.*,
        (SELECT COUNT(*) FROM group_forward_targets WHERE forward_id = gf.id AND is_active = true) as target_count,
        (SELECT COUNT(*) FROM forward_authorized_senders WHERE forward_id = gf.id) as sender_count
      FROM group_forwards gf
      WHERE gf.user_id = $1
      ORDER BY gf.created_at DESC
    `, [userId]);
    
    res.json({
      success: true,
      forwards: result.rows
    });
  } catch (error) {
    console.error('[GroupForwards] List error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת העברות' });
  }
}

/**
 * Get a single group forward with all details
 */
async function getGroupForward(req, res) {
  try {
    const userId = req.user.id;
    const { forwardId } = req.params;
    
    // Get forward details
    const forwardResult = await db.query(`
      SELECT * FROM group_forwards 
      WHERE id = $1 AND user_id = $2
    `, [forwardId, userId]);
    
    if (forwardResult.rows.length === 0) {
      return res.status(404).json({ error: 'העברה לא נמצאה' });
    }
    
    const forward = forwardResult.rows[0];
    
    // Get target groups
    const targetsResult = await db.query(`
      SELECT * FROM group_forward_targets 
      WHERE forward_id = $1
      ORDER BY sort_order ASC, created_at ASC
    `, [forwardId]);
    
    // Get authorized senders
    const sendersResult = await db.query(`
      SELECT * FROM forward_authorized_senders 
      WHERE forward_id = $1
      ORDER BY created_at ASC
    `, [forwardId]);
    
    res.json({
      success: true,
      forward: {
        ...forward,
        targets: targetsResult.rows,
        authorized_senders: sendersResult.rows
      }
    });
  } catch (error) {
    console.error('[GroupForwards] Get error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת העברה' });
  }
}

/**
 * Get all WhatsApp groups for the current user
 * Using the same approach as whatsapp/groups.controller.js
 */
async function getAvailableGroups(req, res) {
  try {
    const userId = req.user.id;
    const { search } = req.query;
    
    // Get user's WhatsApp connection
    const result = await db.query(
      `SELECT * FROM whatsapp_connections 
       WHERE user_id = $1 AND status = 'connected' 
       ORDER BY connected_at DESC LIMIT 1`,
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(400).json({ 
        error: 'לא נמצא חיבור WhatsApp פעיל',
        code: 'NO_WHATSAPP_CONNECTION',
        groups: []
      });
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
      const systemCreds = getWahaCredentials();
      baseUrl = systemCreds.baseUrl;
      apiKey = systemCreds.apiKey;
      sessionName = connection.session_name;
    }
    
    // Fetch groups from WAHA
    console.log('[GroupForwards] Fetching groups from:', `${baseUrl}/api/${sessionName}/groups`);
    
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
    
    // Format groups - handle WAHA response format
    const rawGroups = Array.isArray(response.data) ? response.data : (response.data?.groups || response.data?.data || []);
    
    let groups = rawGroups.map(group => ({
      id: group.JID || group.id || group.chatId || group.jid,
      name: group.Name || group.name || group.subject || group.groupName || 'קבוצה ללא שם',
      participants_count: group.Participants?.length || group.participants?.length || group.ParticipantCount || 0,
      image_url: group.profilePicture || group.picture || null
    }));
    
    // Filter by search if provided
    if (search) {
      const searchLower = search.toLowerCase();
      groups = groups.filter(g => 
        g.name?.toLowerCase().includes(searchLower) ||
        g.id?.includes(search)
      );
    }
    
    // Sort alphabetically by name in Hebrew
    groups.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'he'));
    
    console.log('[GroupForwards] Found', groups.length, 'groups');
    
    res.json({
      success: true,
      groups
    });
  } catch (error) {
    console.error('[GroupForwards] Get groups error:', error.message);
    res.status(500).json({ 
      error: 'שגיאה בטעינת קבוצות',
      groups: [],
      details: error.message
    });
  }
}

/**
 * Check user's limit for group forwards
 */
async function checkGroupForwardLimit(req, res) {
  try {
    const userId = req.user.id;
    
    // First check if feature is allowed
    const featureCheck = await checkLimit(userId, 'allow_group_forwards');
    if (!featureCheck.allowed) {
      return res.json({
        success: true,
        allowed: false,
        featureDisabled: true,
        limit: 0,
        used: 0,
        message: 'התוכנית שלך לא כוללת העברת הודעות לקבוצות'
      });
    }
    
    // Check the numeric limit
    const limitCheck = await checkLimit(userId, 'max_group_forwards');
    
    // Also get target limit for info
    const targetLimit = await checkLimit(userId, 'max_forward_targets');
    
    res.json({
      success: true,
      ...limitCheck,
      targetLimit: targetLimit.limit
    });
  } catch (error) {
    console.error('[GroupForwards] Check limit error:', error);
    res.status(500).json({ error: 'שגיאה בבדיקת מגבלות' });
  }
}

module.exports = {
  listGroupForwards,
  getGroupForward,
  getAvailableGroups,
  checkGroupForwardLimit
};
