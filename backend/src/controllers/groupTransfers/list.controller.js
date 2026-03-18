const db = require('../../config/database');
const { checkLimit } = require('../subscriptions/subscriptions.controller');
const { getWahaCredentialsForConnection } = require('../../services/settings/system.service');
const axios = require('axios');

/**
 * List all group transfers for the current user
 */
async function listGroupTransfers(req, res) {
  try {
    const userId = req.user.id;
    
    const result = await db.query(`
      SELECT 
        gt.*,
        (SELECT COUNT(*) FROM group_transfer_targets WHERE transfer_id = gt.id AND is_active = true) as target_count,
        (SELECT COUNT(*) FROM transfer_authorized_senders WHERE transfer_id = gt.id) as sender_count
      FROM group_transfers gt
      WHERE gt.user_id = $1
      ORDER BY gt.created_at DESC
    `, [userId]);
    
    res.json({
      success: true,
      transfers: result.rows
    });
  } catch (error) {
    console.error('[GroupTransfers] List error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת העברות' });
  }
}

/**
 * Get a single group transfer with all details
 */
async function getGroupTransfer(req, res) {
  try {
    const userId = req.user.id;
    const { transferId } = req.params;
    
    // Get transfer details
    const transferResult = await db.query(`
      SELECT * FROM group_transfers 
      WHERE id = $1 AND user_id = $2
    `, [transferId, userId]);
    
    if (transferResult.rows.length === 0) {
      return res.status(404).json({ error: 'העברה לא נמצאה' });
    }
    
    const transfer = transferResult.rows[0];
    
    // Get target groups
    const targetsResult = await db.query(`
      SELECT * FROM group_transfer_targets 
      WHERE transfer_id = $1
      ORDER BY sort_order ASC, created_at ASC
    `, [transferId]);
    
    // Get authorized senders
    const sendersResult = await db.query(`
      SELECT * FROM transfer_authorized_senders 
      WHERE transfer_id = $1
      ORDER BY created_at ASC
    `, [transferId]);
    
    res.json({
      success: true,
      transfer: {
        ...transfer,
        targets: targetsResult.rows,
        authorized_senders: sendersResult.rows
      }
    });
  } catch (error) {
    console.error('[GroupTransfers] Get error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת העברה' });
  }
}

/**
 * Get all WhatsApp groups for the current user
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
    
    console.log('[GroupTransfers] Fetching groups from:', `${baseUrl}/api/${sessionName}/groups`);
    
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
    
    const rawGroups = Array.isArray(response.data) ? response.data : (response.data?.groups || response.data?.data || []);
    
    let groups = rawGroups.map(group => {
      const groupId = group.JID || group.id || group.chatId || group.jid;
      return {
        id: groupId,
        name: group.Name || group.name || group.subject || group.groupName || groupId?.replace('@g.us', '') || groupId,
        participants_count: group.Participants?.length || group.participants?.length || group.ParticipantCount || 0,
        image_url: group.profilePicture || group.picture || null
      };
    });
    
    if (search) {
      const searchLower = search.toLowerCase();
      groups = groups.filter(g => 
        g.name?.toLowerCase().includes(searchLower) ||
        g.id?.includes(search)
      );
    }
    
    groups.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'he'));
    
    console.log('[GroupTransfers] Found', groups.length, 'groups');
    
    res.json({
      success: true,
      groups
    });
  } catch (error) {
    console.error('[GroupTransfers] Get groups error:', error.message);
    res.status(500).json({ 
      error: 'שגיאה בטעינת קבוצות',
      groups: [],
      details: error.message
    });
  }
}

/**
 * Check user's limit for group transfers
 */
async function checkGroupTransferLimit(req, res) {
  try {
    const userId = req.user.id;
    
    // Use same limits as group forwards for now
    const featureCheck = await checkLimit(userId, 'allow_group_forwards');
    if (!featureCheck.allowed) {
      return res.json({
        success: true,
        allowed: false,
        featureDisabled: true,
        limit: 0,
        used: 0,
        message: 'התוכנית שלך לא כוללת העברת הודעות בין קבוצות'
      });
    }
    
    // Count user's transfers
    const countResult = await db.query(
      'SELECT COUNT(*) as count FROM group_transfers WHERE user_id = $1',
      [userId]
    );
    const used = parseInt(countResult.rows[0].count) || 0;
    
    // Get max limit from subscription
    const limitCheck = await checkLimit(userId, 'max_group_forwards');
    
    const targetLimit = await checkLimit(userId, 'max_forward_targets');
    
    res.json({
      success: true,
      allowed: limitCheck.limit === -1 || used < limitCheck.limit,
      limit: limitCheck.limit,
      used,
      targetLimit: targetLimit.limit
    });
  } catch (error) {
    console.error('[GroupTransfers] Check limit error:', error);
    res.status(500).json({ error: 'שגיאה בבדיקת מגבלות' });
  }
}

module.exports = {
  listGroupTransfers,
  getGroupTransfer,
  getAvailableGroups,
  checkGroupTransferLimit
};
