/**
 * Utility functions for handling API errors and providing user-friendly messages
 */

export const getErrorMessage = (error) => {
  // Handle different types of errors
  if (typeof error === 'string') {
    return error;
  }

  if (error?.response?.data?.message) {
    return error.response.data.message;
  }

  if (error?.message) {
    return error.message;
  }

  // Default error messages based on status codes
  if (error?.response?.status) {
    switch (error.response.status) {
      case 400:
        return 'Invalid request. Please check your input and try again.';
      case 401:
        return 'You are not authorized. Please sign in and try again.';
      case 403:
        return 'You do not have permission to perform this action.';
      case 404:
        return 'The requested resource was not found.';
      case 409:
        return 'There was a conflict with your request. Please try again.';
      case 413:
        return 'The file is too large. Please choose a smaller file.';
      case 422:
        return 'The data provided is invalid. Please check and try again.';
      case 429:
        return 'Too many requests. Please wait a moment and try again.';
      case 500:
        return 'Server error. Please try again later.';
      case 502:
      case 503:
      case 504:
        return 'Service temporarily unavailable. Please try again later.';
      default:
        return 'An unexpected error occurred. Please try again.';
    }
  }

  return 'An unexpected error occurred. Please try again.';
};

export const isNetworkError = (error) => {
  return !error?.response && error?.request;
};

export const isAuthError = (error) => {
  return error?.response?.status === 401;
};

export const isPermissionError = (error) => {
  return error?.response?.status === 403;
};

export const isValidationError = (error) => {
  return error?.response?.status === 400 || error?.response?.status === 422;
};

export const handleApiError = (error, showSnackbar, defaultMessage = null) => {
  const message = defaultMessage || getErrorMessage(error);
  const notify = typeof showSnackbar === 'function' ? showSnackbar : null;

  if (isNetworkError(error)) {
    notify?.('Network error. Please check your connection and try again.', 'error');
  } else if (isAuthError(error)) {
    notify?.('Session expired. Please sign in again.', 'error');
    // Optionally redirect to login
    setTimeout(() => {
      window.location.href = '/signin';
    }, 2000);
  } else {
    notify?.(message, 'error');
  }

  console.error('API Error:', error);
  return message;
};

export const validateNoteData = (noteData) => {
  const errors = [];

  if (!noteData.title?.trim()) {
    errors.push('Note title is required');
  } else if (noteData.title.length > 200) {
    errors.push('Note title cannot exceed 200 characters');
  }

  if (!noteData.content?.trim()) {
    errors.push('Note content is required');
  } else if (noteData.content.length > 100000) {
    errors.push('Note content cannot exceed 100,000 characters');
  }

  if (noteData.tags && noteData.tags.length > 20) {
    errors.push('Cannot have more than 20 tags');
  }

  if (noteData.tags) {
    for (const tag of noteData.tags) {
      if (tag.length > 50) {
        errors.push(`Tag "${tag}" cannot exceed 50 characters`);
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const isValidFileType = (file, acceptedTypes) => {
  const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
  return acceptedTypes.includes(fileExtension);
};

export const isValidFileSize = (file, maxSize) => {
  return file.size <= maxSize;
};

export default {
  getErrorMessage,
  isNetworkError,
  isAuthError,
  isPermissionError,
  isValidationError,
  handleApiError,
  validateNoteData,
  formatFileSize,
  isValidFileType,
  isValidFileSize,
};
