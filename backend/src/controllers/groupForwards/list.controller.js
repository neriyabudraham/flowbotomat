const db = require('../../config/database');
const { checkLimit } = require('../subscriptions/subscriptions.controller');
const { getWahaCredentialsForConnection } = require('../../services/settings/system.service');
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
    
    // Get authorized senders with denied group counts
    const sendersResult = await db.query(`
      SELECT fas.*,
        (SELECT COUNT(*) FROM forward_sender_group_denied WHERE forward_id = fas.forward_id AND sender_phone = fas.phone_number) as denied_groups_count
      FROM forward_authorized_senders fas
      WHERE fas.forward_id = $1
      ORDER BY fas.created_at ASC
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
    const { baseUrl, apiKey } = await getWahaCredentialsForConnection(connection);
    const sessionName = connection.session_name;
    
    // Fetch groups and channels from WAHA in parallel
    const headers = { 'accept': 'application/json', 'X-Api-Key': apiKey };
    const [groupsResponse, channelsResponse] = await Promise.allSettled([
      axios.get(`${baseUrl}/api/${sessionName}/groups`, { headers, timeout: 10000 }),
      axios.get(`${baseUrl}/api/${sessionName}/channels`, { headers, timeout: 10000 }),
    ]);

    // Format groups
    const rawGroups = groupsResponse.status === 'fulfilled'
      ? (Array.isArray(groupsResponse.value.data) ? groupsResponse.value.data : (groupsResponse.value.data?.groups || groupsResponse.value.data?.data || []))
      : [];

    let groups = rawGroups.map(group => {
      const groupId = group.JID || group.id || group.chatId || group.jid;
      return {
        id: groupId,
        name: group.Name || group.name || group.subject || group.groupName || groupId?.replace('@g.us', '') || groupId,
        participants_count: group.Participants?.length || group.participants?.length || group.ParticipantCount || 0,
        image_url: group.profilePicture || group.picture || null,
        type: 'group',
      };
    });

    // Format channels
    const rawChannels = channelsResponse.status === 'fulfilled'
      ? (Array.isArray(channelsResponse.value.data) ? channelsResponse.value.data : (channelsResponse.value.data?.channels || channelsResponse.value.data?.data || []))
      : [];

    let channels = rawChannels.map(ch => ({
      id: ch.id || '',
      name: ch.name || ch.id?.replace('@newsletter', '') || ch.id || '',
      participants_count: ch.subscribersCount || 0,
      image_url: ch.picture || ch.preview || null,
      type: 'channel',
    }));

    // Filter by search if provided
    if (search) {
      const searchLower = search.toLowerCase();
      groups = groups.filter(g => g.name?.toLowerCase().includes(searchLower) || g.id?.includes(search));
      channels = channels.filter(c => c.name?.toLowerCase().includes(searchLower) || c.id?.includes(search));
    }

    // Sort alphabetically by name in Hebrew
    groups.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'he'));
    channels.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'he'));

    console.log('[GroupForwards] Found', groups.length, 'groups,', channels.length, 'channels');

    res.json({
      success: true,
      groups,
      channels,
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
