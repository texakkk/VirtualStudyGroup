// React hook for offline functionality
import { useState, useEffect, useCallback } from 'react';
import offlineDetector from '../utils/offlineDetection';
import syncManager from '../utils/syncManager';
import offlineStorage from '../utils/offlineStorage';

export const useOffline = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [connectionQuality, setConnectionQuality] = useState('good');
  const [syncStatus, setSyncStatus] = useState({
    isSyncing: false,
    queueCount: 0,
    lastSyncTime: null
  });

  useEffect(() => {
    // Subscribe to network status changes
    const unsubscribeNetwork = offlineDetector.subscribe((status) => {
      setIsOnline(status.online);
      setConnectionQuality(status.quality);

      // Trigger sync when connection is restored
      if (status.online && status.syncNow) {
        syncManager.processQueue();
      }
    });

    // Subscribe to sync events
    const unsubscribeSync = syncManager.subscribe((event) => {
      switch (event.type) {
        case 'SYNC_STARTED':
          setSyncStatus(prev => ({ ...prev, isSyncing: true }));
          break;
        case 'SYNC_COMPLETED':
          setSyncStatus({
            isSyncing: false,
            queueCount: 0,
            lastSyncTime: Date.now()
          });
          break;
        case 'SYNC_FAILED':
          setSyncStatus(prev => ({ ...prev, isSyncing: false }));
          break;
        case 'QUEUED':
          setSyncStatus(prev => ({
            ...prev,
            queueCount: prev.queueCount + 1
          }));
          break;
        default:
          break;
      }
    });

    // Initialize offline storage
    offlineStorage.init().catch(error => {
      console.error('Failed to initialize offline storage:', error);
    });

    // Get initial queue status
    syncManager.getQueueStatus().then(status => {
      setSyncStatus(prev => ({
        ...prev,
        queueCount: status.count
      }));
    });

    return () => {
      unsubscribeNetwork();
      unsubscribeSync();
    };
  }, []);

  // Queue an action for later sync
  const queueAction = useCallback(async (action) => {
    try {
      await syncManager.queueAction(action);
      return { success: true };
    } catch (error) {
      console.error('Failed to queue action:', error);
      return { success: false, error };
    }
  }, []);

  // Manually trigger sync
  const triggerSync = useCallback(async () => {
    if (!isOnline) {
      return { success: false, error: 'No internet connection' };
    }

    try {
      const results = await syncManager.processQueue();
      return { success: true, results };
    } catch (error) {
      console.error('Sync failed:', error);
      return { success: false, error };
    }
  }, [isOnline]);

  // Save data for offline access
  const saveForOffline = useCallback(async (type, data) => {
    try {
      switch (type) {
        case 'note':
          await offlineStorage.saveNote(data);
          break;
        case 'message':
          await offlineStorage.saveMessage(data);
          break;
        case 'file':
          await offlineStorage.saveFile(data);
          break;
        default:
          throw new Error(`Unknown data type: ${type}`);
      }
      return { success: true };
    } catch (error) {
      console.error('Failed to save for offline:', error);
      return { success: false, error };
    }
  }, []);

  // Get offline data
  const getOfflineData = useCallback(async (type, id) => {
    try {
      let data;
      switch (type) {
        case 'note':
          data = await offlineStorage.getNote(id);
          break;
        case 'message':
          data = await offlineStorage.getMessage(id);
          break;
        case 'file':
          data = await offlineStorage.getFile(id);
          break;
        default:
          throw new Error(`Unknown data type: ${type}`);
      }
      return { success: true, data };
    } catch (error) {
      console.error('Failed to get offline data:', error);
      return { success: false, error };
    }
  }, []);

  return {
    isOnline,
    connectionQuality,
    syncStatus,
    queueAction,
    triggerSync,
    saveForOffline,
    getOfflineData
  };
};

export default useOffline;
