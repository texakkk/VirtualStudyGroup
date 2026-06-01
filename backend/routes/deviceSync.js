const express = require('express');
const router = express.Router();
const { authenticateUser } = require('../middleware/authMiddleware');
const deviceSyncService = require('../services/deviceSyncService');

// @desc    Queue sync operation for user
// @route   POST /api/device-sync/queue
// @access  Private
router.post('/queue', authenticateUser, async (req, res) => {
  try {
    const { syncType = 'full', priority = 'normal' } = req.body;
    const userId = req.user.id;

    const result = await deviceSyncService.queueSync(userId, syncType, priority);

    res.json({
      success: true,
      message: 'Sync operation queued successfully',
      data: result,
    });
  } catch (error) {
    console.error('Error queueing sync operation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to queue sync operation',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// @desc    Force immediate sync for user
// @route   POST /api/device-sync/force
// @access  Private
router.post('/force', authenticateUser, async (req, res) => {
  try {
    const { syncType = 'full' } = req.body;
    const userId = req.user.id;

    const result = await deviceSyncService.forceSync(userId, syncType);

    res.json({
      success: true,
      message: 'Force sync initiated successfully',
      data: result,
    });
  } catch (error) {
    console.error('Error forcing sync operation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to force sync operation',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// @desc    Get sync status for user
// @route   GET /api/device-sync/status
// @access  Private
router.get('/status', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const status = deviceSyncService.getSyncStatus(userId);

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error('Error getting sync status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get sync status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// @desc    Cancel sync operation for user
// @route   DELETE /api/device-sync/cancel
// @access  Private
router.delete('/cancel', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = deviceSyncService.cancelSync(userId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }

    res.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    console.error('Error cancelling sync operation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel sync operation',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// @desc    Get sync statistics (admin only)
// @route   GET /api/device-sync/statistics
// @access  Private (Admin)
router.get('/statistics', authenticateUser, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.User_role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
    }

    const statistics = deviceSyncService.getSyncStatistics();

    res.json({
      success: true,
      data: statistics,
    });
  } catch (error) {
    console.error('Error getting sync statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get sync statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// @desc    Bulk sync for multiple users (admin only)
// @route   POST /api/device-sync/bulk
// @access  Private (Admin)
router.post('/bulk', authenticateUser, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.User_role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
    }

    const { userIds, syncType = 'full', priority = 'normal' } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'User IDs array is required and cannot be empty',
      });
    }

    if (userIds.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 100 users can be synced at once',
      });
    }

    const results = await deviceSyncService.bulkSync(userIds, syncType, priority);

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    res.json({
      success: true,
      message: `Bulk sync completed. ${successCount} successful, ${failureCount} failed.`,
      data: {
        results,
        summary: {
          total: results.length,
          successful: successCount,
          failed: failureCount,
        },
      },
    });
  } catch (error) {
    console.error('Error performing bulk sync:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to perform bulk sync',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// @desc    Get sync history for user
// @route   GET /api/device-sync/history
// @access  Private
router.get('/history', authenticateUser, async (req, res) => {
  try {
    const UserSettings = require('../models/UserSettings');
    const UserPreferences = require('../models/UserPreferences');
    const userId = req.user.id;

    const [userSettings, userPreferences] = await Promise.all([
      UserSettings.findOne({ UserSettings_userId: userId }),
      UserPreferences.findOne({ UserPref_userId: userId })
    ]);

    const history = {
      settings: {
        lastSync: userSettings?.UserSettings_deviceSync?.lastSyncAt || null,
        syncEnabled: userSettings?.UserSettings_deviceSync?.enabled || false,
        lastUpdated: userSettings?.UserSettings_updatedAt || null,
      },
      preferences: {
        lastUpdated: userPreferences?.UserPref_updatedAt || null,
      },
      devices: userSettings?.UserSettings_deviceTokens?.map(token => ({
        platform: token.platform,
        deviceId: token.deviceId,
        lastUsed: token.lastUsed,
        isActive: token.isActive,
      })) || [],
    };

    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    console.error('Error getting sync history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get sync history',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

module.exports = router;