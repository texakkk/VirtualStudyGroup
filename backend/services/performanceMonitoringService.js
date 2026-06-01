const { createLogger } = require('./loggingService');

/**
 * Performance Monitoring Service
 * Tracks and monitors application performance metrics
 */

const logger = createLogger('Performance');

// Performance metrics storage
const performanceMetrics = {
  requests: {
    total: 0,
    byEndpoint: {},
    byMethod: {},
    responseTimeSum: 0,
    slowRequests: []
  },
  database: {
    queries: 0,
    totalTime: 0,
    slowQueries: []
  },
  cache: {
    hits: 0,
    misses: 0,
    hitRate: 0
  },
  memory: {
    samples: [],
    maxSamples: 100
  },
  cpu: {
    samples: [],
    maxSamples: 100
  }
};

// Performance thresholds
const THRESHOLDS = {
  slowRequestMs: 1000,
  slowQueryMs: 500,
  highMemoryMB: 500,
  highCpuPercent: 80
};

/**
 * Track request performance
 * @param {Object} req - Express request object
 * @param {number} duration - Request duration in ms
 * @param {number} statusCode - Response status code
 */
function trackRequest(req, duration, statusCode) {
  const endpoint = `${req.method} ${req.path}`;
  
  // Update metrics
  performanceMetrics.requests.total++;
  performanceMetrics.requests.responseTimeSum += duration;
  
  // Track by endpoint
  if (!performanceMetrics.requests.byEndpoint[endpoint]) {
    performanceMetrics.requests.byEndpoint[endpoint] = {
      count: 0,
      totalTime: 0,
      avgTime: 0,
      minTime: Infinity,
      maxTime: 0
    };
  }
  
  const endpointMetrics = performanceMetrics.requests.byEndpoint[endpoint];
  endpointMetrics.count++;
  endpointMetrics.totalTime += duration;
  endpointMetrics.avgTime = endpointMetrics.totalTime / endpointMetrics.count;
  endpointMetrics.minTime = Math.min(endpointMetrics.minTime, duration);
  endpointMetrics.maxTime = Math.max(endpointMetrics.maxTime, duration);
  
  // Track by method
  performanceMetrics.requests.byMethod[req.method] = 
    (performanceMetrics.requests.byMethod[req.method] || 0) + 1;
  
  // Track slow requests
  if (duration > THRESHOLDS.slowRequestMs) {
    performanceMetrics.requests.slowRequests.unshift({
      endpoint,
      duration,
      timestamp: new Date().toISOString(),
      statusCode,
      userId: req.user?._id?.toString()
    });
    
    // Keep only last 50 slow requests
    if (performanceMetrics.requests.slowRequests.length > 50) {
      performanceMetrics.requests.slowRequests.pop();
    }
    
    logger.warn('Slow request detected', {
      endpoint,
      duration: `${duration}ms`,
      statusCode
    });
  }
}

/**
 * Track database query performance
 * @param {string} operation - Query operation
 * @param {string} collection - Collection name
 * @param {number} duration - Query duration in ms
 * @param {Object} metadata - Additional metadata
 */
function trackDatabaseQuery(operation, collection, duration, metadata = {}) {
  performanceMetrics.database.queries++;
  performanceMetrics.database.totalTime += duration;
  
  // Track slow queries
  if (duration > THRESHOLDS.slowQueryMs) {
    performanceMetrics.database.slowQueries.unshift({
      operation,
      collection,
      duration,
      timestamp: new Date().toISOString(),
      ...metadata
    });
    
    // Keep only last 50 slow queries
    if (performanceMetrics.database.slowQueries.length > 50) {
      performanceMetrics.database.slowQueries.pop();
    }
    
    logger.warn('Slow database query detected', {
      operation,
      collection,
      duration: `${duration}ms`
    });
  }
}

/**
 * Track cache performance
 * @param {boolean} hit - Whether cache hit occurred
 */
function trackCacheAccess(hit) {
  if (hit) {
    performanceMetrics.cache.hits++;
  } else {
    performanceMetrics.cache.misses++;
  }
  
  const total = performanceMetrics.cache.hits + performanceMetrics.cache.misses;
  performanceMetrics.cache.hitRate = total > 0 
    ? (performanceMetrics.cache.hits / total * 100).toFixed(2)
    : 0;
}

/**
 * Sample system resources
 */
function sampleSystemResources() {
  const memoryUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  
  // Memory metrics
  const memoryMB = {
    rss: (memoryUsage.rss / 1024 / 1024).toFixed(2),
    heapTotal: (memoryUsage.heapTotal / 1024 / 1024).toFixed(2),
    heapUsed: (memoryUsage.heapUsed / 1024 / 1024).toFixed(2),
    external: (memoryUsage.external / 1024 / 1024).toFixed(2),
    timestamp: new Date().toISOString()
  };
  
  performanceMetrics.memory.samples.push(memoryMB);
  if (performanceMetrics.memory.samples.length > performanceMetrics.memory.maxSamples) {
    performanceMetrics.memory.samples.shift();
  }
  
  // CPU metrics
  const cpuPercent = {
    user: (cpuUsage.user / 1000).toFixed(2),
    system: (cpuUsage.system / 1000).toFixed(2),
    timestamp: new Date().toISOString()
  };
  
  performanceMetrics.cpu.samples.push(cpuPercent);
  if (performanceMetrics.cpu.samples.length > performanceMetrics.cpu.maxSamples) {
    performanceMetrics.cpu.samples.shift();
  }
  
  // Alert if high memory usage
  if (parseFloat(memoryMB.heapUsed) > THRESHOLDS.highMemoryMB) {
    logger.warn('High memory usage detected', {
      heapUsed: `${memoryMB.heapUsed}MB`,
      threshold: `${THRESHOLDS.highMemoryMB}MB`
    });
  }
}

/**
 * Get performance metrics
 * @returns {Object} Performance metrics
 */
function getPerformanceMetrics() {
  const avgResponseTime = performanceMetrics.requests.total > 0
    ? (performanceMetrics.requests.responseTimeSum / performanceMetrics.requests.total).toFixed(2)
    : 0;
  
  const avgQueryTime = performanceMetrics.database.queries > 0
    ? (performanceMetrics.database.totalTime / performanceMetrics.database.queries).toFixed(2)
    : 0;
  
  // Get current memory usage
  const currentMemory = performanceMetrics.memory.samples.length > 0
    ? performanceMetrics.memory.samples[performanceMetrics.memory.samples.length - 1]
    : null;
  
  // Get top 10 slowest endpoints
  const slowestEndpoints = Object.entries(performanceMetrics.requests.byEndpoint)
    .map(([endpoint, metrics]) => ({
      endpoint,
      avgTime: metrics.avgTime.toFixed(2),
      maxTime: metrics.maxTime,
      count: metrics.count
    }))
    .sort((a, b) => b.avgTime - a.avgTime)
    .slice(0, 10);
  
  return {
    requests: {
      total: performanceMetrics.requests.total,
      avgResponseTime: `${avgResponseTime}ms`,
      byMethod: performanceMetrics.requests.byMethod,
      slowRequests: performanceMetrics.requests.slowRequests.slice(0, 10),
      slowestEndpoints
    },
    database: {
      totalQueries: performanceMetrics.database.queries,
      avgQueryTime: `${avgQueryTime}ms`,
      slowQueries: performanceMetrics.database.slowQueries.slice(0, 10)
    },
    cache: {
      hits: performanceMetrics.cache.hits,
      misses: performanceMetrics.cache.misses,
      hitRate: `${performanceMetrics.cache.hitRate}%`
    },
    memory: currentMemory,
    uptime: process.uptime()
  };
}

/**
 * Reset performance metrics
 */
function resetPerformanceMetrics() {
  performanceMetrics.requests = {
    total: 0,
    byEndpoint: {},
    byMethod: {},
    responseTimeSum: 0,
    slowRequests: []
  };
  performanceMetrics.database = {
    queries: 0,
    totalTime: 0,
    slowQueries: []
  };
  performanceMetrics.cache = {
    hits: 0,
    misses: 0,
    hitRate: 0
  };
}

/**
 * Performance monitoring middleware
 * @returns {Function} Express middleware
 */
function performanceMonitoringMiddleware() {
  return (req, res, next) => {
    const startTime = Date.now();
    
    // Capture response
    const originalSend = res.send;
    res.send = function(data) {
      const duration = Date.now() - startTime;
      trackRequest(req, duration, res.statusCode);
      return originalSend.call(this, data);
    };
    
    next();
  };
}

/**
 * Measure function execution time
 * @param {Function} fn - Function to measure
 * @param {string} name - Function name for logging
 * @returns {Function} Wrapped function
 */
function measureExecutionTime(fn, name) {
  return async function(...args) {
    const startTime = Date.now();
    try {
      const result = await fn(...args);
      const duration = Date.now() - startTime;
      
      logger.performance(name, duration);
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.performance(`${name} (failed)`, duration);
      throw error;
    }
  };
}

/**
 * Create performance timer
 * @param {string} label - Timer label
 * @returns {Object} Timer object
 */
function createTimer(label) {
  const startTime = Date.now();
  
  return {
    end: () => {
      const duration = Date.now() - startTime;
      logger.performance(label, duration);
      return duration;
    },
    getDuration: () => {
      return Date.now() - startTime;
    }
  };
}

/**
 * Start periodic resource sampling
 * @param {number} intervalMs - Sampling interval in milliseconds
 */
function startResourceMonitoring(intervalMs = 60000) {
  // Initial sample
  sampleSystemResources();
  
  // Periodic sampling
  setInterval(() => {
    sampleSystemResources();
  }, intervalMs);
  
  logger.info('Resource monitoring started', {
    interval: `${intervalMs}ms`
  });
}

/**
 * Get health status
 * @returns {Object} Health status
 */
function getHealthStatus() {
  const metrics = getPerformanceMetrics();
  const currentMemory = performanceMetrics.memory.samples.length > 0
    ? performanceMetrics.memory.samples[performanceMetrics.memory.samples.length - 1]
    : null;
  
  const health = {
    status: 'healthy',
    checks: {
      memory: {
        status: 'ok',
        value: currentMemory?.heapUsed,
        threshold: `${THRESHOLDS.highMemoryMB}MB`
      },
      responseTime: {
        status: 'ok',
        value: metrics.requests.avgResponseTime,
        threshold: `${THRESHOLDS.slowRequestMs}ms`
      },
      cacheHitRate: {
        status: 'ok',
        value: metrics.cache.hitRate
      }
    },
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  };
  
  // Check memory
  if (currentMemory && parseFloat(currentMemory.heapUsed) > THRESHOLDS.highMemoryMB) {
    health.checks.memory.status = 'warning';
    health.status = 'degraded';
  }
  
  // Check response time
  const avgResponseTime = parseFloat(metrics.requests.avgResponseTime);
  if (avgResponseTime > THRESHOLDS.slowRequestMs) {
    health.checks.responseTime.status = 'warning';
    health.status = 'degraded';
  }
  
  // Check cache hit rate
  const cacheHitRate = parseFloat(metrics.cache.hitRate);
  if (cacheHitRate < 50 && performanceMetrics.cache.hits + performanceMetrics.cache.misses > 100) {
    health.checks.cacheHitRate.status = 'warning';
    health.status = 'degraded';
  }
  
  return health;
}

/**
 * Generate performance report
 * @returns {Object} Performance report
 */
function generatePerformanceReport() {
  const metrics = getPerformanceMetrics();
  const health = getHealthStatus();
  
  return {
    summary: {
      status: health.status,
      uptime: `${(process.uptime() / 3600).toFixed(2)} hours`,
      totalRequests: metrics.requests.total,
      avgResponseTime: metrics.requests.avgResponseTime,
      cacheHitRate: metrics.cache.hitRate
    },
    requests: metrics.requests,
    database: metrics.database,
    cache: metrics.cache,
    memory: {
      current: metrics.memory,
      trend: performanceMetrics.memory.samples.slice(-10)
    },
    health: health.checks,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  trackRequest,
  trackDatabaseQuery,
  trackCacheAccess,
  sampleSystemResources,
  getPerformanceMetrics,
  resetPerformanceMetrics,
  performanceMonitoringMiddleware,
  measureExecutionTime,
  createTimer,
  startResourceMonitoring,
  getHealthStatus,
  generatePerformanceReport,
  THRESHOLDS
};
