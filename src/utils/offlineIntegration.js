// Integration utilities for adding offline support to existing components
import offlineApi from './offlineApi';
import offlineStorage from './offlineStorage';
import { message } from 'antd';

/**
 * Wrapper for API calls with offline support
 * Automatically handles caching and queueing
 */
export const withOfflineSupport = (apiCall, options = {}) => {
  const {
    cacheKey = null,
    offlineStrategy = 'queue',
    successMessage = null,
    offlineMessage = 'Action queued for sync when online'
  } = options;

  return async (...args) => {
    try {
      const response = await apiCall(...args);
      
      // Show success message if provided
      if (successMessage && !response.fromCache) {
        message.success(successMessage);
      }
      
      // If response is from cache, notify user
      if (response.fromCache) {
        message.info('Showing cached data (offline mode)');
      }
      
      // If action was queued, notify user
      if (response.queued) {
        message.warning(offlineMessage);
      }
      
      return response;
    } catch (error) {
      console.error('API call failed:', error);
      throw error;
    }
  };
};

/**
 * Notes API with offline support
 */
export const notesOfflineApi = {
  // Get all notes for a group
  getNotes: async (groupId) => {
    try {
      const response = await offlineApi.get(`/notes/${groupId}`);
      return response.data;
    } catch (error) {
      console.error('Failed to get notes:', error);
      // Try to get from offline storage
      const offlineNotes = await offlineStorage.getNotesByGroup(groupId);
      if (offlineNotes && offlineNotes.length > 0) {
        message.info('Showing cached notes (offline mode)');
        return offlineNotes;
      }
      throw error;
    }
  },

  // Create a new note
  createNote: async (noteData) => {
    try {
      const response = await offlineApi.post('/notes', noteData, {
        offlineStrategy: 'queue'
      });
      
      if (response.queued) {
        // Save optimistically to offline storage
        const tempNote = {
          ...noteData,
          Note_id: `temp_${Date.now()}`,
          Note_createdAt: new Date(),
          Note_updatedAt: new Date(),
          _offline: true
        };
        await offlineStorage.saveNote(tempNote);
        message.warning('Note will be saved when online');
        return tempNote;
      }
      
      // Save to offline storage for caching
      await offlineStorage.saveNote(response.data);
      return response.data;
    } catch (error) {
      console.error('Failed to create note:', error);
      throw error;
    }
  },

  // Update a note
  updateNote: async (noteId, noteData) => {
    try {
      const response = await offlineApi.put(`/notes/${noteId}`, noteData, {
        offlineStrategy: 'queue'
      });
      
      if (response.queued) {
        // Update optimistically in offline storage
        const updatedNote = {
          ...noteData,
          Note_id: noteId,
          Note_updatedAt: new Date(),
          _offline: true
        };
        await offlineStorage.saveNote(updatedNote);
        message.warning('Note will be updated when online');
        return updatedNote;
      }
      
      // Update offline storage
      await offlineStorage.saveNote(response.data);
      return response.data;
    } catch (error) {
      console.error('Failed to update note:', error);
      throw error;
    }
  },

  // Delete a note
  deleteNote: async (noteId) => {
    try {
      const response = await offlineApi.delete(`/notes/${noteId}`, {
        offlineStrategy: 'queue'
      });
      
      if (response.queued) {
        // Mark as deleted in offline storage
        message.warning('Note will be deleted when online');
        return { success: true, queued: true };
      }
      
      // Remove from offline storage
      await offlineStorage.deleteNote(noteId);
      return { success: true };
    } catch (error) {
      console.error('Failed to delete note:', error);
      throw error;
    }
  }
};

/**
 * Messages API with offline support
 */
export const messagesOfflineApi = {
  // Get messages for a group
  getMessages: async (groupId) => {
    try {
      const response = await offlineApi.get(`/messages/${groupId}`);
      return response.data;
    } catch (error) {
      console.error('Failed to get messages:', error);
      // Try to get from offline storage
      const offlineMessages = await offlineStorage.getMessagesByGroup(groupId);
      if (offlineMessages && offlineMessages.length > 0) {
        message.info('Showing cached messages (offline mode)');
        return offlineMessages;
      }
      throw error;
    }
  },

  // Send a message
  sendMessage: async (messageData) => {
    try {
      const response = await offlineApi.post('/messages', messageData, {
        offlineStrategy: 'queue'
      });
      
      if (response.queued) {
        // Save optimistically to offline storage
        const tempMessage = {
          ...messageData,
          Message_id: `temp_${Date.now()}`,
          Message_timestamp: new Date(),
          _offline: true
        };
        await offlineStorage.saveMessage(tempMessage);
        message.warning('Message will be sent when online');
        return tempMessage;
      }
      
      // Save to offline storage for caching
      await offlineStorage.saveMessage(response.data);
      return response.data;
    } catch (error) {
      console.error('Failed to send message:', error);
      throw error;
    }
  }
};

/**
 * Files API with offline support
 */
export const filesOfflineApi = {
  // Get files for a group
  getFiles: async (groupId) => {
    try {
      const response = await offlineApi.get(`/files/${groupId}`);
      return response.data;
    } catch (error) {
      console.error('Failed to get files:', error);
      // Try to get from offline storage
      const offlineFiles = await offlineStorage.getFilesByGroup(groupId);
      if (offlineFiles && offlineFiles.length > 0) {
        message.info('Showing cached files (offline mode)');
        return offlineFiles;
      }
      throw error;
    }
  }
};

/**
 * Hook for optimistic updates with offline support
 */
export const useOptimisticUpdate = (updateFn, options = {}) => {
  const { onSuccess, onError, offlineMessage } = options;

  return async (...args) => {
    try {
      const result = await updateFn(...args);
      
      if (result.queued || result._offline) {
        if (offlineMessage) {
          message.warning(offlineMessage);
        }
      } else if (onSuccess) {
        onSuccess(result);
      }
      
      return result;
    } catch (error) {
      if (onError) {
        onError(error);
      }
      throw error;
    }
  };
};

export default {
  withOfflineSupport,
  notesOfflineApi,
  messagesOfflineApi,
  filesOfflineApi,
  useOptimisticUpdate
};
