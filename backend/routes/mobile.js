const express = require('express');
const router = express.Router();
const { authenticateUser } = require('../middleware/authMiddleware');
const User = require('../models/User');
const Group = require('../models/Group');
const GroupMember = require('../models/GroupMember');
const Message = require('../models/Message');
const Task = require('../models/Task');
const Note = require('../models/Note');
const File = require('../models/File');
const Notification = require('../models/Notification');
const pushNotificationService = require('../services/pushNotificationService');

// Mobile-optimized pagination endpoint for messages with cursor-based pagination
router.get('/messages/:groupId', authenticateUser, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { limit = 20, cursor, lastSyncTime } = req.query;
    
    // Build query - if lastSyncTime provided, only get newer messages
    const query = { Message_groupId: groupId };
    
    // Cursor-based pagination for efficient loading
    if (cursor) {
      query._id = { $lt: cursor };
    }
    
    // Incremental sync support
    if (lastSyncTime) {
      query.Message_updatedAt = { $gt: new Date(lastSyncTime) };
    }

    const messages = await Message.find(query)
      .populate('Message_sender', 'User_name User_profilePicture')
      .populate('Message_fileId', 'File_originalName File_url File_type File_fileSize')
      .populate('Message_replyTo', 'Message_content Message_sender')
      .sort({ _id: -1 })
      .limit(parseInt(limit) + 1)
      .lean();

    const hasMore = messages.length > parseInt(limit);
    const data = hasMore ? messages.slice(0, -1) : messages;
    const nextCursor = hasMore ? data[data.length - 1]._id : null;

    res.json({
      success: true,
      data,
      pagination: {
        limit: parseInt(limit),
        hasMore,
        nextCursor
      },
      syncTime: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching mobile messages:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch messages' });
  }
});

// Mobile-optimized pagination endpoint for tasks with cursor-based pagination
router.get('/tasks/:groupId', authenticateUser, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { limit = 20, cursor, lastSyncTime, status } = req.query;
    
    const query = { Task_groupId: groupId };
    
    // Cursor-based pagination
    if (cursor) {
      query._id = { $lt: cursor };
    }
    
    // Incremental sync support
    if (lastSyncTime) {
      query.Task_updatedAt = { $gt: new Date(lastSyncTime) };
    }
    
    if (status) {
      query.Task_status = status;
    }

    const tasks = await Task.find(query)
      .populate('Task_createdBy', 'User_name User_profilePicture')
      .populate('Task_assignedTo', 'User_name User_profilePicture')
      .sort({ Task_dueDate: 1, _id: -1 })
      .limit(parseInt(limit) + 1)
      .lean();

    const hasMore = tasks.length > parseInt(limit);
    const data = hasMore ? tasks.slice(0, -1) : tasks;
    const nextCursor = hasMore ? data[data.length - 1]._id : null;

    res.json({
      success: true,
      data,
      pagination: {
        limit: parseInt(limit),
        hasMore,
        nextCursor
      },
      syncTime: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching mobile tasks:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch tasks' });
  }
});

// Mobile-optimized pagination endpoint for notes with cursor-based pagination
router.get('/notes/:groupId', authenticateUser, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { limit = 20, cursor, lastSyncTime, includeContent = false } = req.query;
    
    const query = { Note_groupId: groupId };
    
    // Cursor-based pagination
    if (cursor) {
      query._id = { $lt: cursor };
    }
    
    // Incremental sync support
    if (lastSyncTime) {
      query.Note_updatedAt = { $gt: new Date(lastSyncTime) };
    }

    const selectFields = includeContent === 'true' 
      ? '' 
      : '-Note_content'; // Exclude full content for list view to save bandwidth

    const notes = await Note.find(query)
      .populate('Note_createdBy', 'User_name User_profilePicture')
      .select(selectFields)
      .sort({ _id: -1 })
      .limit(parseInt(limit) + 1)
      .lean();

    const hasMore = notes.length > parseInt(limit);
    const data = hasMore ? notes.slice(0, -1) : notes;
    const nextCursor = hasMore ? data[data.length - 1]._id : null;

    res.json({
      success: true,
      data,
      pagination: {
        limit: parseInt(limit),
        hasMore,
        nextCursor
      },
      syncTime: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching mobile notes:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch notes' });
  }
});

// Mobile-optimized pagination endpoint for files with cursor-based pagination
router.get('/files/:groupId', authenticateUser, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { limit = 20, cursor, lastSyncTime, fileType } = req.query;
    
    const query = { File_groupId: groupId };
    
    // Cursor-based pagination
    if (cursor) {
      query._id = { $lt: cursor };
    }
    
    // Incremental sync support
    if (lastSyncTime) {
      query.File_updatedAt = { $gt: new Date(lastSyncTime) };
    }

    // Filter by file type if specified
    if (fileType) {
      query.File_type = fileType;
    }

    const files = await File.find(query)
      .populate('File_uploadedBy', 'User_name User_profilePicture')
      .select('-File_processedVersions') // Exclude large data to save bandwidth
      .sort({ _id: -1 })
      .limit(parseInt(limit) + 1)
      .lean();

    const hasMore = files.length > parseInt(limit);
    const data = hasMore ? files.slice(0, -1) : files;
    const nextCursor = hasMore ? data[data.length - 1]._id : null;

    res.json({
      success: true,
      data,
      pagination: {
        limit: parseInt(limit),
        hasMore,
        nextCursor
      },
      syncTime: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching mobile files:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch files' });
  }
});

// Enhanced offline sync endpoint - get all updates since last sync with batching
router.post('/sync', authenticateUser, async (req, res) => {
  try {
    const { lastSyncTime, groupIds = [], batchSize = 50 } = req.body;
    const userId = req.user._id;

    if (!lastSyncTime) {
      return res.status(400).json({ 
        success: false, 
        error: 'lastSyncTime is required' 
      });
    }

    const syncDate = new Date(lastSyncTime);
    const updates = {};
    const limit = parseInt(batchSize);

    // Get updated messages
    if (groupIds.length > 0) {
      updates.messages = await Message.find({
        Message_groupId: { $in: groupIds },
        Message_updatedAt: { $gt: syncDate }
      })
      .populate('Message_sender', 'User_name User_profilePicture')
      .populate('Message_fileId', 'File_originalName File_url File_type File_fileSize')
      .sort({ Message_updatedAt: 1 })
      .limit(limit)
      .lean();

      // Get updated tasks
      updates.tasks = await Task.find({
        Task_groupId: { $in: groupIds },
        Task_updatedAt: { $gt: syncDate }
      })
      .populate('Task_createdBy', 'User_name User_profilePicture')
      .populate('Task_assignedTo', 'User_name User_profilePicture')
      .sort({ Task_updatedAt: 1 })
      .limit(limit)
      .lean();

      // Get updated notes (without full content to save bandwidth)
      updates.notes = await Note.find({
        Note_groupId: { $in: groupIds },
        Note_updatedAt: { $gt: syncDate }
      })
      .populate('Note_createdBy', 'User_name User_profilePicture')
      .select('-Note_content')
      .sort({ Note_updatedAt: 1 })
      .limit(limit)
      .lean();

      // Get updated files
      updates.files = await File.find({
        File_groupId: { $in: groupIds },
        File_updatedAt: { $gt: syncDate }
      })
      .populate('File_uploadedBy', 'User_name User_profilePicture')
      .select('-File_processedVersions') // Exclude large data
      .sort({ File_updatedAt: 1 })
      .limit(limit)
      .lean();
    }

    // Get user notifications
    updates.notifications = await Notification.find({
      Notification_userId: userId,
      Notification_createdAt: { $gt: syncDate }
    })
    .populate('Notification_fromUserId', 'User_name User_profilePicture')
    .populate('Notification_groupId', 'Group_name')
    .sort({ Notification_createdAt: 1 })
    .limit(limit)
    .lean();

    // Get user's groups updates
    const userGroups = await Group.find({
      _id: { $in: groupIds },
      Group_updatedAt: { $gt: syncDate }
    })
    .populate('Group_createdBy', 'User_name')
    .lean();

    updates.groups = userGroups;

    // Calculate if there are more updates to sync
    const hasMore = {
      messages: updates.messages?.length === limit,
      tasks: updates.tasks?.length === limit,
      notes: updates.notes?.length === limit,
      files: updates.files?.length === limit,
      notifications: updates.notifications?.length === limit
    };

    // Get counts for client to track progress
    const counts = {
      messages: updates.messages?.length || 0,
      tasks: updates.tasks?.length || 0,
      notes: updates.notes?.length || 0,
      files: updates.files?.length || 0,
      notifications: updates.notifications?.length || 0,
      groups: updates.groups?.length || 0
    };

    res.json({
      success: true,
      data: updates,
      syncTime: new Date().toISOString(),
      hasMore,
      counts,
      nextSyncRecommended: Object.values(hasMore).some(v => v)
    });
  } catch (error) {
    console.error('Error syncing data:', error);
    res.status(500).json({ success: false, error: 'Failed to sync data' });
  }
});

// Get sync status - check what needs to be synced without fetching data
router.post('/sync/status', authenticateUser, async (req, res) => {
  try {
    const { lastSyncTime, groupIds = [] } = req.body;
    const userId = req.user._id;

    if (!lastSyncTime) {
      return res.status(400).json({ 
        success: false, 
        error: 'lastSyncTime is required' 
      });
    }

    const syncDate = new Date(lastSyncTime);
    const pendingCounts = {};

    // Count pending updates
    if (groupIds.length > 0) {
      pendingCounts.messages = await Message.countDocuments({
        Message_groupId: { $in: groupIds },
        Message_updatedAt: { $gt: syncDate }
      });

      pendingCounts.tasks = await Task.countDocuments({
        Task_groupId: { $in: groupIds },
        Task_updatedAt: { $gt: syncDate }
      });

      pendingCounts.notes = await Note.countDocuments({
        Note_groupId: { $in: groupIds },
        Note_updatedAt: { $gt: syncDate }
      });

      pendingCounts.files = await File.countDocuments({
        File_groupId: { $in: groupIds },
        File_updatedAt: { $gt: syncDate }
      });
    }

    pendingCounts.notifications = await Notification.countDocuments({
      Notification_userId: userId,
      Notification_createdAt: { $gt: syncDate }
    });

    pendingCounts.groups = await Group.countDocuments({
      _id: { $in: groupIds },
      Group_updatedAt: { $gt: syncDate }
    });

    const totalPending = Object.values(pendingCounts).reduce((sum, count) => sum + count, 0);

    res.json({
      success: true,
      pendingCounts,
      totalPending,
      syncRequired: totalPending > 0,
      lastSyncTime,
      currentTime: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error checking sync status:', error);
    res.status(500).json({ success: false, error: 'Failed to check sync status' });
  }
});

// Batch upload for offline-created content
router.post('/sync/upload', authenticateUser, async (req, res) => {
  try {
    const { messages = [], tasks = [], notes = [] } = req.body;
    const userId = req.user._id;
    const results = {
      messages: { success: [], failed: [] },
      tasks: { success: [], failed: [] },
      notes: { success: [], failed: [] }
    };

    // Process messages
    for (const msgData of messages) {
      try {
        const message = new Message({
          ...msgData,
          Message_sender: userId,
          Message_createdAt: msgData.createdAt || new Date(),
          Message_updatedAt: new Date()
        });
        await message.save();
        results.messages.success.push({ 
          tempId: msgData.tempId, 
          id: message._id 
        });
      } catch (error) {
        results.messages.failed.push({ 
          tempId: msgData.tempId, 
          error: error.message 
        });
      }
    }

    // Process tasks
    for (const taskData of tasks) {
      try {
        const task = new Task({
          ...taskData,
          Task_createdBy: userId,
          Task_createdAt: taskData.createdAt || new Date(),
          Task_updatedAt: new Date()
        });
        await task.save();
        results.tasks.success.push({ 
          tempId: taskData.tempId, 
          id: task._id 
        });
      } catch (error) {
        results.tasks.failed.push({ 
          tempId: taskData.tempId, 
          error: error.message 
        });
      }
    }

    // Process notes
    for (const noteData of notes) {
      try {
        const note = new Note({
          ...noteData,
          Note_createdBy: userId,
          Note_createdAt: noteData.createdAt || new Date(),
          Note_updatedAt: new Date()
        });
        await note.save();
        results.notes.success.push({ 
          tempId: noteData.tempId, 
          id: note._id 
        });
      } catch (error) {
        results.notes.failed.push({ 
          tempId: noteData.tempId, 
          error: error.message 
        });
      }
    }

    const totalSuccess = results.messages.success.length + 
                        results.tasks.success.length + 
                        results.notes.success.length;
    const totalFailed = results.messages.failed.length + 
                       results.tasks.failed.length + 
                       results.notes.failed.length;

    res.json({
      success: true,
      results,
      summary: {
        totalSuccess,
        totalFailed,
        totalProcessed: totalSuccess + totalFailed
      },
      syncTime: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error uploading offline content:', error);
    res.status(500).json({ success: false, error: 'Failed to upload offline content' });
  }
});

// Register device token for push notifications
router.post('/device-token', authenticateUser, async (req, res) => {
  try {
    const { deviceToken, platform } = req.body;
    const userId = req.user._id;

    if (!deviceToken) {
      return res.status(400).json({ 
        success: false, 
        error: 'Device token is required' 
      });
    }

    // Update user with device token
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Initialize deviceTokens array if it doesn't exist
    if (!user.User_deviceTokens) {
      user.User_deviceTokens = [];
    }

    // Check if token already exists and update it, or add new one
    const existingTokenIndex = user.User_deviceTokens.findIndex(
      token => token.token === deviceToken
    );

    if (existingTokenIndex !== -1) {
      // Update existing token
      user.User_deviceTokens[existingTokenIndex].platform = platform || 'unknown';
      user.User_deviceTokens[existingTokenIndex].registeredAt = new Date();
    } else {
      // Add new token
      user.User_deviceTokens.push({
        token: deviceToken,
        platform: platform || 'unknown',
        registeredAt: new Date()
      });
    }

    await user.save();

    res.json({
      success: true,
      message: 'Device token registered successfully',
      tokenCount: user.User_deviceTokens.length
    });
  } catch (error) {
    console.error('Error registering device token:', error);
    res.status(500).json({ success: false, error: 'Failed to register device token' });
  }
});

// Unregister device token
router.delete('/device-token', authenticateUser, async (req, res) => {
  try {
    const { deviceToken } = req.body;
    const userId = req.user._id;

    if (!deviceToken) {
      return res.status(400).json({ 
        success: false, 
        error: 'Device token is required' 
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Remove token from array
    if (user.User_deviceTokens) {
      user.User_deviceTokens = user.User_deviceTokens.filter(
        t => t.token !== deviceToken
      );
      await user.save();
    }

    res.json({
      success: true,
      message: 'Device token unregistered successfully'
    });
  } catch (error) {
    console.error('Error unregistering device token:', error);
    res.status(500).json({ success: false, error: 'Failed to unregister device token' });
  }
});

// Get notification preferences
router.get('/notification-preferences', authenticateUser, async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId).select('User_notificationPreferences');

    const preferences = user.User_notificationPreferences || {
      push: {
        enabled: true,
        messages: true,
        tasks: true,
        mentions: true,
        groupUpdates: true
      },
      email: {
        enabled: false,
        digest: 'daily'
      }
    };

    res.json({
      success: true,
      data: preferences
    });
  } catch (error) {
    console.error('Error fetching notification preferences:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch preferences' });
  }
});

// Update notification preferences
router.put('/notification-preferences', authenticateUser, async (req, res) => {
  try {
    const userId = req.user._id;
    const { preferences } = req.body;

    const user = await User.findByIdAndUpdate(
      userId,
      { User_notificationPreferences: preferences },
      { returnDocument: 'after' }
    ).select('User_notificationPreferences');

    res.json({
      success: true,
      data: user.User_notificationPreferences,
      message: 'Notification preferences updated successfully'
    });
  } catch (error) {
    console.error('Error updating notification preferences:', error);
    res.status(500).json({ success: false, error: 'Failed to update preferences' });
  }
});

// Test push notification - send a test notification to user's devices
router.post('/push-notification/test', authenticateUser, async (req, res) => {
  try {
    const userId = req.user._id;

    const result = await pushNotificationService.sendToUser(userId, {
      title: 'Test Notification',
      message: 'This is a test notification from your study group app',
      type: 'other',
      priority: 'medium'
    });

    res.json({
      success: true,
      result,
      message: 'Test notification sent'
    });
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({ success: false, error: 'Failed to send test notification' });
  }
});

// Send custom push notification (for admin/testing purposes)
router.post('/push-notification/send', authenticateUser, async (req, res) => {
  try {
    const { recipientIds, title, message, type, groupId, priority } = req.body;

    if (!recipientIds || !Array.isArray(recipientIds) || recipientIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'recipientIds array is required'
      });
    }

    if (!title || !message) {
      return res.status(400).json({
        success: false,
        error: 'title and message are required'
      });
    }

    const result = await pushNotificationService.sendToUsers(recipientIds, {
      title,
      message,
      type: type || 'other',
      groupId,
      priority: priority || 'medium'
    });

    res.json({
      success: true,
      result,
      message: 'Push notifications sent'
    });
  } catch (error) {
    console.error('Error sending push notifications:', error);
    res.status(500).json({ success: false, error: 'Failed to send push notifications' });
  }
});

// Get push notification service status
router.get('/push-notification/status', authenticateUser, async (req, res) => {
  try {
    const isAvailable = pushNotificationService.isAvailable();
    const userId = req.user._id;
    
    const user = await User.findById(userId).select('User_deviceTokens User_notificationPreferences');
    const deviceCount = user?.User_deviceTokens?.length || 0;
    const preferences = user?.User_notificationPreferences || {};

    res.json({
      success: true,
      data: {
        serviceAvailable: isAvailable,
        deviceTokensRegistered: deviceCount,
        preferences,
        pushEnabled: preferences.push?.enabled !== false
      }
    });
  } catch (error) {
    console.error('Error getting push notification status:', error);
    res.status(500).json({ success: false, error: 'Failed to get notification status' });
  }
});

// Location-based features
const locationService = require('../services/locationService');

// Update user location
router.post('/location', authenticateUser, async (req, res) => {
  try {
    const { latitude, longitude, locationString, privacy } = req.body;
    const userId = req.user._id;

    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Latitude and longitude are required'
      });
    }

    const result = await locationService.updateUserLocation(userId, {
      latitude,
      longitude,
      locationString,
      privacy
    });

    res.json(result);
  } catch (error) {
    console.error('Error updating location:', error);
    res.status(500).json({ success: false, error: 'Failed to update location' });
  }
});

// Get user's current location settings
router.get('/location', authenticateUser, async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId).select('User_coordinates User_location User_locationPrivacy');

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({
      success: true,
      data: {
        coordinates: user.User_coordinates?.coordinates || null,
        locationString: user.User_location || '',
        privacy: user.User_locationPrivacy || 'private'
      }
    });
  } catch (error) {
    console.error('Error fetching location:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch location' });
  }
});

// Find nearby users
router.get('/location/nearby-users', authenticateUser, async (req, res) => {
  try {
    const userId = req.user._id;
    const { maxDistance = 10000, limit = 20 } = req.query;

    const result = await locationService.getNearbyUsers(
      userId,
      parseInt(maxDistance),
      parseInt(limit)
    );

    res.json(result);
  } catch (error) {
    console.error('Error finding nearby users:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to find nearby users' 
    });
  }
});

// Find nearby study groups
router.get('/location/nearby-groups', authenticateUser, async (req, res) => {
  try {
    const userId = req.user._id;
    const { maxDistance = 10000, limit = 20 } = req.query;

    const result = await locationService.findNearbyGroups(
      userId,
      parseInt(maxDistance),
      parseInt(limit)
    );

    res.json(result);
  } catch (error) {
    console.error('Error finding nearby groups:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to find nearby groups' 
    });
  }
});

// Get proximity-based study group suggestions
router.get('/location/suggested-groups', authenticateUser, async (req, res) => {
  try {
    const userId = req.user._id;
    const { maxDistance = 10000, limit = 10 } = req.query;

    const result = await locationService.getSuggestedGroups(
      userId,
      parseInt(maxDistance),
      parseInt(limit)
    );

    res.json(result);
  } catch (error) {
    console.error('Error getting group suggestions:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to get group suggestions' 
    });
  }
});

// Update location privacy settings
router.put('/location/privacy', authenticateUser, async (req, res) => {
  try {
    const { privacy } = req.body;
    const userId = req.user._id;

    if (!['public', 'friends', 'private'].includes(privacy)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid privacy setting. Must be: public, friends, or private'
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { User_locationPrivacy: privacy },
      { returnDocument: 'after' }
    ).select('User_locationPrivacy');

    res.json({
      success: true,
      data: { privacy: user.User_locationPrivacy },
      message: 'Location privacy updated successfully'
    });
  } catch (error) {
    console.error('Error updating location privacy:', error);
    res.status(500).json({ success: false, error: 'Failed to update privacy settings' });
  }
});

module.exports = router;
