const pool = require('../../config/database');
const { checkBotAccess } = require('./list.controller');
const { checkLimit } = require('../subscriptions/subscriptions.controller');

/**
 * Create new bot
 */
async function createBot(req, res) {
  try {
    const userId = req.user.id;
    const { name, description } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'נדרש שם לבוט' });
    }
    
    // Check if user has any disabled bots
    const disabledBotsResult = await pool.query(
      'SELECT COUNT(*) as count FROM bots WHERE user_id = $1 AND is_active = false',
      [userId]
    );
    const hasDisabledBots = parseInt(disabledBotsResult.rows[0]?.count || 0) > 0;
    
    if (hasDisabledBots) {
      return res.status(400).json({ 
        error: 'לא ניתן ליצור בוט חדש כשיש לך בוט כבוי. הפעל או מחק את הבוט הכבוי לפני יצירת בוט חדש.',
        code: 'HAS_DISABLED_BOT',
        hasDisabledBots: true
      });
    }
    
    // Check bot limit (includes own bots + edit shares)
    const botsLimit = await checkLimit(userId, 'bots');
    if (!botsLimit.allowed) {
      return res.status(400).json({ 
        error: `הגעת למגבלת הבוטים (${botsLimit.limit}). שדרג את החבילה שלך או מחק בוט קיים.`,
        code: 'BOTS_LIMIT_REACHED',
        limit: botsLimit.limit,
        used: botsLimit.used
      });
    }
    
    const result = await pool.query(
      `INSERT INTO bots (user_id, name, description)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [userId, name, description || '']
    );
    
    res.status(201).json({ bot: result.rows[0] });
  } catch (error) {
    console.error('Create bot error:', error);
    res.status(500).json({ error: 'שגיאה ביצירת בוט' });
  }
}

/**
 * Update bot details
 */
async function updateBot(req, res) {
  try {
    const userId = req.user.id;
    const { botId } = req.params;
    const { name, description, is_active } = req.body;
    
    // Check access
    const access = await checkBotAccess(userId, botId);
    
    if (!access.hasAccess) {
      return res.status(404).json({ error: 'בוט לא נמצא' });
    }
    
    const canEdit = access.isOwner || access.permission === 'edit' || access.permission === 'admin';
    if (!canEdit) {
      return res.status(403).json({ error: 'אין לך הרשאה לערוך בוט זה' });
    }
    
    const result = await pool.query(
      `UPDATE bots SET
         name = COALESCE($1, name),
         description = COALESCE($2, description),
         is_active = COALESCE($3, is_active),
         updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [name, description, is_active, botId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'בוט לא נמצא' });
    }
    
    res.json({ bot: result.rows[0] });
  } catch (error) {
    console.error('Update bot error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון בוט' });
  }
}

/**
 * Save bot flow data
 */
async function saveFlow(req, res) {
  try {
    const userId = req.user.id;
    const { botId } = req.params;
    const { flow_data } = req.body;
    
    // Check access
    const access = await checkBotAccess(userId, botId);
    
    if (!access.hasAccess) {
      return res.status(404).json({ error: 'בוט לא נמצא' });
    }
    
    const canEdit = access.isOwner || access.permission === 'edit' || access.permission === 'admin';
    if (!canEdit) {
      return res.status(403).json({ error: 'אין לך הרשאה לערוך בוט זה' });
    }
    
    const result = await pool.query(
      `UPDATE bots SET flow_data = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [JSON.stringify(flow_data), botId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'בוט לא נמצא' });
    }
    
    res.json({ bot: result.rows[0] });
  } catch (error) {
    console.error('Save flow error:', error);
    res.status(500).json({ error: 'שגיאה בשמירת פלואו' });
  }
}

/**
 * Delete bot
 */
async function deleteBot(req, res) {
  try {
    const userId = req.user.id;
    const { botId } = req.params;
    
    // Check access
    const access = await checkBotAccess(userId, botId);
    
    if (!access.hasAccess) {
      return res.status(404).json({ error: 'בוט לא נמצא' });
    }
    
    // Who can delete:
    // 1. Owner (the client who owns the bot)
    // 2. Admin permission via share
    // 3. Expert who created this bot (isCreator)
    const canDelete = access.isOwner || 
                      access.permission === 'admin' || 
                      (access.isExpert && access.isCreator);
    
    if (!canDelete) {
      return res.status(403).json({ error: 'אין לך הרשאה למחוק בוט זה' });
    }
    
    const result = await pool.query(
      'DELETE FROM bots WHERE id = $1 RETURNING id',
      [botId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'בוט לא נמצא' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete bot error:', error);
    res.status(500).json({ error: 'שגיאה במחיקת בוט' });
  }
}

/**
 * Select which bot to keep after downgrade
 * User must select ONE bot to keep, others will be deleted
 */
async function selectBotToKeep(req, res) {
  try {
    const userId = req.user.id;
    const { botId } = req.params;
    
    // Verify this bot belongs to the user
    const botResult = await pool.query(
      'SELECT id, name, user_id, pending_deletion FROM bots WHERE id = $1 AND user_id = $2',
      [botId, userId]
    );
    
    if (botResult.rows.length === 0) {
      return res.status(404).json({ error: 'בוט לא נמצא' });
    }
    
    // Check if user is in downgrade state (has bots pending deletion)
    const pendingResult = await pool.query(
      'SELECT COUNT(*) as count FROM bots WHERE user_id = $1 AND pending_deletion = true',
      [userId]
    );
    
    const hasPendingBots = parseInt(pendingResult.rows[0]?.count || 0) > 0;
    
    if (!hasPendingBots) {
      return res.status(400).json({ 
        error: 'אין בוטים הממתינים לבחירה',
        code: 'NO_PENDING_BOTS'
      });
    }
    
    // Delete all OTHER bots for this user
    await pool.query(
      'DELETE FROM bots WHERE user_id = $1 AND id != $2',
      [userId, botId]
    );
    
    // Activate the selected bot and clear pending_deletion flag
    await pool.query(
      `UPDATE bots 
       SET is_active = true, pending_deletion = false, updated_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [botId, userId]
    );
    
    // Mark notification as read
    await pool.query(
      `UPDATE notifications 
       SET is_read = true, updated_at = NOW()
       WHERE user_id = $1 AND notification_type = 'subscription_expired' AND is_read = false`,
      [userId]
    );
    
    console.log(`[Bots] User ${userId} selected bot ${botId} to keep after downgrade`);
    
    res.json({ 
      success: true, 
      message: 'הבוט נשמר בהצלחה. שאר הבוטים נמחקו.',
      keptBotId: botId
    });
  } catch (error) {
    console.error('Select bot to keep error:', error);
    res.status(500).json({ error: 'שגיאה בבחירת הבוט' });
  }
}

/**
 * Get user's pending deletion status
 */
async function getPendingDeletionStatus(req, res) {
  try {
    const userId = req.user.id;
    
    const result = await pool.query(
      'SELECT id, name, description, is_active FROM bots WHERE user_id = $1 AND pending_deletion = true',
      [userId]
    );
    
    res.json({
      hasPendingBots: result.rows.length > 0,
      pendingBots: result.rows,
      message: result.rows.length > 0 
        ? 'יש לבחור בוט אחד לשמור. שאר הבוטים יימחקו.'
        : null
    });
  } catch (error) {
    console.error('Get pending deletion status error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת סטטוס' });
  }
}

module.exports = { createBot, updateBot, saveFlow, deleteBot, selectBotToKeep, getPendingDeletionStatus };
