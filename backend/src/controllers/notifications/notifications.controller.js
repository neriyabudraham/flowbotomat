const db = require('../../config/database');

/**
 * Get user notifications
 */
async function getNotifications(req, res) {
  try {
    const userId = req.user.id;
    const { limit = 20, offset = 0, unread_only = false } = req.query;
    
    let whereClause = 'WHERE n.user_id = $1';
    if (unread_only === 'true') {
      whereClause += ' AND n.is_read = FALSE';
    }
    
    const result = await db.query(
      `SELECT n.*, 
        b.name as bot_name,
        u.name as related_user_name, u.email as related_user_email
       FROM notifications n
       LEFT JOIN bots b ON n.related_bot_id = b.id
       LEFT JOIN users u ON n.related_user_id = u.id
       ${whereClause}
       ORDER BY n.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, parseInt(limit), parseInt(offset)]
    );
    
    // Get unread count
    const unreadCount = await db.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = FALSE',
      [userId]
    );
    
    res.json({
      notifications: result.rows,
      unread_count: parseInt(unreadCount.rows[0].count),
    });
  } catch (error) {
    console.error('[Notifications] Get error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת התראות' });
  }
}

/**
 * Mark notification as read
 */
async function markAsRead(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    await db.query(
      'UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Notifications] Mark read error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון' });
  }
}

/**
 * Mark all as read
 */
async function markAllAsRead(req, res) {
  try {
    const userId = req.user.id;
    
    await db.query(
      'UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE user_id = $1 AND is_read = FALSE',
      [userId]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Notifications] Mark all read error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון' });
  }
}

/**
 * Delete notification
 */
async function deleteNotification(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    await db.query(
      'DELETE FROM notifications WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Notifications] Delete error:', error);
    res.status(500).json({ error: 'שגיאה במחיקה' });
  }
}

/**
 * Get notification preferences
 */
async function getPreferences(req, res) {
  try {
    const userId = req.user.id;
    
    let result = await db.query(
      'SELECT * FROM notification_preferences WHERE user_id = $1',
      [userId]
    );
    
    // Create default preferences if not exists
    if (result.rows.length === 0) {
      result = await db.query(
        `INSERT INTO notification_preferences (user_id) VALUES ($1) RETURNING *`,
        [userId]
      );
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('[Notifications] Get preferences error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת הגדרות' });
  }
}

/**
 * Update notification preferences
 */
async function updatePreferences(req, res) {
  try {
    const userId = req.user.id;
    const preferences = req.body;
    
    // Build update query
    const allowedFields = [
      'email_share_received', 'email_bot_errors', 'email_quota_warnings', 'email_weekly_digest',
      'app_share_received', 'app_bot_activity', 'app_system_updates'
    ];
    
    const updates = [];
    const values = [userId];
    let paramIndex = 2;
    
    for (const field of allowedFields) {
      if (preferences[field] !== undefined) {
        updates.push(`${field} = $${paramIndex++}`);
        values.push(preferences[field]);
      }
    }
    
    if (updates.length === 0) {
      return res.json({ success: true });
    }
    
    updates.push('updated_at = NOW()');
    
    await db.query(
      `INSERT INTO notification_preferences (user_id) VALUES ($1) 
       ON CONFLICT (user_id) DO UPDATE SET ${updates.join(', ')}`,
      values
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Notifications] Update preferences error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון הגדרות' });
  }
}

/**
 * Create a notification (internal use)
 */
async function createNotification(userId, type, title, message, options = {}) {
  try {
    const { botId, relatedUserId, metadata, actionUrl } = options;
    
    await db.query(
      `INSERT INTO notifications (user_id, type, title, message, related_bot_id, related_user_id, metadata, action_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [userId, type, title, message, botId || null, relatedUserId || null, JSON.stringify(metadata || {}), actionUrl || null]
    );
    
    console.log(`[Notifications] Created: ${type} for user ${userId}`);
    return true;
  } catch (error) {
    console.error('[Notifications] Create error:', error);
    return false;
  }
}

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getPreferences,
  updatePreferences,
  createNotification,
};
