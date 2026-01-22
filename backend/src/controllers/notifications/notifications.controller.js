const { 
  getUserNotifications, 
  markNotificationRead, 
  markAllNotificationsRead, 
  markSelectedNotificationsRead,
  deleteUserNotification,
  getUnreadCount,
  checkUserUsage
} = require('../../services/usageAlerts.service');

/**
 * Get user notifications
 */
async function getNotifications(req, res) {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 20;
    
    const notifications = await getUserNotifications(userId, limit);
    const unreadCount = await getUnreadCount(userId);
    
    res.json({ 
      notifications,
      unreadCount 
    });
  } catch (error) {
    console.error('[Notifications] Get error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת התראות' });
  }
}

/**
 * Mark notification as read
 */
async function markRead(req, res) {
  try {
    const userId = req.user.id;
    const { notificationId } = req.params;
    
    await markNotificationRead(userId, notificationId);
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Notifications] Mark read error:', error);
    res.status(500).json({ error: 'שגיאה בסימון התראה' });
  }
}

/**
 * Mark all notifications as read
 */
async function markAllRead(req, res) {
  try {
    const userId = req.user.id;
    
    await markAllNotificationsRead(userId);
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Notifications] Mark all read error:', error);
    res.status(500).json({ error: 'שגיאה בסימון התראות' });
  }
}

/**
 * Get unread count only
 */
async function getUnread(req, res) {
  try {
    const userId = req.user.id;
    
    const count = await getUnreadCount(userId);
    
    res.json({ unreadCount: count });
  } catch (error) {
    console.error('[Notifications] Get unread error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת כמות התראות' });
  }
}

/**
 * Mark selected notifications as read
 */
async function markSelectedRead(req, res) {
  try {
    const userId = req.user.id;
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'נדרש רשימת IDs' });
    }
    
    await markSelectedNotificationsRead(userId, ids);
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Notifications] Mark selected read error:', error);
    res.status(500).json({ error: 'שגיאה בסימון התראות' });
  }
}

/**
 * Delete notification
 */
async function deleteNotification(req, res) {
  try {
    const userId = req.user.id;
    const { notificationId } = req.params;
    
    await deleteUserNotification(userId, notificationId);
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Notifications] Delete error:', error);
    res.status(500).json({ error: 'שגיאה במחיקת התראה' });
  }
}

/**
 * Check usage and trigger alerts if needed
 */
async function checkUsage(req, res) {
  try {
    const userId = req.user.id;
    
    await checkUserUsage(userId);
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Notifications] Check usage error:', error);
    res.status(500).json({ error: 'שגיאה בבדיקת שימוש' });
  }
}

module.exports = {
  getNotifications,
  markRead,
  markAllRead,
  markSelectedRead,
  deleteNotification,
  getUnread,
  checkUsage
};
