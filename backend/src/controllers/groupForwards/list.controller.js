const db = require('../../config/database');
const { checkLimit } = require('../subscriptions/subscriptions.controller');

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
 */
async function getAvailableGroups(req, res) {
  try {
    const userId = req.user.id;
    const { search } = req.query;
    
    // Get user's WhatsApp connection
    const connectionResult = await db.query(`
      SELECT wc.*, ws.session_id, ws.waha_instance_name
      FROM whatsapp_connections wc
      LEFT JOIN waha_sessions ws ON wc.waha_session_id = ws.id
      WHERE wc.user_id = $1 AND wc.status = 'connected'
      LIMIT 1
    `, [userId]);
    
    if (connectionResult.rows.length === 0) {
      return res.status(400).json({ 
        error: 'לא נמצא חיבור וואצטאפ פעיל',
        code: 'NO_WHATSAPP_CONNECTION'
      });
    }
    
    const connection = connectionResult.rows[0];
    
    // Fetch groups from WAHA
    const wahaService = require('../../services/whatsapp/waha.service');
    const groups = await wahaService.getGroups(connection.waha_instance_name || connection.session_id);
    
    // Filter by search if provided
    let filteredGroups = groups;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredGroups = groups.filter(g => 
        g.name?.toLowerCase().includes(searchLower) ||
        g.id?.includes(search)
      );
    }
    
    // Sort alphabetically by name
    filteredGroups.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'he'));
    
    res.json({
      success: true,
      groups: filteredGroups.map(g => ({
        id: g.id,
        name: g.name || g.subject || 'קבוצה ללא שם',
        image_url: g.profilePicUrl || g.picture,
        participants_count: g.participants?.length || g.size || 0
      }))
    });
  } catch (error) {
    console.error('[GroupForwards] Get groups error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת קבוצות' });
  }
}

/**
 * Check user's limit for group forwards
 */
async function checkGroupForwardLimit(req, res) {
  try {
    const userId = req.user.id;
    
    const limitCheck = await checkLimit(userId, 'max_group_forwards');
    
    res.json({
      success: true,
      ...limitCheck
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
