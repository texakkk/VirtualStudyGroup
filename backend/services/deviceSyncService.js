const UserSettings = require('../models/UserSettings');
const UserPreferences = require('../models/UserPreferences');
const { EventEmitter } = require('events');

class DeviceSyncService extends EventEmitter {
  constructor() {
    super();
    this.syncQueue = new Map(); // userId -> sync operations
    this.syncInProgress = new Set(); // Track users currently syncing
    this.syncInterval = 30000; // 30 seconds
    this.maxRetries = 3;
    this.retryDelay = 5000; // 5 seconds
  }

  /**
   * Initialize the device sync service
   */
  initialize() {
    console.log('Device Sync Service initialized');
    
    // Start periodic sync check
    setInterval(() => {
      this.processSyncQueue();
    }, this.syncInterval);
  }

  /**
   * Queue a sync operation for a user
   */
  async queueSync(userId, syncType = 'full', priority = 'normal') {
    try {
      if (!userId) {
        throw new Error('User ID is required for sync operation');
      }

      const syncOperation = {
        userId,
        syncType, // 'full', 'settings', 'preferences'
        priority, // 'high', 'normal', 'low'
        timestamp: new Date(),
        retries: 0,
        status: 'queued'
      };

      // Add to queue or update existing operation
      const existingOp = this.syncQueue.get(userId);
      if (existingOp && existingOp.priority === 'low' && priority === 'high') {
        syncOperation.priority = 'high';
      }

      this.syncQueue.set(userId, syncOperation);
      
      // Emit sync queued event
      this.emit('syncQueued', { userId, syncType, priority });

      // If high priority, process immediately
      if (priority === 'high') {
        await this.processSyncForUser(userId);
      }

      return { success: true, message: 'Sync operation queued successfully' };
    } catch (error) {
      console.error('Error queueing sync operation:', error);
      throw error;
    }
  }

  /**
   * Process sync queue
   */
  async processSyncQueue() {
    const operations = Array.from(this.syncQueue.entries())
      .sort(([, a], [, b]) => {
        // Sort by priority (high > normal > low) then by timestamp
        const priorityOrder = { high: 3, normal: 2, low: 1 };
        const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return new Date(a.timestamp) - new Date(b.timestamp);
      });

    for (const [userId, operation] of operations) {
      if (!this.syncInProgress.has(userId)) {
        await this.processSyncForUser(userId);
      }
    }
  }

  /**
   * Process sync for a specific user
   */
  async processSyncForUser(userId) {
    if (this.syncInProgress.has(userId)) {
      return { success: false, message: 'Sync already in progress for user' };
    }

    const operation = this.syncQueue.get(userId);
    if (!operation) {
      return { success: false, message: 'No sync operation found for user' };
    }

    this.syncInProgress.add(userId);
    operation.status = 'in_progress';

    try {
      let result;
      
      switch (operation.syncType) {
        case 'full':
          result = await this.performFullSync(userId);
          break;
        case 'settings':
          result = await this.syncUserSettings(userId);
          break;
        case 'preferences':
          result = await this.syncUserPreferences(userId);
          break;
        default:
          throw new Error(`Unknown sync type: ${operation.syncType}`);
      }

      // Sync successful
      this.syncQueue.delete(userId);
      this.syncInProgress.delete(userId);
      
      this.emit('syncCompleted', { 
        userId, 
        syncType: operation.syncType, 
        result 
      });

      return { success: true, result };

    } catch (error) {
      console.error(`Sync failed for user ${userId}:`, error);
      
      operation.retries++;
      operation.status = 'failed';
      
      if (operation.retries >= this.maxRetries) {
        // Max retries reached, remove from queue
        this.syncQueue.delete(userId);
        this.emit('syncFailed', { 
          userId, 
          syncType: operation.syncType, 
          error: error.message,
          maxRetriesReached: true
        });
      } else {
        // Schedule retry
        setTimeout(() => {
          operation.status = 'queued';
        }, this.retryDelay * operation.retries);
        
        this.emit('syncRetry', { 
          userId, 
          syncType: operation.syncType, 
          retryCount: operation.retries,
          error: error.message
        });
      }

      this.syncInProgress.delete(userId);
      return { success: false, error: error.message };
    }
  }

  /**
   * Perform full sync (settings + preferences)
   */
  async performFullSync(userId) {
    const settingsResult = await this.syncUserSettings(userId);
    const preferencesResult = await this.syncUserPreferences(userId);

    return {
      settings: settingsResult,
      preferences: preferencesResult,
      timestamp: new Date()
    };
  }

  /**
   * Sync user settings across devices
   */
  async syncUserSettings(userId) {
    try {
      const userSettings = await UserSettings.findOne({ 
        UserSettings_userId: userId 
      });

      if (!userSettings) {
        // Create default settings if none exist
        const newSettings = new UserSettings({
          UserSettings_userId: userId
        });
        await newSettings.save();
        
        return {
          action: 'created',
          settings: newSettings,
          timestamp: new Date()
        };
      }

      // Update sync timestamp
      await userSettings.syncToDevice();

      return {
        action: 'synced',
        settings: userSettings,
        timestamp: userSettings.UserSettings_deviceSync.lastSyncAt
      };

    } catch (error) {
      console.error('Error syncing user settings:', error);
      throw error;
    }
  }

  /**
   * Sync user preferences across devices
   */
  async syncUserPreferences(userId) {
    try {
      const userPreferences = await UserPreferences.findOne({ 
        UserPref_userId: userId 
      });

      if (!userPreferences) {
        // Create default preferences if none exist
        const newPreferences = new UserPreferences({
          UserPref_userId: userId
        });
        await newPreferences.save();
        
        return {
          action: 'created',
          preferences: newPreferences,
          timestamp: new Date()
        };
      }

      // Update timestamp
      userPreferences.UserPref_updatedAt = new Date();
      await userPreferences.save();

      return {
        action: 'synced',
        preferences: userPreferences,
        timestamp: userPreferences.UserPref_updatedAt
      };

    } catch (error) {
      console.error('Error syncing user preferences:', error);
      throw error;
    }
  }

  /**
   * Get sync status for a user
   */
  getSyncStatus(userId) {
    const operation = this.syncQueue.get(userId);
    const inProgress = this.syncInProgress.has(userId);

    if (!operation && !inProgress) {
      return { status: 'idle', message: 'No sync operations pending' };
    }

    if (inProgress) {
      return { 
        status: 'in_progress', 
        operation: operation || { syncType: 'unknown' }
      };
    }

    return { 
      status: operation.status, 
      operation,
      queuePosition: this.getQueuePosition(userId)
    };
  }

  /**
   * Get queue position for a user
   */
  getQueuePosition(userId) {
    const operations = Array.from(this.syncQueue.entries())
      .sort(([, a], [, b]) => {
        const priorityOrder = { high: 3, normal: 2, low: 1 };
        const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return new Date(a.timestamp) - new Date(b.timestamp);
      });

    return operations.findIndex(([id]) => id === userId) + 1;
  }

  /**
   * Cancel sync operation for a user
   */
  cancelSync(userId) {
    if (this.syncInProgress.has(userId)) {
      return { 
        success: false, 
        message: 'Cannot cancel sync operation in progress' 
      };
    }

    const operation = this.syncQueue.get(userId);
    if (!operation) {
      return { 
        success: false, 
        message: 'No sync operation found for user' 
      };
    }

    this.syncQueue.delete(userId);
    this.emit('syncCancelled', { userId, operation });

    return { 
      success: true, 
      message: 'Sync operation cancelled successfully' 
    };
  }

  /**
   * Get sync statistics
   */
  getSyncStatistics() {
    const queuedOperations = Array.from(this.syncQueue.values());
    const inProgressCount = this.syncInProgress.size;

    return {
      queuedOperations: queuedOperations.length,
      inProgressOperations: inProgressCount,
      totalOperations: queuedOperations.length + inProgressCount,
      operationsByType: queuedOperations.reduce((acc, op) => {
        acc[op.syncType] = (acc[op.syncType] || 0) + 1;
        return acc;
      }, {}),
      operationsByPriority: queuedOperations.reduce((acc, op) => {
        acc[op.priority] = (acc[op.priority] || 0) + 1;
        return acc;
      }, {})
    };
  }

  /**
   * Force sync for a user (high priority)
   */
  async forceSync(userId, syncType = 'full') {
    return await this.queueSync(userId, syncType, 'high');
  }

  /**
   * Bulk sync for multiple users
   */
  async bulkSync(userIds, syncType = 'full', priority = 'normal') {
    const results = [];

    for (const userId of userIds) {
      try {
        const result = await this.queueSync(userId, syncType, priority);
        results.push({ userId, success: true, result });
      } catch (error) {
        results.push({ 
          userId, 
          success: false, 
          error: error.message 
        });
      }
    }

    return results;
  }
}

// Create singleton instance
const deviceSyncService = new DeviceSyncService();

module.exports = deviceSyncService;