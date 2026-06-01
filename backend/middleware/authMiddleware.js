const jwt = require('jsonwebtoken');
const Group = require('../models/Group');
const User = require('../models/User');
const cacheService = require('../services/cacheService');


// Authenticate User Middleware with Redis session caching
const authenticateUser = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'No token, authorization denied' 
      });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'No token, authorization denied' 
      });
    }

    // Try to check session cache first for performance (only if Redis is available)
    try {
      const cachedSession = await cacheService.getSession(token);
      if (cachedSession && cachedSession.user) {
        // Validate cached session hasn't expired
        if (cachedSession.expiresAt && new Date(cachedSession.expiresAt) > new Date()) {
          req.user = cachedSession.user;
          return next();
        } else {
          // Session expired, remove from cache
          await cacheService.invalidateSession(token);
        }
      }
    } catch (cacheError) {
      // Redis might be down, continue without cache
      console.log('Cache unavailable, proceeding with token verification');
    }

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      console.error('Token verification failed:', error.message);
      return res.status(401).json({ 
        success: false, 
        message: 'Token is not valid',
        error: error.message 
      });
    }

    // Get user from the token
    const user = await User.findById(decoded.user?._id).select('+User_tokenVersion');
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // Check token version
    if (decoded.user?.tokenVersion !== user.User_tokenVersion) {
      return res.status(401).json({ 
        success: false, 
        message: 'Session expired. Please log in again.' 
      });
    }

    // Try to cache session for 7 days (SESSION TTL) - fail silently if Redis is down
    try {
      const sessionData = {
        user: user.toObject(),
        expiresAt: new Date(Date.now() + cacheService.ttl.SESSION * 1000)
      };
      await cacheService.cacheSession(token, sessionData, cacheService.ttl.SESSION);
    } catch (cacheError) {
      // Redis might be down, continue without caching
      console.log('Unable to cache session, continuing without cache');
    }

    // Attach user to request object
    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication middleware error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error.message 
    });
  }
};

// Authorize Admin Middleware
const authorizeAdmin = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });

    const isAdmin = await group.isAdmin(userId);

    if (!isAdmin) return res.status(403).json({ message: 'Access denied, admin privileges required' });

    next();
  } catch (error) {
    res.status(500).json({ message: 'Server error during authorization' });
  }
};

module.exports = { authenticateUser, authorizeAdmin };
