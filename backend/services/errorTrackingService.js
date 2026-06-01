const { createLogger } = require('./loggingService');

/**
 * Error Tracking and Monitoring Service
 * Provides centralized error tracking, categorization, and monitoring
 */

const logger = createLogger('ErrorTracking');

// Error categories
const ERROR_CATEGORIES = {
  VALIDATION: 'validation',
  AUTHENTICATION: 'authentication',
  AUTHORIZATION: 'authorization',
  DATABASE: 'database',
  EXTERNAL_API: 'external_api',
  FILE_SYSTEM: 'file_system',
  NETWORK: 'network',
  BUSINESS_LOGIC: 'business_logic',
  UNKNOWN: 'unknown'
};

// Error severity levels
const ERROR_SEVERITY = {
  CRITICAL: 'critical', // System is unusable
  HIGH: 'high',         // Major functionality is impaired
  MEDIUM: 'medium',     // Minor functionality is impaired
  LOW: 'low'            // Minimal impact
};

// In-memory error tracking (in production, use Redis or database)
const errorStats = {
  total: 0,
  byCategory: {},
  bySeverity: {},
  byEndpoint: {},
  recentErrors: []
};

/**
 * Categorize error based on error object
 * @param {Error} error - Error object
 * @param {Object} context - Error context
 * @returns {string} Error category
 */
function categorizeError(error, context = {}) {
  // Check error message and type
  const errorMessage = error.message?.toLowerCase() || '';
  const errorName = error.name?.toLowerCase() || '';
  
  // Validation errors
  if (errorMessage.includes('validation') || 
      errorMessage.includes('invalid') ||
      errorMessage.includes('required') ||
      errorName.includes('validationerror')) {
    return ERROR_CATEGORIES.VALIDATION;
  }
  
  // Authentication errors
  if (errorMessage.includes('authentication') ||
      errorMessage.includes('token') ||
      errorMessage.includes('unauthorized') ||
      error.statusCode === 401) {
    return ERROR_CATEGORIES.AUTHENTICATION;
  }
  
  // Authorization errors
  if (errorMessage.includes('authorization') ||
      errorMessage.includes('permission') ||
      errorMessage.includes('forbidden') ||
      error.statusCode === 403) {
    return ERROR_CATEGORIES.AUTHORIZATION;
  }
  
  // Database errors
  if (errorMessage.includes('mongo') ||
      errorMessage.includes('database') ||
      errorMessage.includes('connection') ||
      errorName.includes('mongoerror')) {
    return ERROR_CATEGORIES.DATABASE;
  }
  
  // External API errors
  if (errorMessage.includes('api') ||
      errorMessage.includes('request failed') ||
      errorMessage.includes('timeout') ||
      context.isExternalAPI) {
    return ERROR_CATEGORIES.EXTERNAL_API;
  }
  
  // File system errors
  if (errorMessage.includes('enoent') ||
      errorMessage.includes('file') ||
      errorMessage.includes('directory') ||
      errorName.includes('fserror')) {
    return ERROR_CATEGORIES.FILE_SYSTEM;
  }
  
  // Network errors
  if (errorMessage.includes('network') ||
      errorMessage.includes('econnrefused') ||
      errorMessage.includes('etimedout')) {
    return ERROR_CATEGORIES.NETWORK;
  }
  
  return ERROR_CATEGORIES.UNKNOWN;
}

/**
 * Determine error severity
 * @param {Error} error - Error object
 * @param {Object} context - Error context
 * @returns {string} Error severity
 */
function determineErrorSeverity(error, context = {}) {
  // Critical errors
  if (error.message?.includes('database connection') ||
      error.message?.includes('redis connection') ||
      error.message?.includes('fatal') ||
      context.affectsAllUsers) {
    return ERROR_SEVERITY.CRITICAL;
  }
  
  // High severity errors
  if (error.statusCode >= 500 ||
      error.message?.includes('payment') ||
      error.message?.includes('data loss') ||
      context.affectsMultipleUsers) {
    return ERROR_SEVERITY.HIGH;
  }
  
  // Medium severity errors
  if (error.statusCode >= 400 ||
      error.message?.includes('failed to') ||
      context.affectsSingleUser) {
    return ERROR_SEVERITY.MEDIUM;
  }
  
  // Low severity errors
  return ERROR_SEVERITY.LOW;
}

/**
 * Track error occurrence
 * @param {Error} error - Error object
 * @param {Object} context - Error context
 * @returns {Object} Error tracking info
 */
function trackError(error, context = {}) {
  const category = categorizeError(error, context);
  const severity = determineErrorSeverity(error, context);
  
  const errorInfo = {
    id: generateErrorId(),
    timestamp: new Date().toISOString(),
    category,
    severity,
    message: error.message,
    name: error.name,
    stack: error.stack,
    statusCode: error.statusCode || context.statusCode,
    endpoint: context.endpoint,
    method: context.method,
    userId: context.userId,
    ip: context.ip,
    userAgent: context.userAgent,
    additionalContext: context.additionalContext || {}
  };
  
  // Update statistics
  errorStats.total++;
  errorStats.byCategory[category] = (errorStats.byCategory[category] || 0) + 1;
  errorStats.bySeverity[severity] = (errorStats.bySeverity[severity] || 0) + 1;
  
  if (context.endpoint) {
    errorStats.byEndpoint[context.endpoint] = (errorStats.byEndpoint[context.endpoint] || 0) + 1;
  }
  
  // Keep recent errors (limit to 100)
  errorStats.recentErrors.unshift(errorInfo);
  if (errorStats.recentErrors.length > 100) {
    errorStats.recentErrors.pop();
  }
  
  // Log error
  logger.error(`${category} error`, errorInfo);
  
  // Alert if critical
  if (severity === ERROR_SEVERITY.CRITICAL) {
    alertCriticalError(errorInfo);
  }
  
  return errorInfo;
}

/**
 * Generate unique error ID
 * @returns {string} Error ID
 */
function generateErrorId() {
  return `ERR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Alert critical error
 * @param {Object} errorInfo - Error information
 */
function alertCriticalError(errorInfo) {
  console.error('🚨 CRITICAL ERROR DETECTED:', errorInfo);
  
  // In production, send alerts via:
  // - Email
  // - SMS
  // - Slack/Discord webhook
  // - PagerDuty
  // - etc.
}

/**
 * Get error statistics
 * @returns {Object} Error statistics
 */
function getErrorStatistics() {
  return {
    ...errorStats,
    recentErrors: errorStats.recentErrors.slice(0, 10) // Only return 10 most recent
  };
}

/**
 * Reset error statistics
 */
function resetErrorStatistics() {
  errorStats.total = 0;
  errorStats.byCategory = {};
  errorStats.bySeverity = {};
  errorStats.byEndpoint = {};
  errorStats.recentErrors = [];
}

/**
 * Express error handling middleware
 * @returns {Function} Express middleware
 */
function errorHandlingMiddleware() {
  return (err, req, res, next) => {
    // Track the error
    const errorInfo = trackError(err, {
      endpoint: req.path,
      method: req.method,
      userId: req.user?._id?.toString(),
      ip: req.ip,
      userAgent: req.get('user-agent'),
      statusCode: err.statusCode || 500
    });
    
    // Determine response status code
    const statusCode = err.statusCode || 500;
    
    // Prepare error response
    const errorResponse = {
      success: false,
      error: {
        id: errorInfo.id,
        message: err.message || 'Internal server error',
        category: errorInfo.category,
        timestamp: errorInfo.timestamp
      }
    };
    
    // Include stack trace in development
    if (process.env.NODE_ENV === 'development') {
      errorResponse.error.stack = err.stack;
      errorResponse.error.details = err.details;
    }
    
    // Send error response
    res.status(statusCode).json(errorResponse);
  };
}

/**
 * Async error wrapper for route handlers
 * @param {Function} fn - Async route handler
 * @returns {Function} Wrapped handler
 */
function asyncErrorHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Create custom error class
 * @param {string} name - Error name
 * @param {number} statusCode - HTTP status code
 * @returns {Class} Custom error class
 */
function createCustomError(name, statusCode) {
  return class extends Error {
    constructor(message, details = {}) {
      super(message);
      this.name = name;
      this.statusCode = statusCode;
      this.details = details;
      Error.captureStackTrace(this, this.constructor);
    }
  };
}

// Common custom errors
const ValidationError = createCustomError('ValidationError', 400);
const AuthenticationError = createCustomError('AuthenticationError', 401);
const AuthorizationError = createCustomError('AuthorizationError', 403);
const NotFoundError = createCustomError('NotFoundError', 404);
const ConflictError = createCustomError('ConflictError', 409);
const RateLimitError = createCustomError('RateLimitError', 429);
const InternalServerError = createCustomError('InternalServerError', 500);
const ServiceUnavailableError = createCustomError('ServiceUnavailableError', 503);

/**
 * Monitor error rates and alert if threshold exceeded
 * @param {number} threshold - Error rate threshold (errors per minute)
 * @param {number} windowMs - Time window in milliseconds
 */
function monitorErrorRates(threshold = 10, windowMs = 60000) {
  setInterval(() => {
    const recentErrors = errorStats.recentErrors.filter(err => {
      const errorTime = new Date(err.timestamp).getTime();
      return Date.now() - errorTime < windowMs;
    });
    
    const errorRate = recentErrors.length / (windowMs / 60000);
    
    if (errorRate > threshold) {
      logger.warn('High error rate detected', {
        errorRate: errorRate.toFixed(2),
        threshold,
        recentErrorCount: recentErrors.length
      });
      
      // Alert administrators
      alertHighErrorRate(errorRate, recentErrors);
    }
  }, windowMs);
}

/**
 * Alert high error rate
 * @param {number} errorRate - Current error rate
 * @param {Array} recentErrors - Recent errors
 */
function alertHighErrorRate(errorRate, recentErrors) {
  console.warn(`⚠️ HIGH ERROR RATE: ${errorRate.toFixed(2)} errors/minute`);
  
  // Group errors by category
  const errorsByCategory = {};
  recentErrors.forEach(err => {
    errorsByCategory[err.category] = (errorsByCategory[err.category] || 0) + 1;
  });
  
  console.warn('Errors by category:', errorsByCategory);
  
  // In production, send alert notification
}

/**
 * Get error trends
 * @param {number} hours - Number of hours to analyze
 * @returns {Object} Error trends
 */
function getErrorTrends(hours = 24) {
  const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
  const recentErrors = errorStats.recentErrors.filter(err => {
    return new Date(err.timestamp).getTime() > cutoffTime;
  });
  
  // Group by hour
  const errorsByHour = {};
  recentErrors.forEach(err => {
    const hour = new Date(err.timestamp).getHours();
    errorsByHour[hour] = (errorsByHour[hour] || 0) + 1;
  });
  
  // Find most common errors
  const errorMessages = {};
  recentErrors.forEach(err => {
    errorMessages[err.message] = (errorMessages[err.message] || 0) + 1;
  });
  
  const topErrors = Object.entries(errorMessages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([message, count]) => ({ message, count }));
  
  return {
    totalErrors: recentErrors.length,
    errorsByHour,
    topErrors,
    averagePerHour: (recentErrors.length / hours).toFixed(2)
  };
}

module.exports = {
  ERROR_CATEGORIES,
  ERROR_SEVERITY,
  categorizeError,
  determineErrorSeverity,
  trackError,
  getErrorStatistics,
  resetErrorStatistics,
  errorHandlingMiddleware,
  asyncErrorHandler,
  createCustomError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  InternalServerError,
  ServiceUnavailableError,
  monitorErrorRates,
  getErrorTrends
};
