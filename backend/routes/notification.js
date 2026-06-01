const express = require('express');
const router = express.Router();
const { authenticateUser } = require('../middleware/authMiddleware');
const Notification = require('../models/Notification');
const { serializeNotifications } = require('../utils/notificationSerializer');

// Get user notifications with pagination
router.get('/', authenticateUser, async (req, res) => {
  try {
    const { page = 1, limit = 20, unreadOnly = false } = req.query;
    const userId = req.user._id;

    const query = { Notification_userId: userId };
    if (unreadOnly === 'true') {
      query.Notification_read = false;
    }

    const notifications = await Notification.find(query)
      .populate('Notification_fromUserId', 'User_name User_email')
      .populate('Notification_groupId', 'Group_name')
      .sort({ Notification_createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const total = await Notification.countDocuments(query);
    const unreadCount = await Notification.countDocuments({
      Notification_userId: userId,
      Notification_read: false
    });

    res.json({
      notifications: serializeNotifications(notifications),
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalNotifications: total,
        unreadCount
      }
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Mark notification as read
router.patch('/:id/read', authenticateUser, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { 
        _id: req.params.id, 
        Notification_userId: req.user._id 
      },
      { 
        Notification_read: true,
        Notification_updatedAt: new Date()
      },
      { returnDocument: 'after' }
    );

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ message: 'Notification marked as read', notification });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// Mark all notifications as read
router.patch('/mark-all-read', authenticateUser, async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { 
        Notification_userId: req.user._id,
        Notification_read: false
      },
      { 
        Notification_read: true,
        Notification_updatedAt: new Date()
      }
    );

    res.json({ 
      message: 'All notifications marked as read',
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

// Delete notification
router.delete('/:id', authenticateUser, async (req, res) => {
  try {
    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      Notification_userId: req.user._id
    });

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ message: 'Notification deleted successfully' });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

// Get unread count
router.get('/unread-count', authenticateUser, async (req, res) => {
  try {
    const unreadCount = await Notification.countDocuments({
      Notification_userId: req.user._id,
      Notification_read: false
    });

    res.json({ unreadCount });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

module.exports = router;
