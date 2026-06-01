import { useState } from 'react';

/**
 * Optimistic Update Utilities
 * 
 * This module provides utilities for implementing optimistic updates with proper
 * error recovery and loading state management for the TaskManager component.
 */

/**
 * Generic optimistic update pattern
 * 
 * @param {Object} options - Configuration object
 * @param {Function} options.optimisticAction - Function to apply optimistic update
 * @param {Function} options.apiCall - Function that returns a Promise for the API call
 * @param {Function} options.revertAction - Function to revert optimistic changes on error
 * @param {Function} options.successAction - Function to handle successful API response
 * @param {Function} options.setLoadingState - Function to manage loading state
 * @param {string} options.loadingKey - Key to identify this operation in loading state
 * @param {Function} options.onError - Optional error handler function
 * @returns {Promise} - Resolves with API response or rejects with error
 */
export const performOptimisticUpdate = async ({
  optimisticAction,
  apiCall,
  revertAction,
  successAction,
  setLoadingState,
  loadingKey,
  onError
}) => {
  try {
    // 1. Set loading state
    if (setLoadingState && loadingKey) {
      setLoadingState(prev => ({
        ...prev,
        [loadingKey]: true
      }));
    }

    // 2. Apply optimistic update immediately
    if (optimisticAction) {
      optimisticAction();
    }

    // 3. Make API call
    const result = await apiCall();

    // 4. Apply success reconciliation if provided
    if (successAction) {
      successAction(result);
    }

    return result;
  } catch (error) {
    // 5. Revert optimistic changes on failure
    if (revertAction) {
      revertAction();
    }

    // 6. Handle error
    if (onError) {
      onError(error);
    }

    throw error;
  } finally {
    // 7. Clear loading state
    if (setLoadingState && loadingKey) {
      setLoadingState(prev => ({
        ...prev,
        [loadingKey]: false
      }));
    }
  }
};

/**
 * Creates a loading state manager for tracking multiple concurrent operations
 * This is a custom React Hook that must be used within React components
 * 
 * @returns {Object} - Object with loading state and setter function
 */
export const useLoadingStateManager = () => {
  const [loadingStates, setLoadingStates] = useState({
    assignments: {}, // taskId -> boolean
    comments: {}, // taskId -> boolean
    deletions: {} // commentId -> boolean
  });

  const setLoadingState = (category, key, isLoading) => {
    setLoadingStates(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [key]: isLoading
      }
    }));
  };

  const isLoading = (category, key) => {
    return loadingStates[category]?.[key] || false;
  };

  const clearLoadingState = (category, key) => {
    setLoadingStates(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [key]: false
      }
    }));
  };

  const clearAllLoadingStates = () => {
    setLoadingStates({
      assignments: {},
      comments: {},
      deletions: {}
    });
  };

  return {
    loadingStates,
    setLoadingState,
    isLoading,
    clearLoadingState,
    clearAllLoadingStates
  };
};

/**
 * Error recovery utility for handling different types of errors
 * 
 * @param {Error} error - The error object
 * @param {Object} options - Configuration options
 * @param {Function} options.onNetworkError - Handler for network errors
 * @param {Function} options.onValidationError - Handler for validation errors
 * @param {Function} options.onAuthError - Handler for authentication errors
 * @param {Function} options.onServerError - Handler for server errors
 * @param {Function} options.onGenericError - Handler for other errors
 * @returns {string} - User-friendly error message
 */
export const handleOptimisticError = (error, options = {}) => {
  const {
    onNetworkError,
    onValidationError,
    onAuthError,
    onServerError,
    onGenericError
  } = options;

  let errorMessage = 'An unexpected error occurred. Please try again.';
  
  if (!error.response) {
    // Network error
    errorMessage = 'Network error. Please check your connection and try again.';
    if (onNetworkError) onNetworkError(error);
  } else {
    const status = error.response.status;
    const serverMessage = error.response.data?.message || error.response.data?.error;
    
    switch (status) {
      case 400:
        // Validation error
        errorMessage = serverMessage || 'Invalid data provided. Please check your input.';
        if (onValidationError) onValidationError(error);
        break;
      case 401:
        // Authentication error
        errorMessage = 'Authentication required. Please log in again.';
        if (onAuthError) onAuthError(error);
        break;
      case 403:
        // Authorization error
        errorMessage = 'You don\'t have permission to perform this action.';
        if (onAuthError) onAuthError(error);
        break;
      case 404:
        // Not found error
        errorMessage = 'The requested resource was not found.';
        if (onGenericError) onGenericError(error);
        break;
      case 500:
      case 502:
      case 503:
        // Server error
        errorMessage = 'Server error. Please try again later.';
        if (onServerError) onServerError(error);
        break;
      default:
        // Generic error
        errorMessage = serverMessage || errorMessage;
        if (onGenericError) onGenericError(error);
    }
  }

  return errorMessage;
};

/**
 * Creates a temporary comment structure for optimistic updates
 * 
 * @param {string} commentText - The comment text
 * @param {Object} user - The current user object
 * @returns {Object} - Temporary comment object
 */
export const createTemporaryComment = (commentText, user) => {
  return {
    _id: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    Comment_text: commentText,
    Comment_user: {
      _id: user._id,
      User_name: user.name || user.User_name,
      User_email: user.email || user.User_email
    },
    Comment_createdAt: new Date().toISOString(),
    isTemporary: true
  };
};

/**
 * Reconciles temporary comments with server response
 * 
 * @param {Array} comments - Current comments array
 * @param {Object} serverComment - Comment from server response
 * @param {string} tempId - Temporary comment ID to replace
 * @returns {Array} - Updated comments array
 */
export const reconcileComment = (comments, serverComment, tempId) => {
  return comments.map(comment => 
    comment._id === tempId 
      ? { ...serverComment, isTemporary: false }
      : comment
  );
};

/**
 * Removes temporary comments from the comments array
 * 
 * @param {Array} comments - Current comments array
 * @param {string} tempId - Temporary comment ID to remove
 * @returns {Array} - Updated comments array without the temporary comment
 */
export const removeTemporaryComment = (comments, tempId) => {
  return comments.filter(comment => comment._id !== tempId);
};

/**
 * Creates a debounced function to prevent rapid successive API calls
 * 
 * @param {Function} func - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} - Debounced function
 */
export const createDebounced = (func, delay) => {
  let timeoutId;
  
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(null, args), delay);
  };
};

/**
 * Prevents state updates on unmounted components
 * 
 * @param {Function} setState - State setter function
 * @param {Object} mountedRef - Ref object to track component mount status
 * @returns {Function} - Safe state setter that checks mount status
 */
export const createSafeStateSetter = (setState, mountedRef) => {
  return (newState) => {
    if (mountedRef.current) {
      setState(newState);
    }
  };
};

/**
 * Validates comment input before submission
 * 
 * @param {string} commentText - The comment text to validate
 * @returns {Object} - Validation result with isValid and error message
 */
export const validateComment = (commentText) => {
  if (!commentText || typeof commentText !== 'string') {
    return {
      isValid: false,
      error: 'Comment text is required'
    };
  }

  const trimmedText = commentText.trim();
  
  if (trimmedText.length === 0) {
    return {
      isValid: false,
      error: 'Comment cannot be empty'
    };
  }

  if (trimmedText.length > 1000) {
    return {
      isValid: false,
      error: 'Comment is too long (maximum 1000 characters)'
    };
  }

  return {
    isValid: true,
    error: null
  };
};

/**
 * Default error messages for different operation types
 */
export const ERROR_MESSAGES = {
  ASSIGNMENT_FAILED: 'Failed to assign user. Please try again.',
  COMMENT_ADD_FAILED: 'Failed to add comment. Please try again.',
  COMMENT_DELETE_FAILED: 'Failed to delete comment. Please try again.',
  NETWORK_ERROR: 'Network error. Please check your connection.',
  PERMISSION_ERROR: 'You don\'t have permission to perform this action.',
  VALIDATION_ERROR: 'Invalid data provided. Please check your input.',
  SERVER_ERROR: 'Server error. Please try again later.',
  GENERIC_ERROR: 'An unexpected error occurred. Please try again.'
};