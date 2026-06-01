// middleware/cacheMiddleware.js
const cacheService = require('../services/cacheService');
const crypto = require('crypto');

/**
 * Generate cache key from request
 */
const generateCacheKey = (req) => {
  const { method, originalUrl, body, query, params } = req;
  const userId = req.user?.User_id || 'anonymous';
  
  // Create a unique key based on request details
  const keyData = {
    method,
    url: originalUrl,
    userId,
    query,
    params,
    // Only include body for POST requests that are queries
    ...(method === 'POST' && body && !body.password ? { body } : {})
  };
  
  const keyString = JSON.stringify(keyData);
  return crypto.createHash('md5').update(keyString).digest('hex');
};

/**
 * Cache middleware for GET requests
 * Usage: router.get('/path', cacheMiddleware(300), handler)
 * @param {number} ttl - Time to live in seconds (default: 5 minutes)
 */
const cacheMiddleware = (ttl = 300) => {
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    try {
      const cacheKey = `query:${generateCacheKey(req)}`;
      
      // Try to get from cache
      const cachedData = await cacheService.get(cacheKey);
      
      if (cachedData) {
        // Cache hit
        return res.status(200).json({
          ...cachedData,
          _cached: true,
          _cacheTime: new Date().toISOString()
        });
      }

      // Cache miss - store original json method
      const originalJson = res.json.bind(res);
      
      // Override json method to cache the response
      res.json = function(data) {
        // Only cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          cacheService.set(cacheKey, data, ttl).catch(err => {
            console.error('Error caching response:', err.message);
          });
        }
        return originalJson(data);
      };

      next();
    } catch (error) {
      console.error('Cache middleware error:', error.message);
      next();
    }
  };
};

/**
 * Invalidate cache for specific patterns
 * Usage: await invalidateCache('user:123:*')
 */
const invalidateCache = async (pattern) => {
  try {
    const count = await cacheService.delPattern(pattern);
    console.log(`Invalidated ${count} cache entries matching: ${pattern}`);
    return count;
  } catch (error) {
    console.error('Error invalidating cache:', error.message);
    return 0;
  }
};

/**
 * Middleware to invalidate cache on data modifications
 * Usage: router.post('/path', invalidateCacheMiddleware(['user:*', 'group:*']), handler)
 */
const invalidateCacheMiddleware = (patterns = []) => {
  return async (req, res, next) => {
    // Store original json method
    const originalJson = res.json.bind(res);
    
    // Override json method to invalidate cache after successful response
    res.json = function(data) {
      // Only invalidate on successful modifications
      if (res.statusCode >= 200 && res.statusCode < 300) {
        // Invalidate cache patterns asynchronously
        Promise.all(patterns.map(pattern => invalidateCache(pattern)))
          .catch(err => console.error('Error invalidating cache:', err.message));
      }
      return originalJson(data);
    };

    next();
  };
};

/**
 * Cache user-specific data
 * Usage: router.get('/profile', cacheUserData(600), handler)
 */
const cacheUserData = (ttl = 600) => {
  return async (req, res, next) => {
    if (!req.user || !req.user.User_id) {
      return next();
    }

    try {
      const userId = req.user.User_id;
      const cacheKey = `user:${userId}:${generateCacheKey(req)}`;
      
      const cachedData = await cacheService.get(cacheKey);
      
      if (cachedData) {
        return res.status(200).json({
          ...cachedData,
          _cached: true
        });
      }

      const originalJson = res.json.bind(res);
      
      res.json = function(data) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          cacheService.set(cacheKey, data, ttl).catch(err => {
            console.error('Error caching user data:', err.message);
          });
        }
        return originalJson(data);
      };

      next();
    } catch (error) {
      console.error('Cache user data middleware error:', error.message);
      next();
    }
  };
};

/**
 * Cache group-specific data
 * Usage: router.get('/group/:groupId', cacheGroupData(600), handler)
 */
const cacheGroupData = (ttl = 600) => {
  return async (req, res, next) => {
    const groupId = req.params.groupId || req.params.id;
    
    if (!groupId) {
      return next();
    }

    try {
      const cacheKey = `group:${groupId}:${generateCacheKey(req)}`;
      
      const cachedData = await cacheService.get(cacheKey);
      
      if (cachedData) {
        return res.status(200).json({
          ...cachedData,
          _cached: true
        });
      }

      const originalJson = res.json.bind(res);
      
      res.json = function(data) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          cacheService.set(cacheKey, data, ttl).catch(err => {
            console.error('Error caching group data:', err.message);
          });
        }
        return originalJson(data);
      };

      next();
    } catch (error) {
      console.error('Cache group data middleware error:', error.message);
      next();
    }
  };
};

module.exports = {
  cacheMiddleware,
  cacheUserData,
  cacheGroupData,
  invalidateCache,
  invalidateCacheMiddleware,
  generateCacheKey
};
