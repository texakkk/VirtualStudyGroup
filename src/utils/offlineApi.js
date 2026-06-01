// Enhanced API wrapper with offline support
import api from '../api';
import offlineStorage from './offlineStorage';
import syncManager from './syncManager';
import offlineDetector from './offlineDetection';

class OfflineApi {
  constructor() {
    this.isOnline = navigator.onLine;
    
    // Subscribe to network status
    offlineDetector.subscribe((status) => {
      this.isOnline = status.online;
    });
  }

  // Generic request handler with offline support
  async request(config) {
    const { method, url, data, offlineStrategy = 'queue' } = config;

    try {
      // Try network request first
      const response = await api.request(config);
      
      // Cache successful GET responses for offline access
      if (method === 'GET' && response.data) {
        this.cacheResponse(url, response.data);
      }
      
      return response;
    } catch (error) {
      // If offline or network error, handle based on strategy
      if (!this.isOnline || error.message === 'Network Error') {
        return this.handleOfflineRequest(config, error);
      }
      
      throw error;
    }
  }

  // Handle offline requests
  async handleOfflineRequest(config, originalError) {
    const { method, url, data, offlineStrategy = 'queue' } = config;

    // For GET requests, try to return cached data
    if (method === 'GET') {
      const cachedData = await this.getCachedResponse(url);
      if (cachedData) {
        console.log('[OfflineApi] Returning cached data for:', url);
        return {
          data: cachedData,
          fromCache: true,
          status: 200
        };
      }
    }

    // For write operations, queue for later sync
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      if (offlineStrategy === 'queue') {
        await syncManager.queueAction({
          type: this.getActionType(method, url),
          endpoint: url,
          method,
          data
        });

        return {
          data: { queued: true, message: 'Action queued for sync' },
          queued: true,
          status: 202
        };
      }
    }

    // If no offline strategy worked, throw the original error
    throw originalError;
  }

  // Cache response for offline access
  async cacheResponse(url, data) {
    try {
      // Determine what type of data this is and cache appropriately
      if (url.includes('/notes')) {
        if (Array.isArray(data)) {
          for (const note of data) {
            await offlineStorage.saveNote(note);
          }
        } else if (data.Note_id) {
          await offlineStorage.saveNote(data);
        }
      } else if (url.includes('/messages')) {
        if (Array.isArray(data)) {
          for (const message of data) {
            await offlineStorage.saveMessage(message);
          }
        } else if (data.Message_id) {
          await offlineStorage.saveMessage(data);
        }
      } else if (url.includes('/files')) {
        if (Array.isArray(data)) {
          for (const file of data) {
            await offlineStorage.saveFile(file);
          }
        } else if (data.File_id) {
          await offlineStorage.saveFile(data);
        }
      }
    } catch (error) {
      console.error('[OfflineApi] Failed to cache response:', error);
    }
  }

  // Get cached response
  async getCachedResponse(url) {
    try {
      // Extract resource type and ID from URL
      const urlParts = url.split('/');
      
      if (url.includes('/notes')) {
        const noteId = urlParts[urlParts.length - 1];
        if (noteId && noteId !== 'notes') {
          return await offlineStorage.getNote(noteId);
        }
        // Return all notes if no specific ID
        return await offlineStorage.getAll('notes');
      } else if (url.includes('/messages')) {
        const messageId = urlParts[urlParts.length - 1];
        if (messageId && messageId !== 'messages') {
          return await offlineStorage.getMessage(messageId);
        }
        return await offlineStorage.getAll('messages');
      } else if (url.includes('/files')) {
        const fileId = urlParts[urlParts.length - 1];
        if (fileId && fileId !== 'files') {
          return await offlineStorage.getFile(fileId);
        }
        return await offlineStorage.getAll('files');
      }
      
      return null;
    } catch (error) {
      console.error('[OfflineApi] Failed to get cached response:', error);
      return null;
    }
  }

  // Determine action type from method and URL
  getActionType(method, url) {
    const resource = url.split('/').filter(Boolean).pop();
    return `${method}_${resource}`.toUpperCase();
  }

  // Convenience methods
  async get(url, config = {}) {
    return this.request({ ...config, method: 'GET', url });
  }

  async post(url, data, config = {}) {
    return this.request({ ...config, method: 'POST', url, data });
  }

  async put(url, data, config = {}) {
    return this.request({ ...config, method: 'PUT', url, data });
  }

  async patch(url, data, config = {}) {
    return this.request({ ...config, method: 'PATCH', url, data });
  }

  async delete(url, config = {}) {
    return this.request({ ...config, method: 'DELETE', url });
  }
}

// Export singleton instance
const offlineApi = new OfflineApi();
export default offlineApi;
