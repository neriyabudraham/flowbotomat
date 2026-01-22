const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const { 
  getNotifications, 
  markRead, 
  markAllRead, 
  markSelectedRead,
  deleteNotification,
  getUnread,
  checkUsage
} = require('../controllers/notifications/notifications.controller');

// All routes require authentication
router.use(authMiddleware);

// Get all notifications
router.get('/', getNotifications);

// Get unread count only
router.get('/unread', getUnread);

// Check usage and trigger alerts
router.post('/check-usage', checkUsage);

// Mark single notification as read
router.patch('/:notificationId/read', markRead);

// Mark selected notifications as read
router.patch('/read-selected', markSelectedRead);

// Mark all notifications as read
router.patch('/read-all', markAllRead);

// Delete notification
router.delete('/:notificationId', deleteNotification);

module.exports = router;
