const pool = require('../../config/database');

/**
 * Check if user has access to a bot (owner, shared, or expert)
 */
async function checkBotAccess(userId, botId) {
  // Check ownership
  const ownerCheck = await pool.query(
    'SELECT user_id FROM bots WHERE id = $1',
    [botId]
  );
  
  if (ownerCheck.rows.length === 0) {
    return { hasAccess: false, isOwner: false, permission: null, botOwnerId: null };
  }
  
  const botOwnerId = ownerCheck.rows[0].user_id;
  
  if (botOwnerId === userId) {
    return { hasAccess: true, isOwner: true, permission: 'owner', botOwnerId };
  }
  
  // Check bot share
  const shareCheck = await pool.query(
    `SELECT permission FROM bot_shares 
     WHERE bot_id = $1 AND shared_with_id = $2 
     AND (expires_at IS NULL OR expires_at > NOW())`,
    [botId, userId]
  );
  
  if (shareCheck.rows.length > 0) {
    return { hasAccess: true, isOwner: false, permission: shareCheck.rows[0].permission, botOwnerId };
  }
  
  // Check expert access
  const expertCheck = await pool.query(
    `SELECT can_view_bots, can_edit_bots FROM expert_clients 
     WHERE expert_id = $1 AND client_id = $2 AND is_active = true`,
    [userId, botOwnerId]
  );
  
  if (expertCheck.rows.length > 0 && expertCheck.rows[0].can_view_bots) {
    const permission = expertCheck.rows[0].can_edit_bots ? 'edit' : 'view';
    return { hasAccess: true, isOwner: false, permission, botOwnerId, isExpert: true };
  }
  
  return { hasAccess: false, isOwner: false, permission: null, botOwnerId };
}

/**
 * List all bots for user
 */
async function listBots(req, res) {
  try {
    const userId = req.user.id;
    
    const result = await pool.query(
      `SELECT id, name, description, is_active, created_at, updated_at
       FROM bots WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [userId]
    );
    
    res.json({ bots: result.rows });
  } catch (error) {
    console.error('List bots error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת בוטים' });
  }
}

/**
 * Get single bot with flow data
 */
async function getBot(req, res) {
  try {
    const userId = req.user.id;
    const { botId } = req.params;
    
    // Check access
    const access = await checkBotAccess(userId, botId);
    
    if (!access.hasAccess) {
      return res.status(404).json({ error: 'בוט לא נמצא' });
    }
    
    const result = await pool.query(
      'SELECT * FROM bots WHERE id = $1',
      [botId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'בוט לא נמצא' });
    }
    
    res.json({ 
      bot: result.rows[0],
      access: {
        isOwner: access.isOwner,
        permission: access.permission,
        canEdit: access.isOwner || access.permission === 'edit' || access.permission === 'admin',
      }
    });
  } catch (error) {
    console.error('Get bot error:', error);
    res.status(500).json({ error: 'שגיאה' });
  }
}

module.exports = { listBots, getBot, checkBotAccess };
