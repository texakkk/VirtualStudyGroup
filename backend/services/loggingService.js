const fs = require('fs').promises;
const path = require('path');

/**
 * Logging Service
 * Provides structured logging for all services with different log levels
 */

// Log levels
const LOG_LEVELS = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  DEBUG: 'DEBUG',
  TRACE: 'TRACE'
};

// Log level priorities (higher number = more important)
const LOG_PRIORITIES = {
  ERROR: 5,
  WARN: 4,
  INFO: 3,
  DEBUG: 2,
  TRACE: 1
};

// Current log level (can be set via environment variable)
const CURRENT_LOG_LEVEL = process.env.LOG_LEVEL || 'INFO';

// Log directory
const LOG_DIR = path.join(__dirname, '../logs');

// Ensure log directory exists
async function ensureLogDirectory() {
  try {
    await fs.access(LOG_DIR);
  } catch {
    await fs.mkdir(LOG_DIR, { recursive: true });
  }
}

/**
 * Format log entry
 * @param {string} level - Log level
 * @param {string} service - Service name
 * @param {string} message - Log message
 * @param {Object} metadata - Additional metadata
 * @returns {Object} Formatted log entry
 */
function formatLogEntry(level, service, message, metadata = {}) {
  return {
    timestamp: new Date().toISOString(),
    level,
    service,
    message,
    ...metadata,
    environment: process.env.NODE_ENV || 'development',
    pid: process.pid
  };
}

/**
 * Check if log level should be logged
 * @param {string} level - Log level to check
 * @returns {boolean} Whether to log
 */
function shouldLog(level) {
  return LOG_PRIORITIES[level] >= LOG_PRIORITIES[CURRENT_LOG_LEVEL];
}

/**
 * Write log to file
 * @param {string} filename - Log filename
 * @param {Object} logEntry - Log entry object
 */
async function writeToFile(filename, logEntry) {
  try {
    await ensureLogDirectory();
    const logPath = path.join(LOG_DIR, filename);
    const logLine = JSON.stringify(logEntry) + '\n';
    await fs.appendFile(logPath, logLine);
  } catch (error) {
    console.error('Failed to write log to file:', error);
  }
}

/**
 * Get log filename for current date
 * @param {string} type - Log type (error, access, etc.)
 * @returns {string} Log filename
 */
function getLogFilename(type = 'app') {
  const date = new Date().toISOString().split('T')[0];
  return `${type}-${date}.log`;
}

/**
 * Log error
 * @param {string} service - Service name
 * @param {string} message - Error message
 * @param {Error|Object} error - Error object or metadata
 */
async function logError(service, message, error = {}) {
  if (!shouldLog(LOG_LEVELS.ERROR)) return;
  
  const metadata = {
    error: error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code
    } : error
  };
  
  const logEntry = formatLogEntry(LOG_LEVELS.ERROR, service, message, metadata);
  
  // Console output
  console.error(`[${logEntry.timestamp}] [${service}] ERROR:`, message, metadata);
  
  // Write to file
  await writeToFile(getLogFilename('error'), logEntry);
  
  // In production, send to monitoring service
  if (process.env.NODE_ENV === 'production') {
    // TODO: Send to external monitoring service (e.g., Sentry, DataDog)
  }
}

/**
 * Log warning
 * @param {string} service - Service name
 * @param {string} message - Warning message
 * @param {Object} metadata - Additional metadata
 */
async function logWarning(service, message, metadata = {}) {
  if (!shouldLog(LOG_LEVELS.WARN)) return;
  
  const logEntry = formatLogEntry(LOG_LEVELS.WARN, service, message, metadata);
  
  // Console output
  console.warn(`[${logEntry.timestamp}] [${service}] WARN:`, message, metadata);
  
  // Write to file
  await writeToFile(getLogFilename('app'), logEntry);
}

/**
 * Log info
 * @param {string} service - Service name
 * @param {string} message - Info message
 * @param {Object} metadata - Additional metadata
 */
async function logInfo(service, message, metadata = {}) {
  if (!shouldLog(LOG_LEVELS.INFO)) return;
  
  const logEntry = formatLogEntry(LOG_LEVELS.INFO, service, message, metadata);
  
  // Console output
  console.log(`[${logEntry.timestamp}] [${service}] INFO:`, message);
  
  // Write to file
  await writeToFile(getLogFilename('app'), logEntry);
}

/**
 * Log debug
 * @param {string} service - Service name
 * @param {string} message - Debug message
 * @param {Object} metadata - Additional metadata
 */
async function logDebug(service, message, metadata = {}) {
  if (!shouldLog(LOG_LEVELS.DEBUG)) return;
  
  const logEntry = formatLogEntry(LOG_LEVELS.DEBUG, service, message, metadata);
  
  // Console output
  if (process.env.NODE_ENV === 'development') {
    console.debug(`[${logEntry.timestamp}] [${service}] DEBUG:`, message, metadata);
  }
  
  // Write to file
  await writeToFile(getLogFilename('debug'), logEntry);
}

/**
 * Log API request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {number} duration - Request duration in ms
 */
async function logRequest(req, res, duration) {
  const logEntry = formatLogEntry(LOG_LEVELS.INFO, 'API', 'Request', {
    method: req.method,
    path: req.path,
    statusCode: res.statusCode,
    duration: `${duration}ms`,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    userId: req.user?._id?.toString(),
    query: req.query,
    params: req.params
  });
  
  // Write to access log
  await writeToFile(getLogFilename('access'), logEntry);
}

/**
 * Log database operation
 * @param {string} operation - Operation type (query, insert, update, delete)
 * @param {string} collection - Collection name
 * @param {Object} metadata - Additional metadata
 */
async function logDatabaseOperation(operation, collection, metadata = {}) {
  if (!shouldLog(LOG_LEVELS.DEBUG)) return;
  
  const logEntry = formatLogEntry(LOG_LEVELS.DEBUG, 'Database', `${operation} on ${collection}`, metadata);
  
  await writeToFile(getLogFilename('database'), logEntry);
}

/**
 * Log performance metric
 * @param {string} operation - Operation name
 * @param {number} duration - Duration in ms
 * @param {Object} metadata - Additional metadata
 */
async function logPerformance(operation, duration, metadata = {}) {
  const logEntry = formatLogEntry(LOG_LEVELS.INFO, 'Performance', operation, {
    duration: `${duration}ms`,
    ...metadata
  });
  
  // Console output if slow
  if (duration > 1000) {
    console.warn(`[PERFORMANCE] Slow operation: ${operation} took ${duration}ms`);
  }
  
  await writeToFile(getLogFilename('performance'), logEntry);
}

/**
 * Log security event
 * @param {string} event - Event type
 * @param {Object} metadata - Event metadata
 */
async function logSecurityEvent(event, metadata = {}) {
  const logEntry = formatLogEntry(LOG_LEVELS.WARN, 'Security', event, metadata);
  
  // Console output
  console.warn(`[SECURITY] ${event}:`, metadata);
  
  // Write to security log
  await writeToFile(getLogFilename('security'), logEntry);
  
  // In production, send to security monitoring service
  if (process.env.NODE_ENV === 'production') {
    // TODO: Send to external security monitoring service
  }
}

/**
 * Create logger for specific service
 * @param {string} serviceName - Service name
 * @returns {Object} Logger object
 */
function createLogger(serviceName) {
  return {
    error: (message, error) => logError(serviceName, message, error),
    warn: (message, metadata) => logWarning(serviceName, message, metadata),
    info: (message, metadata) => logInfo(serviceName, message, metadata),
    debug: (message, metadata) => logDebug(serviceName, message, metadata),
    performance: (operation, duration, metadata) => logPerformance(operation, duration, metadata),
    security: (event, metadata) => logSecurityEvent(event, metadata)
  };
}

/**
 * Middleware to log all requests
 * @returns {Function} Express middleware
 */
function requestLoggingMiddleware() {
  return (req, res, next) => {
    const startTime = Date.now();
    
    // Capture response
    const originalSend = res.send;
    res.send = function(data) {
      const duration = Date.now() - startTime;
      logRequest(req, res, duration);
      return originalSend.call(this, data);
    };
    
    next();
  };
}

/**
 * Clean up old log files
 * @param {number} daysToKeep - Number of days to keep logs
 */
async function cleanupOldLogs(daysToKeep = 30) {
  try {
    await ensureLogDirectory();
    const files = await fs.readdir(LOG_DIR);
    const now = Date.now();
    const maxAge = daysToKeep * 24 * 60 * 60 * 1000;
    
    for (const file of files) {
      const filePath = path.join(LOG_DIR, file);
      const stats = await fs.stat(filePath);
      const age = now - stats.mtimeMs;
      
      if (age > maxAge) {
        await fs.unlink(filePath);
        console.log(`Deleted old log file: ${file}`);
      }
    }
  } catch (error) {
    console.error('Error cleaning up old logs:', error);
  }
}

/**
 * Get log statistics
 * @param {string} logType - Log type (error, access, etc.)
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Object>} Log statistics
 */
async function getLogStatistics(logType = 'error', startDate, endDate) {
  try {
    await ensureLogDirectory();
    const files = await fs.readdir(LOG_DIR);
    const logFiles = files.filter(f => f.startsWith(logType));
    
    const stats = {
      totalEntries: 0,
      byLevel: {},
      byService: {},
      errors: []
    };
    
    for (const file of logFiles) {
      const filePath = path.join(LOG_DIR, file);
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n').filter(l => l.trim());
      
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          const entryDate = new Date(entry.timestamp);
          
          if (startDate && entryDate < startDate) continue;
          if (endDate && entryDate > endDate) continue;
          
          stats.totalEntries++;
          
          // Count by level
          stats.byLevel[entry.level] = (stats.byLevel[entry.level] || 0) + 1;
          
          // Count by service
          stats.byService[entry.service] = (stats.byService[entry.service] || 0) + 1;
          
          // Collect errors
          if (entry.level === 'ERROR') {
            stats.errors.push({
              timestamp: entry.timestamp,
              service: entry.service,
              message: entry.message
            });
          }
        } catch (parseError) {
          // Skip invalid JSON lines
        }
      }
    }
    
    return stats;
  } catch (error) {
    console.error('Error getting log statistics:', error);
    return null;
  }
}

module.exports = {
  LOG_LEVELS,
  logError,
  logWarning,
  logInfo,
  logDebug,
  logRequest,
  logDatabaseOperation,
  logPerformance,
  logSecurityEvent,
  createLogger,
  requestLoggingMiddleware,
  cleanupOldLogs,
  getLogStatistics
};
