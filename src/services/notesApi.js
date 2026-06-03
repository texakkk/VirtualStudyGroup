import axios from 'axios';
import { ensureStringId } from '../utils/objectId';
import { getApiBaseUrl } from '../config/apiConfig';

const API_BASE_URL = getApiBaseUrl();

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle response errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('token');
      window.location.href = '/signin';
    }
    return Promise.reject(error);
  }
);

const unwrapNotePayload = (payload) => {
  if (!payload) return payload;

  return payload.note || payload.data?.note || payload.data || payload._doc || payload;
};

const normalizePermissionList = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') return Object.values(value).filter(Boolean);
  return [];
};

const normalizePermissions = (permissions = {}) => ({
  read: normalizePermissionList(permissions.read),
  write: normalizePermissionList(permissions.write),
  admin: normalizePermissionList(permissions.admin),
});

const isValidNoteId = (noteId) => /^[a-f\d]{24}$/i.test(noteId);

const normalizeNoteId = (noteId) => {
  const normalizedNoteId = ensureStringId(noteId);
  return typeof normalizedNoteId === 'string' ? normalizedNoteId.trim() : '';
};

const normalizeVersionNumber = (version) => {
  const normalizedVersion = Number(version);
  return Number.isInteger(normalizedVersion) && normalizedVersion >= 1 ? normalizedVersion : null;
};

export const notesApi = {
  // Get notes for a group
  getNotes: async (groupId, params = {}) => {
    try {
      // Ensure groupId is a string
      const groupIdStr = typeof groupId === 'object' ? groupId.toString() : groupId;
      const response = await api.get(`/notes/group/${groupIdStr}`, { params });
      return {
        success: true,
        data: response.data.notes,
        pagination: response.data.pagination,
      };
    } catch (error) {
      console.error('Error fetching notes:', error);
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to fetch notes',
      };
    }
  },

  // Get a specific note by ID
  getNote: async (noteId) => {
    const normalizedNoteId = normalizeNoteId(noteId);
    if (!isValidNoteId(normalizedNoteId)) {
      console.error('getNote called with invalid noteId:', noteId);
      return { success: false, error: 'Invalid note ID' };
    }

    try {
      const response = await api.get(`/notes/${normalizedNoteId}`);
      return {
        success: true,
        data: unwrapNotePayload(response.data),
      };
    } catch (error) {
      console.error('Error fetching note:', error);
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to fetch note',
      };
    }
  },

  // Create a new note
  createNote: async (noteData) => {
    try {
      const payload = {
        Note_title: noteData.title,
        Note_content: noteData.content,
        Note_groupId: noteData.groupId,
        Note_tags: noteData.tags || [],
        Note_isPublic: noteData.isPublic || false,
      };

      const response = await api.post('/notes', payload);
      return {
        success: true,
        data: unwrapNotePayload(response.data),
      };
    } catch (error) {
      console.error('Error creating note:', error);
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to create note',
      };
    }
  },

  // Update an existing note
  updateNote: async (noteId, noteData) => {
    const normalizedNoteId = normalizeNoteId(noteId);

    if (!isValidNoteId(normalizedNoteId)) {
      console.error('updateNote called with invalid noteId:', noteId);
      return { success: false, error: 'Invalid note ID' };
    }
    try {
      const payload = {
        Note_title: noteData.title,
        Note_content: noteData.content,
        Note_tags: noteData.tags || [],
        Note_isPublic: noteData.isPublic || false,
        changes: noteData.changes || 'Updated note content',
      };

      const response = await api.put(`/notes/${normalizedNoteId}`, payload);
      return {
        success: true,
        data: unwrapNotePayload(response.data),
      };
    } catch (error) {
      console.error('Error updating note:', error);
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to update note',
      };
    }
  },

  // Delete a note
  deleteNote: async (noteId) => {
    const normalizedNoteId = normalizeNoteId(noteId);
    if (!isValidNoteId(normalizedNoteId)) {
      console.error('deleteNote called with invalid noteId:', noteId);
      return { success: false, error: 'Invalid note ID' };
    }

    try {
      await api.delete(`/notes/${normalizedNoteId}`);
      return {
        success: true,
      };
    } catch (error) {
      console.error('Error deleting note:', error);
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to delete note',
      };
    }
  },

  // Share note with users
  shareNote: async (noteId, userIds, permissionType = 'read') => {
    const normalizedNoteId = normalizeNoteId(noteId);
    if (!isValidNoteId(normalizedNoteId)) {
      console.error('shareNote called with invalid noteId:', noteId);
      return { success: false, error: 'Invalid note ID' };
    }

    try {
      const response = await api.post(`/notes/${normalizedNoteId}/share`, {
        userIds,
        permissionType,
      });
      return {
        success: true,
        data: unwrapNotePayload(response.data),
      };
    } catch (error) {
      console.error('Error sharing note:', error);
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to share note',
      };
    }
  },

  // Remove user permissions from note
  removeNotePermission: async (noteId, userId, permissionType) => {
    const normalizedNoteId = normalizeNoteId(noteId);
    const normalizedUserId = normalizeNoteId(userId);
    if (!isValidNoteId(normalizedNoteId)) {
      console.error('removeNotePermission called with invalid noteId:', noteId);
      return { success: false, error: 'Invalid note ID' };
    }
    if (!isValidNoteId(normalizedUserId)) {
      console.error('removeNotePermission called with invalid userId:', userId);
      return { success: false, error: 'Invalid user ID' };
    }

    try {
      const response = await api.delete(`/notes/${normalizedNoteId}/share/${normalizedUserId}`, {
        params: { permissionType },
      });
      return {
        success: true,
        data: unwrapNotePayload(response.data),
      };
    } catch (error) {
      console.error('Error removing permission:', error);
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to remove permission',
      };
    }
  },

  // Get note version history
  getVersionHistory: async (noteId, params = {}) => {
    try {
      const response = await api.get(`/notes/${noteId}/versions`, { params });
      return {
        success: true,
        data: response.data.versions,
        pagination: response.data.pagination,
      };
    } catch (error) {
      console.error('Error fetching version history:', error);
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to fetch version history',
      };
    }
  },

  // Get specific version of a note
  getVersion: async (noteId, version) => {
    const normalizedVersion = normalizeVersionNumber(version);
    if (!normalizedVersion) {
      console.error('getVersion called with invalid version:', version);
      return { success: false, error: 'Invalid version number' };
    }

    try {
      const response = await api.get(`/notes/${noteId}/versions/${normalizedVersion}`);
      return {
        success: true,
        data: response.data.version,
      };
    } catch (error) {
      console.error('Error fetching note version:', error);
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to fetch note version',
      };
    }
  },

  // Rollback note to a specific version
  rollbackToVersion: async (noteId, version) => {
    const normalizedNoteId = normalizeNoteId(noteId);
    const normalizedVersion = normalizeVersionNumber(version);

    if (!isValidNoteId(normalizedNoteId)) {
      console.error('rollbackToVersion called with invalid noteId:', noteId);
      return { success: false, error: 'Invalid note ID' };
    }
    if (!normalizedVersion) {
      console.error('rollbackToVersion called with invalid version:', version);
      return { success: false, error: 'Invalid version number' };
    }

    try {
      const response = await api.post(`/notes/${normalizedNoteId}/rollback/${normalizedVersion}`);
      return {
        success: true,
        data: unwrapNotePayload(response.data),
      };
    } catch (error) {
      console.error('Error rolling back note:', error);
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to rollback note',
      };
    }
  },

  // Add/remove collaborators
  manageCollaborators: async (noteId, userIds, action = 'add') => {
    try {
      const response = await api.post(`/notes/${noteId}/collaborators`, {
        userIds,
        action,
      });
      return {
        success: true,
        data: response.data.note,
      };
    } catch (error) {
      console.error('Error managing collaborators:', error);
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to manage collaborators',
      };
    }
  },

  // Convert document to note
  convertDocument: async (file, noteData) => {
    try {
      const formData = new FormData();
      formData.append('document', file);
      formData.append('Note_title', noteData.title || file.name);
      formData.append('Note_groupId', noteData.groupId);
      formData.append('Note_tags', JSON.stringify(noteData.tags || []));
      formData.append('Note_isPublic', noteData.isPublic || false);

      const response = await api.post('/notes/convert', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      return {
        success: true,
        data: unwrapNotePayload(response.data),
        metadata: response.data.conversionMetadata,
      };
    } catch (error) {
      console.error('Error converting document:', error);
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to convert document',
      };
    }
  },

  // Export note to document format
  exportNote: async (noteId, format, options = {}) => {
    const normalizedNoteId = normalizeNoteId(noteId);

    if (!isValidNoteId(normalizedNoteId)) {
      console.error('exportNote called with invalid noteId:', noteId);
      return { success: false, error: 'Invalid note ID' };
    }

    try {
      const response = await api.get(`/notes/${normalizedNoteId}/export/${format}`, {
        params: options,
        responseType: 'blob',
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      
      // Get filename from response headers or use default
      const contentDisposition = response.headers['content-disposition'];
      let filename = `note.${format}`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }
      
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      return {
        success: true,
        filename,
      };
    } catch (error) {
      console.error('Error exporting note:', error);
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to export note',
      };
    }
  },

  // Get supported conversion formats
  getSupportedFormats: async () => {
    try {
      const response = await api.get('/notes/conversion/formats');
      return {
        success: true,
        data: response.data.formats,
      };
    } catch (error) {
      console.error('Error fetching supported formats:', error);
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to fetch supported formats',
      };
    }
  },
};

// Helper function to transform backend note data to frontend format
export const transformNoteData = (backendNote) => {
  if (!backendNote) return null;

  const source = unwrapNotePayload(backendNote);
  const noteId = normalizeNoteId(source._id || source.id);
  const rawGroupId = source.Note_groupId ?? source.groupId;
  const groupId = typeof rawGroupId === 'object'
    ? normalizeNoteId(rawGroupId?._id || rawGroupId?.id || rawGroupId)
    : ensureStringId(rawGroupId);
  const createdAt = source.Note_createdAt ?? source.createdAt ?? source.created_at;
  const updatedAt = source.Note_updatedAt ?? source.updatedAt ?? source.updated_at ?? createdAt;
  const collaborators = source.Note_collaborators ?? source.collaborators ?? [];
  const permissions = normalizePermissions(source.Note_permissions ?? source.permissions);

  return {
    _id: noteId, // Keep MongoDB _id for backend compatibility
    id: noteId,  // Also provide id for frontend convenience
    title: source.Note_title ?? source.title ?? source.noteTitle ?? source.NoteTitle ?? '',
    content: source.Note_content ?? source.content ?? source.noteContent ?? source.NoteContent ?? source.body ?? '',
    tags: source.Note_tags ?? source.tags ?? [],
    isPublic: source.Note_isPublic ?? source.isPublic ?? false,
    isShared: collaborators.length > 0 ||
              permissions?.read?.length > 0 ||
              permissions?.write?.length > 0 ||
              source.isShared === true,
    collaborators,
    permissions,
    createdBy: source.Note_createdBy ?? source.createdBy,
    groupId,
    version: source.Note_version ?? source.version,
    canEdit: source.canEdit,
    canRead: source.canRead,
    createdAt: createdAt ? new Date(createdAt).toISOString() : null,
    updatedAt: updatedAt ? new Date(updatedAt).toISOString() : null,
  };
};

// Helper function to transform frontend note data to backend format
export const transformNoteDataForBackend = (frontendNote) => {
  return {
    title: frontendNote.title,
    content: frontendNote.content,
    tags: frontendNote.tags || [],
    isPublic: frontendNote.isPublic || false,
    groupId: frontendNote.groupId,
  };
};

// Helper function to transform version data
export const transformVersionData = (backendVersion) => {
  if (!backendVersion) return null;
  const createdAt = backendVersion.NoteVersion_createdAt ?? backendVersion.createdAt;

  return {
    id: backendVersion._id ?? backendVersion.id,
    noteId: backendVersion.NoteVersion_noteId ?? backendVersion.noteId,
    title: backendVersion.NoteVersion_title ?? backendVersion.title ?? '',
    content: backendVersion.NoteVersion_content ?? backendVersion.content ?? '',
    version: backendVersion.NoteVersion_version ?? backendVersion.version,
    createdBy: backendVersion.NoteVersion_createdBy?.User_name || backendVersion.createdBy?.User_name || backendVersion.createdBy || 'Unknown',
    changes: backendVersion.NoteVersion_changes ?? backendVersion.changes ?? '',
    changeType: backendVersion.NoteVersion_changeType ?? backendVersion.changeType,
    metadata: backendVersion.NoteVersion_metadata ?? backendVersion.metadata,
    createdAt: createdAt ? new Date(createdAt).toISOString() : null,
  };
};

export default notesApi;
