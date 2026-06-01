const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const { getRedisClient } = require('../config/redis');

/**
 * Rate limiting middleware configurations
 * Provides different rate limits for various endpoint types
 */

/**
 * Get client identifier (IP address) with proper IPv6 handling
 * @param {Object} req - Express request object
 * @returns {string} Client identifier
 */
function getClientIdentifier(req) {
  // Use forwarded IP if behind proxy, otherwise use direct IP
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  
  // Normalize IPv6 addresses
  if (ip.includes('::ffff:')) {
    // IPv4-mapped IPv6 address, extract IPv4
    return ip.replace('::ffff:', '');
  }
  
  return ip;
}

/**
 * Create a rate limiter with Redis store
 * @param {Object} options - Rate limit options
 * @returns {Function} Rate limit middleware
 */
function createRateLimiter(options = {}) {
  // Disable all rate limiting outside of production
  if (process.env.NODE_ENV !== 'production') {
    return (_req, _res, next) => next();
  }

  const {
    windowMs = 15 * 60 * 1000, // 15 minutes default
    max = 100, // 100 requests per window default
    message = 'Too many requests, please try again later',
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    keyGenerator = null,
    handler = null,
    useRedis = true
  } = options;

  const config = {
    windowMs,
    max,
    message: {
      success: false,
      error: message,
      retryAfter: Math.ceil(windowMs / 1000)
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    skipSuccessfulRequests,
    skipFailedRequests
  };

  // Use custom key generator if provided, otherwise use default
  if (keyGenerator) {
    config.keyGenerator = keyGenerator;
  } else {
    // Default key generator with proper IPv6 handling
    config.keyGenerator = (req) => getClientIdentifier(req);
  }

  // Use custom handler if provided
  if (handler) {
    config.handler = handler;
  }

  // Try to use Redis store if available
  if (useRedis) {
    try {
      const redisClient = getRedisClient();
      if (redisClient && redisClient.isOpen) {
        config.store = new RedisStore({
          client: redisClient,
          prefix: 'rl:',
          sendCommand: (...args) => redisClient.sendCommand(args)
        });
      }
    } catch (error) {
      console.warn('Redis not available for rate limiting, using memory store:', error.message);
    }
  }

  return rateLimit(config);
}

/**
 * General API rate limiter
 * 100 requests per 15 minutes per IP
 */
const generalApiLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many API requests, please try again later'
});

/**
 * Authentication rate limiter
 * 5 login attempts per 15 minutes per IP
 */
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts, please try again later',
  skipSuccessfulRequests: true, // Don't count successful logins
  keyGenerator: (req) => {
    // Use IP + email combination for more granular limiting
    const email = req.body?.User_email || req.body?.email || '';
    const ip = getClientIdentifier(req);
    return `${ip}-${email}`;
  }
});

/**
 * Registration rate limiter
 * 3 registration attempts per hour per IP
 */
const registrationLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: 'Too many registration attempts, please try again later'
});

/**
 * File upload rate limiter
 * 20 uploads per hour per user
 */
const fileUploadLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: 'Too many file uploads, please try again later',
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise IP
    return req.user?._id?.toString() || getClientIdentifier(req);
  }
});

/**
 * AI/ML API rate limiter
 * 30 requests per hour per user (AI operations are expensive)
 */
const aiApiLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: 'Too many AI requests, please try again later',
  keyGenerator: (req) => {
    return req.user?._id?.toString() || getClientIdentifier(req);
  }
});

/**
 * Search rate limiter
 * 60 searches per 15 minutes per user
 */
const searchLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: 'Too many search requests, please try again later',
  keyGenerator: (req) => {
    return req.user?._id?.toString() || getClientIdentifier(req);
  }
});

/**
 * Message/Chat rate limiter
 * 200 messages per 15 minutes per user
 */
const messageLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: 'Too many messages, please slow down',
  keyGenerator: (req) => {
    return req.user?._id?.toString() || getClientIdentifier(req);
  }
});

/**
 * Password reset rate limiter
 * 3 attempts per hour per IP
 */
const passwordResetLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: 'Too many password reset attempts, please try again later'
});

/**
 * Email verification rate limiter
 * 5 attempts per hour per IP
 */
const emailVerificationLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many verification requests, please try again later'
});

/**
 * Strict rate limiter for sensitive operations
 * 10 requests per hour per user
 */
const strictLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Rate limit exceeded for this operation',
  keyGenerator: (req) => {
    return req.user?._id?.toString() || getClientIdentifier(req);
  }
});

/**
 * Create a custom rate limiter with specific options
 * @param {Object} options - Custom rate limit options
 * @returns {Function} Rate limit middleware
 */
function customRateLimiter(options) {
  return createRateLimiter(options);
}

/**
 * Rate limiter that varies based on user authentication status
 * Authenticated users get higher limits
 */
function adaptiveRateLimiter(authenticatedMax, unauthenticatedMax, windowMs = 15 * 60 * 1000) {
  return createRateLimiter({
    windowMs,
    max: (req) => {
      return req.user ? authenticatedMax : unauthenticatedMax;
    },
    keyGenerator: (req) => {
      return req.user?._id?.toString() || getClientIdentifier(req);
    },
    message: 'Rate limit exceeded, please try again later'
  });
}

/**
 * Skip rate limiting for specific conditions
 * @param {Function} condition - Function that returns true to skip rate limiting
 * @returns {Function} Middleware
 */
function skipRateLimitIf(condition) {
  return (req, res, next) => {
    if (condition(req)) {
      req.skipRateLimit = true;
    }
    next();
  };
}

/**
 * Rate limit info middleware
 * Adds rate limit information to response headers
 */
function rateLimitInfo() {
  return (req, res, next) => {
    const originalJson = res.json;
    
    res.json = function(data) {
      // Add rate limit info to response if available
      if (req.rateLimit) {
        data.rateLimit = {
          limit: req.rateLimit.limit,
          remaining: req.rateLimit.remaining,
          reset: new Date(req.rateLimit.resetTime)
        };
      }
      
      return originalJson.call(this, data);
    };
    
    next();
  };
}

/**
 * Global rate limit handler
 * Logs rate limit violations and can trigger additional security measures
 */
function rateLimitHandler(req, res) {
  const identifier = req.user?._id?.toString() || getClientIdentifier(req);
  const endpoint = req.path;
  
  console.warn(`Rate limit exceeded: ${identifier} on ${endpoint}`);
  
  // Could add additional security measures here:
  // - Log to security monitoring system
  // - Temporarily block IP after repeated violations
  // - Send alert to administrators
  
  res.status(429).json({
    success: false,
    error: 'Too many requests',
    message: 'You have exceeded the rate limit. Please try again later.',
    retryAfter: Math.ceil(req.rateLimit?.resetTime ? (req.rateLimit.resetTime - Date.now()) / 1000 : 60)
  });
}

module.exports = {
  createRateLimiter,
  getClientIdentifier,
  generalApiLimiter,
  authLimiter,
  registrationLimiter,
  fileUploadLimiter,
  aiApiLimiter,
  searchLimiter,
  messageLimiter,
  passwordResetLimiter,
  emailVerificationLimiter,
  strictLimiter,
  customRateLimiter,
  adaptiveRateLimiter,
  skipRateLimitIf,
  rateLimitInfo,
  rateLimitHandler
};
