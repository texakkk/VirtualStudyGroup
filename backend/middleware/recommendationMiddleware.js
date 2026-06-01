const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');

// Create cache instance with 15-minute TTL
const recommendationCache = new NodeCache({ 
  stdTTL: 900, // 15 minutes
  checkperiod: 120 // Check for expired keys every 2 minutes
});

/**
 * Rate limiting middleware for AI recommendation endpoints
 */
const recommendationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each user to 20 requests per windowMs
  message: {
    success: false,
    error: {
      message: 'Too many recommendation requests. Please try again later.',
      code: 'RATE_LIMIT_EXCEEDED'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use user ID for rate limiting, fallback to default IP handling
    if (req.user && req.user._id) {
      return `user:${req.user._id.toString()}`;
    }
    // Let express-rate-limit handle IP extraction with proper IPv6 support
    return undefined; // This will use the default IP key generator
  },
  skip: (req) => {
    if (process.env.NODE_ENV !== 'production') {
      return true;
    }

    // Skip rate limiting for admin users
    return req.user && req.user.User_role === 'admin';
  }
});

/**
 * Caching middleware for recommendation responses
 */
const cacheRecommendations = (cacheKeyPrefix, ttlSeconds = 900) => {
  return (req, res, next) => {
    // Generate cache key based on user ID and request parameters
    const userId = req.user._id.toString();
    const params = JSON.stringify({
      ...req.params,
      ...req.query,
      body: req.body
    });
    const cacheKey = `${cacheKeyPrefix}:${userId}:${Buffer.from(params).toString('base64')}`;

    // Try to get cached response
    const cachedResponse = recommendationCache.get(cacheKey);
    if (cachedResponse) {
      return res.json({
        success: true,
        data: {
          ...cachedResponse,
          cached: true,
          cacheTimestamp: new Date().toISOString()
        }
      });
    }

    // Store original res.json method
    const originalJson = res.json;

    // Override res.json to cache successful responses
    res.json = function(data) {
      if (data.success && data.data) {
        // Cache the response data
        recommendationCache.set(cacheKey, data.data, ttlSeconds);
      }
      
      // Call original json method
      return originalJson.call(this, data);
    };

    next();
  };
};

/**
 * Validation middleware for recommendation requests
 */
const validateRecommendationRequest = (req, res, next) => {
  // Check if user is authenticated
  if (!req.user || !req.user._id) {
    return res.status(401).json({
      success: false,
      error: {
        message: 'Authentication required for recommendation services',
        code: 'AUTHENTICATION_REQUIRED'
      }
    });
  }

  // Validate user preferences exist or can be created
  if (!req.user.User_email) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'User profile incomplete. Please update your profile.',
        code: 'INCOMPLETE_PROFILE'
      }
    });
  }

  next();
};

/**
 * Middleware to log recommendation usage for analytics
 */
const logRecommendationUsage = (req, res, next) => {
  const startTime = Date.now();
  const userId = req.user._id.toString();
  const endpoint = req.route?.path || req.originalUrl || req.path;
  const method = req.method;

  // Store original res.json method
  const originalJson = res.json;

  // Override res.json to log usage
  res.json = function(data) {
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    const success = data.success || false;

    // Log usage (in production, this would go to a proper logging service)
    console.log(`[RECOMMENDATION_USAGE] ${new Date().toISOString()} - User: ${userId}, Endpoint: ${endpoint}, Method: ${method}, Success: ${success}, ResponseTime: ${responseTime}ms`);

    // In production, you might want to store this in a database or send to analytics service
    // Example:
    // analyticsService.logRecommendationUsage({
    //   userId,
    //   endpoint,
    //   method,
    //   success,
    //   responseTime,
    //   timestamp: new Date()
    // });

    return originalJson.call(this, data);
  };

  next();
};

/**
 * Error handling middleware for recommendation services
 */
const handleRecommendationErrors = (error, req, res, next) => {
  console.error('Recommendation service error:', error);

  // Handle specific error types
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Invalid request data',
        details: error.message,
        code: 'VALIDATION_ERROR'
      }
    });
  }

  if (error.name === 'CastError') {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Invalid ID format',
        code: 'INVALID_ID'
      }
    });
  }

  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      error: {
        message: 'Duplicate entry',
        code: 'DUPLICATE_ENTRY'
      }
    });
  }

  // Handle AI service specific errors
  if (error.message && error.message.includes('AI service')) {
    return res.status(503).json({
      success: false,
      error: {
        message: 'AI recommendation service temporarily unavailable',
        code: 'AI_SERVICE_UNAVAILABLE'
      }
    });
  }

  // Handle database connection errors
  if (error.message && error.message.includes('connection')) {
    return res.status(503).json({
      success: false,
      error: {
        message: 'Database temporarily unavailable',
        code: 'DATABASE_UNAVAILABLE'
      }
    });
  }

  // Default error response
  res.status(500).json({
    success: false,
    error: {
      message: 'Internal server error in recommendation service',
      code: 'INTERNAL_ERROR'
    }
  });
};

/**
 * Middleware to clear user's recommendation cache
 */
const clearUserRecommendationCache = (userId) => {
  const keys = recommendationCache.keys();
  const userKeys = keys.filter(key => key.includes(`:${userId}:`));
  
  userKeys.forEach(key => {
    recommendationCache.del(key);
  });

  console.log(`Cleared ${userKeys.length} cached recommendations for user ${userId}`);
};

/**
 * Clear cached recommendations matching a cache key prefix.
 */
const clearRecommendationCacheByPrefix = (prefix) => {
  const keys = recommendationCache.keys();
  const matchingKeys = keys.filter(key => key.startsWith(prefix));

  matchingKeys.forEach(key => {
    recommendationCache.del(key);
  });

  console.log(`Cleared ${matchingKeys.length} cached recommendations matching ${prefix}`);
};

/**
 * Middleware to get cache statistics
 */
const getCacheStats = () => {
  const stats = recommendationCache.getStats();
  return {
    keys: stats.keys,
    hits: stats.hits,
    misses: stats.misses,
    hitRate: stats.hits / (stats.hits + stats.misses) || 0,
    vsize: stats.vsize,
    ksize: stats.ksize
  };
};

module.exports = {
  recommendationRateLimit,
  cacheRecommendations,
  validateRecommendationRequest,
  logRecommendationUsage,
  handleRecommendationErrors,
  clearUserRecommendationCache,
  clearRecommendationCacheByPrefix,
  getCacheStats,
  recommendationCache
};
