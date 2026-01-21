const db = require('../../config/database');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

/**
 * Get all shares for a bot (as owner)
 */
async function getBotShares(req, res) {
  try {
    const { botId } = req.params;
    const userId = req.user.id;
    
    // Verify ownership
    const bot = await db.query(
      'SELECT id, user_id FROM bots WHERE id = $1',
      [botId]
    );
    
    if (bot.rows.length === 0) {
      return res.status(404).json({ error: 'בוט לא נמצא' });
    }
    
    if (bot.rows[0].user_id !== userId) {
      return res.status(403).json({ error: 'אין לך הרשאה לבוט זה' });
    }
    
    // Get shares
    const shares = await db.query(
      `SELECT bs.*, u.email, u.name 
       FROM bot_shares bs
       JOIN users u ON bs.shared_with_id = u.id
       WHERE bs.bot_id = $1
       ORDER BY bs.created_at DESC`,
      [botId]
    );
    
    // Get pending invitations
    const invitations = await db.query(
      `SELECT * FROM share_invitations 
       WHERE bot_id = $1 AND status = 'pending' AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [botId]
    );
    
    res.json({
      shares: shares.rows,
      invitations: invitations.rows,
    });
  } catch (error) {
    console.error('[Sharing] Get shares error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת שיתופים' });
  }
}

/**
 * Get bots shared with me
 */
async function getSharedWithMe(req, res) {
  try {
    const userId = req.user.id;
    
    const result = await db.query(
      `SELECT b.*, bs.permission, bs.allow_export, u.email as owner_email, u.name as owner_name
       FROM bot_shares bs
       JOIN bots b ON bs.bot_id = b.id
       JOIN users u ON bs.owner_id = u.id
       WHERE bs.shared_with_id = $1
       AND (bs.expires_at IS NULL OR bs.expires_at > NOW())
       ORDER BY bs.created_at DESC`,
      [userId]
    );
    
    res.json({ bots: result.rows });
  } catch (error) {
    console.error('[Sharing] Get shared with me error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת בוטים משותפים' });
  }
}

/**
 * Share a bot with a user (by email)
 */
async function shareBot(req, res) {
  try {
    const { botId } = req.params;
    const { email, permission = 'view', allow_export = false } = req.body;
    const userId = req.user.id;
    
    if (!email) {
      return res.status(400).json({ error: 'נדרש מייל' });
    }
    
    // Verify ownership
    const bot = await db.query(
      'SELECT id, user_id, name FROM bots WHERE id = $1',
      [botId]
    );
    
    if (bot.rows.length === 0) {
      return res.status(404).json({ error: 'בוט לא נמצא' });
    }
    
    if (bot.rows[0].user_id !== userId) {
      return res.status(403).json({ error: 'אין לך הרשאה לשתף בוט זה' });
    }
    
    // Find user by email
    const targetUser = await db.query(
      'SELECT id, email FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    
    if (targetUser.rows.length === 0) {
      // User doesn't exist - create invitation
      const inviteToken = crypto.randomBytes(32).toString('hex');
      
      await db.query(
        `INSERT INTO share_invitations (bot_id, inviter_id, invite_email, invite_token, permission, allow_export)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (invite_token) DO NOTHING`,
        [botId, userId, email.toLowerCase(), inviteToken, permission, allow_export]
      );
      
      // TODO: Send invitation email
      
      return res.json({
        success: true,
        type: 'invitation',
        message: `הזמנה נשלחה ל-${email}`,
      });
    }
    
    const targetUserId = targetUser.rows[0].id;
    
    // Can't share with yourself
    if (targetUserId === userId) {
      return res.status(400).json({ error: 'לא ניתן לשתף עם עצמך' });
    }
    
    // Check if already shared
    const existingShare = await db.query(
      'SELECT id FROM bot_shares WHERE bot_id = $1 AND shared_with_id = $2',
      [botId, targetUserId]
    );
    
    if (existingShare.rows.length > 0) {
      // Update permission and allow_export
      await db.query(
        'UPDATE bot_shares SET permission = $1, allow_export = $2, updated_at = NOW() WHERE bot_id = $3 AND shared_with_id = $4',
        [permission, allow_export, botId, targetUserId]
      );
      
      return res.json({
        success: true,
        type: 'updated',
        message: 'הרשאות עודכנו',
      });
    }
    
    // Create share
    await db.query(
      `INSERT INTO bot_shares (bot_id, owner_id, shared_with_id, permission, allow_export)
       VALUES ($1, $2, $3, $4, $5)`,
      [botId, userId, targetUserId, permission, allow_export]
    );
    
    res.json({
      success: true,
      type: 'shared',
      message: `הבוט שותף עם ${email}`,
    });
  } catch (error) {
    console.error('[Sharing] Share bot error:', error);
    res.status(500).json({ error: 'שגיאה בשיתוף' });
  }
}

/**
 * Update share permission or allow_export
 */
async function updateShare(req, res) {
  try {
    const { shareId } = req.params;
    const { permission, allow_export } = req.body;
    const userId = req.user.id;
    
    // Verify ownership
    const share = await db.query(
      'SELECT * FROM bot_shares WHERE id = $1',
      [shareId]
    );
    
    if (share.rows.length === 0) {
      return res.status(404).json({ error: 'שיתוף לא נמצא' });
    }
    
    if (share.rows[0].owner_id !== userId) {
      return res.status(403).json({ error: 'אין לך הרשאה' });
    }
    
    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramIndex = 1;
    
    if (permission !== undefined) {
      updates.push(`permission = $${paramIndex++}`);
      values.push(permission);
    }
    
    if (allow_export !== undefined) {
      updates.push(`allow_export = $${paramIndex++}`);
      values.push(allow_export);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'לא נשלחו פרמטרים לעדכון' });
    }
    
    updates.push('updated_at = NOW()');
    values.push(shareId);
    
    await db.query(
      `UPDATE bot_shares SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Sharing] Update share error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון' });
  }
}

/**
 * Remove share
 */
async function removeShare(req, res) {
  try {
    const { shareId } = req.params;
    const userId = req.user.id;
    
    // Verify ownership OR the share is with me
    const share = await db.query(
      'SELECT * FROM bot_shares WHERE id = $1',
      [shareId]
    );
    
    if (share.rows.length === 0) {
      return res.status(404).json({ error: 'שיתוף לא נמצא' });
    }
    
    // Owner can remove, or shared user can leave
    if (share.rows[0].owner_id !== userId && share.rows[0].shared_with_id !== userId) {
      return res.status(403).json({ error: 'אין לך הרשאה' });
    }
    
    await db.query('DELETE FROM bot_shares WHERE id = $1', [shareId]);
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Sharing] Remove share error:', error);
    res.status(500).json({ error: 'שגיאה בהסרת שיתוף' });
  }
}

/**
 * Accept share invitation
 */
async function acceptInvitation(req, res) {
  try {
    const { token } = req.params;
    const userId = req.user.id;
    
    const invitation = await db.query(
      `SELECT * FROM share_invitations 
       WHERE invite_token = $1 AND status = 'pending' AND expires_at > NOW()`,
      [token]
    );
    
    if (invitation.rows.length === 0) {
      return res.status(404).json({ error: 'הזמנה לא נמצאה או פגה תוקף' });
    }
    
    const inv = invitation.rows[0];
    
    // Create share
    await db.query(
      `INSERT INTO bot_shares (bot_id, owner_id, shared_with_id, permission)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (bot_id, shared_with_id) DO UPDATE SET permission = $4`,
      [inv.bot_id, inv.inviter_id, userId, inv.permission]
    );
    
    // Update invitation status
    await db.query(
      `UPDATE share_invitations 
       SET status = 'accepted', accepted_at = NOW(), accepted_by = $1
       WHERE id = $2`,
      [userId, inv.id]
    );
    
    res.json({ success: true, message: 'ההזמנה התקבלה' });
  } catch (error) {
    console.error('[Sharing] Accept invitation error:', error);
    res.status(500).json({ error: 'שגיאה בקבלת הזמנה' });
  }
}

/**
 * Check if user has permission for a bot
 */
async function checkPermission(userId, botId, requiredPermission = 'view') {
  // Check ownership
  const bot = await db.query(
    'SELECT user_id FROM bots WHERE id = $1',
    [botId]
  );
  
  if (bot.rows.length === 0) return false;
  if (bot.rows[0].user_id === userId) return true; // Owner has all permissions
  
  // Check shares
  const share = await db.query(
    `SELECT permission FROM bot_shares 
     WHERE bot_id = $1 AND shared_with_id = $2
     AND (expires_at IS NULL OR expires_at > NOW())`,
    [botId, userId]
  );
  
  if (share.rows.length === 0) return false;
  
  const permissionLevels = { view: 1, edit: 2, admin: 3 };
  return permissionLevels[share.rows[0].permission] >= permissionLevels[requiredPermission];
}

module.exports = {
  getBotShares,
  getSharedWithMe,
  shareBot,
  updateShare,
  removeShare,
  acceptInvitation,
  checkPermission,
};
