const helmet = require('helmet');
const { sanitizeAllInputs } = require('./inputValidationMiddleware');
const { generalApiLimiter } = require('./rateLimitMiddleware');

/**
 * Security middleware configuration
 * Combines various security measures for comprehensive protection
 */

/**
 * Configure Helmet for security headers
 * @returns {Function} Helmet middleware
 */
function configureHelmet() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "blob:", "https://www.youtube.com", "https://s.ytimg.com"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:', 'http://localhost:5001'],
        connectSrc: ["'self'", "http://localhost:5001", "ws://localhost:5001", "ws://localhost:3000", "http://localhost:3000", "https://virtualstudygroup.onrender.com", "wss://virtualstudygroup.onrender.com", "https://www.youtube.com", "https://s.ytimg.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'", 'blob:', 'http://localhost:5001'],
        workerSrc: ["'self'", 'blob:'],
        frameSrc: ["'self'", 'https://www.youtube.com', 'https://www.youtube-nocookie.com'],
      },
    },
    crossOriginEmbedderPolicy: false, // Allow embedding for video/media
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow cross-origin resources
    dnsPrefetchControl: { allow: false },
    frameguard: { action: 'deny' },
    hidePoweredBy: true,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    ieNoOpen: true,
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xssFilter: true
  });
}

/**
 * Prevent parameter pollution
 * @returns {Function} Middleware
 */
function preventParameterPollution() {
  return (req, res, next) => {
    // Convert array parameters to single values (take first value)
    if (req.query) {
      for (const [key, value] of Object.entries(req.query)) {
        if (Array.isArray(value) && value.length > 0) {
          req.query[key] = value[0];
        }
      }
    }
    
    next();
  };
}

/**
 * Add security headers to response
 * @returns {Function} Middleware
 */
function addSecurityHeaders() {
  return (req, res, next) => {
    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');
    
    // Enable XSS protection
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    // Referrer policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Permissions policy
    res.setHeader('Permissions-Policy', 'geolocation=(self), microphone=(), camera=()');
    
    next();
  };
}

/**
 * Log security events
 * @param {string} event - Event type
 * @param {Object} details - Event details
 */
function logSecurityEvent(event, details) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    event,
    ...details
  };
  
  console.warn('[SECURITY]', JSON.stringify(logEntry));
  
  // In production, send to security monitoring service
  // e.g., Sentry, DataDog, CloudWatch, etc.
}

/**
 * Detect and block suspicious requests
 * @returns {Function} Middleware
 */
function detectSuspiciousRequests() {
  return (req, res, next) => {
    // These patterns are checked against the full request (including body)
    const fullCheckPatterns = [
      // SQL injection attempts
      /(\bSELECT\b|\bUNION\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDROP\b).*(\bFROM\b|\bWHERE\b|\bTABLE\b)/i,
      
      // XSS attempts
      /<script[^>]*>.*<\/script>/i,
      /javascript:/i,
      /on\w+\s*=/i,
      
      // Path traversal
      /\.\.[\/\\]/,
    ];

    // Command injection characters — only checked in query/params, NOT body,
    // because body content (notes, messages, etc.) legitimately contains ; | $ &
    const paramsOnlyPatterns = [
      /[;&|`$]/
    ];
    
    const fullCheckString = JSON.stringify({
      query: req.query,
      body: req.body,
      params: req.params
    });

    const paramsOnlyString = JSON.stringify({
      query: req.query,
      params: req.params
    });
    
    for (const pattern of fullCheckPatterns) {
      if (pattern.test(fullCheckString)) {
        logSecurityEvent('suspicious_request_blocked', {
          ip: req.ip,
          path: req.path,
          method: req.method,
          pattern: pattern.toString(),
          userId: req.user?._id
        });
        
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'Suspicious request pattern detected'
        });
      }
    }

    for (const pattern of paramsOnlyPatterns) {
      if (pattern.test(paramsOnlyString)) {
        logSecurityEvent('suspicious_request_blocked', {
          ip: req.ip,
          path: req.path,
          method: req.method,
          pattern: pattern.toString(),
          userId: req.user?._id
        });
        
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'Suspicious request pattern detected'
        });
      }
    }
    
    next();
  };
}

/**
 * Monitor failed authentication attempts
 * @returns {Function} Middleware
 */
function monitorAuthFailures() {
  const failedAttempts = new Map();
  const BLOCK_THRESHOLD = 10;
  const BLOCK_DURATION = 15 * 60 * 1000; // 15 minutes
  
  return (req, res, next) => {
    const identifier = req.ip;
    
    // Check if IP is blocked
    const blockInfo = failedAttempts.get(identifier);
    if (blockInfo && blockInfo.blocked) {
      if (Date.now() < blockInfo.blockedUntil) {
        logSecurityEvent('blocked_ip_attempt', {
          ip: identifier,
          path: req.path,
          remainingTime: Math.ceil((blockInfo.blockedUntil - Date.now()) / 1000)
        });
        
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'Too many failed attempts. Please try again later.'
        });
      } else {
        // Block expired, reset
        failedAttempts.delete(identifier);
      }
    }
    
    // Intercept response to track failures
    const originalJson = res.json;
    res.json = function(data) {
      if (req.path.includes('/auth/') && data.success === false) {
        const attempts = failedAttempts.get(identifier) || { count: 0, firstAttempt: Date.now() };
        attempts.count++;
        attempts.lastAttempt = Date.now();
        
        if (attempts.count >= BLOCK_THRESHOLD) {
          attempts.blocked = true;
          attempts.blockedUntil = Date.now() + BLOCK_DURATION;
          
          logSecurityEvent('ip_blocked', {
            ip: identifier,
            attempts: attempts.count,
            duration: BLOCK_DURATION / 1000
          });
        }
        
        failedAttempts.set(identifier, attempts);
      }
      
      return originalJson.call(this, data);
    };
    
    next();
  };
}

/**
 * Validate request origin
 * @param {Array} allowedOrigins - List of allowed origins
 * @returns {Function} Middleware
 */
function validateOrigin(allowedOrigins) {
  return (req, res, next) => {
    const origin = req.get('origin');
    
    if (!origin) {
      // No origin header (same-origin request or non-browser client)
      return next();
    }
    
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      return next();
    }
    
    logSecurityEvent('invalid_origin', {
      origin,
      ip: req.ip,
      path: req.path
    });
    
    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Invalid request origin'
    });
  };
}

/**
 * Prevent brute force attacks on specific endpoints
 * @param {Object} options - Configuration options
 * @returns {Function} Middleware
 */
function preventBruteForce(options = {}) {
  const {
    maxAttempts = 5,
    windowMs = 15 * 60 * 1000, // 15 minutes
    blockDuration = 60 * 60 * 1000 // 1 hour
  } = options;
  
  const attempts = new Map();
  
  return (req, res, next) => {
    const identifier = req.user?._id?.toString() || req.ip;
    const now = Date.now();
    
    let userAttempts = attempts.get(identifier);
    
    // Clean up old attempts
    if (userAttempts && now - userAttempts.windowStart > windowMs) {
      attempts.delete(identifier);
      userAttempts = null;
    }
    
    // Check if blocked
    if (userAttempts && userAttempts.blocked && now < userAttempts.blockedUntil) {
      return res.status(429).json({
        success: false,
        error: 'Too many attempts',
        message: 'Account temporarily locked due to too many failed attempts',
        retryAfter: Math.ceil((userAttempts.blockedUntil - now) / 1000)
      });
    }
    
    // Initialize or increment attempts
    if (!userAttempts) {
      userAttempts = {
        count: 0,
        windowStart: now,
        blocked: false
      };
    }
    
    // Intercept response to track failures
    const originalJson = res.json;
    res.json = function(data) {
      if (data.success === false) {
        userAttempts.count++;
        
        if (userAttempts.count >= maxAttempts) {
          userAttempts.blocked = true;
          userAttempts.blockedUntil = now + blockDuration;
          
          logSecurityEvent('brute_force_detected', {
            identifier,
            attempts: userAttempts.count,
            path: req.path
          });
        }
        
        attempts.set(identifier, userAttempts);
      } else {
        // Success - reset attempts
        attempts.delete(identifier);
      }
      
      return originalJson.call(this, data);
    };
    
    next();
  };
}

/**
 * Comprehensive security middleware stack
 * @param {Object} options - Configuration options
 * @returns {Array} Array of middleware functions
 */
function securityMiddlewareStack(options = {}) {
  const {
    enableHelmet = true,
    enableInputSanitization = true,
    enableRateLimiting = true,
    enableSuspiciousDetection = true,
    enableAuthMonitoring = true,
    allowedOrigins = []
  } = options;
  
  const middleware = [];
  
  if (enableHelmet) {
    middleware.push(configureHelmet());
  }
  
  middleware.push(addSecurityHeaders());
  middleware.push(preventParameterPollution());
  
  if (enableInputSanitization) {
    middleware.push(sanitizeAllInputs());
  }
  
  if (enableRateLimiting) {
    middleware.push(generalApiLimiter);
  }
  
  if (enableSuspiciousDetection) {
    middleware.push(detectSuspiciousRequests());
  }
  
  if (enableAuthMonitoring) {
    middleware.push(monitorAuthFailures());
  }
  
  if (allowedOrigins.length > 0) {
    middleware.push(validateOrigin(allowedOrigins));
  }
  
  return middleware;
}

module.exports = {
  configureHelmet,
  preventParameterPollution,
  addSecurityHeaders,
  logSecurityEvent,
  detectSuspiciousRequests,
  monitorAuthFailures,
  validateOrigin,
  preventBruteForce,
  securityMiddlewareStack
};
