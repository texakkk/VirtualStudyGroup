// Sync manager for handling offline actions and synchronization
import offlineStorage from './offlineStorage';
import api from '../api';

class SyncManager {
  constructor() {
    this.isSyncing = false;
    this.syncListeners = new Set();
    this.maxRetries = 3;
  }

  // Add action to sync queue
  async queueAction(action) {
    try {
      const queueItem = {
        type: action.type,
        endpoint: action.endpoint,
        method: action.method,
        data: action.data,
        timestamp: Date.now(),
        retries: 0
      };

      await offlineStorage.addToSyncQueue(queueItem);
      console.log('[SyncManager] Action queued:', action.type);
      
      this.notifyListeners({ type: 'QUEUED', action: queueItem });
      return queueItem;
    } catch (error) {
      console.error('[SyncManager] Failed to queue action:', error);
      throw error;
    }
  }

  // Process sync queue
  async processQueue() {
    if (this.isSyncing) {
      console.log('[SyncManager] Sync already in progress');
      return;
    }

    this.isSyncing = true;
    this.notifyListeners({ type: 'SYNC_STARTED' });

    try {
      const queue = await offlineStorage.getSyncQueue();
      console.log(`[SyncManager] Processing ${queue.length} queued actions`);

      const results = {
        success: 0,
        failed: 0,
        total: queue.length
      };

      for (const item of queue) {
        try {
          await this.syncItem(item);
          await offlineStorage.removeSyncQueueItem(item.id);
          results.success++;
          
          this.notifyListeners({
            type: 'ITEM_SYNCED',
            item,
            progress: {
              current: results.success + results.failed,
              total: results.total
            }
          });
        } catch (error) {
          console.error('[SyncManager] Failed to sync item:', item, error);
          
          // Increment retry count
          item.retries = (item.retries || 0) + 1;
          
          if (item.retries >= this.maxRetries) {
            // Remove from queue after max retries
            await offlineStorage.removeSyncQueueItem(item.id);
            results.failed++;
            
            this.notifyListeners({
              type: 'ITEM_FAILED',
              item,
              error: error.message
            });
          } else {
            // Update retry count in queue
            await offlineStorage.put('syncQueue', item);
          }
        }
      }

      console.log('[SyncManager] Sync completed:', results);
      this.notifyListeners({
        type: 'SYNC_COMPLETED',
        results
      });

      return results;
    } catch (error) {
      console.error('[SyncManager] Sync process failed:', error);
      this.notifyListeners({
        type: 'SYNC_FAILED',
        error: error.message
      });
      throw error;
    } finally {
      this.isSyncing = false;
    }
  }

  // Sync individual item
  async syncItem(item) {
    const { endpoint, method, data } = item;

    switch (method.toUpperCase()) {
      case 'POST':
        return await api.post(endpoint, data);
      case 'PUT':
        return await api.put(endpoint, data);
      case 'PATCH':
        return await api.patch(endpoint, data);
      case 'DELETE':
        return await api.delete(endpoint);
      default:
        throw new Error(`Unsupported method: ${method}`);
    }
  }

  // Subscribe to sync events
  subscribe(callback) {
    this.syncListeners.add(callback);
    return () => {
      this.syncListeners.delete(callback);
    };
  }

  // Notify listeners
  notifyListeners(event) {
    this.syncListeners.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('[SyncManager] Listener error:', error);
      }
    });
  }

  // Get sync queue status
  async getQueueStatus() {
    const queue = await offlineStorage.getSyncQueue();
    return {
      count: queue.length,
      items: queue,
      isSyncing: this.isSyncing
    };
  }

  // Clear sync queue
  async clearQueue() {
    await offlineStorage.clearSyncQueue();
    this.notifyListeners({ type: 'QUEUE_CLEARED' });
  }
}

// Export singleton instance
const syncManager = new SyncManager();
export default syncManager;
