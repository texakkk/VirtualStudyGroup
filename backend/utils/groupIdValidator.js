const mongoose = require('mongoose');

/**
 * Validates and sanitizes a group ID
 * @param {string|ObjectId} groupId - The group ID to validate
 * @returns {Object} - { isValid: boolean, sanitizedId: string|null, error: string|null }
 */
function validateGroupId(groupId) {
  // Handle null or undefined
  if (!groupId) {
    return {
      isValid: false,
      sanitizedId: null,
      error: 'Group ID is required'
    };
  }

  // Trim whitespace if it's a string
  const trimmedId = typeof groupId === 'string' ? groupId.trim() : groupId;

  // Check if it's a valid MongoDB ObjectId format
  if (!mongoose.Types.ObjectId.isValid(trimmedId)) {
    return {
      isValid: false,
      sanitizedId: null,
      error: 'Invalid group ID format'
    };
  }

  return {
    isValid: true,
    sanitizedId: trimmedId,
    error: null
  };
}

/**
 * Express middleware to validate groupId from request params
 * @param {string} paramName - The name of the parameter (default: 'groupId')
 */
function validateGroupIdMiddleware(paramName = 'groupId') {
  return (req, res, next) => {
    const groupId = req.params[paramName] || req.body[paramName];
    const validation = validateGroupId(groupId);

    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: validation.error
      });
    }

    // Store sanitized ID back to params/body
    if (req.params[paramName]) {
      req.params[paramName] = validation.sanitizedId;
    }
    if (req.body[paramName]) {
      req.body[paramName] = validation.sanitizedId;
    }

    next();
  };
}

module.exports = {
  validateGroupId,
  validateGroupIdMiddleware
};
