// services/cacheService.js
const { getRedisClient, isRedisConnected } = require('../config/redis');

/**
 * Cache Service for managing Redis caching operations
 * Provides fallback mechanisms when Redis is unavailable
 */
class CacheService {
  constructor() {
    // In-memory fallback cache when Redis is unavailable
    this.memoryCache = new Map();
    this.memoryTTL = new Map();
    
    // Cache key prefixes for organization
    this.prefixes = {
      USER: 'user:',
      GROUP: 'group:',
      SESSION: 'session:',
      QUERY: 'query:',
      FILE: 'file:',
      NOTIFICATION: 'notification:',
      SOCKET_ROOM: 'socket:room:',
      ACTIVE_USERS: 'active:users:',
      MESSAGE: 'message:',
      TASK: 'task:'
    };

    // Default TTL values (in seconds)
    this.ttl = {
      SHORT: 300,        // 5 minutes - for frequently changing data
      MEDIUM: 1800,      // 30 minutes - for moderately stable data
      LONG: 3600,        // 1 hour - for stable data
      VERY_LONG: 86400,  // 24 hours - for rarely changing data
      SESSION: 604800    // 7 days - for user sessions
    };

    // Start memory cache cleanup interval
    this.startMemoryCacheCleanup();
  }

  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @returns {Promise<any>} - Cached value or null
   */
  async get(key) {
    try {
      if (isRedisConnected()) {
        const client = getRedisClient();
        const value = await client.get(key);
        return value ? JSON.parse(value) : null;
      } else {
        // Fallback to memory cache
        return this.getFromMemory(key);
      }
    } catch (error) {
      console.error(`Cache get error for key ${key}:`, error.message);
      return null;
    }
  }

  /**
   * Set value in cache with TTL
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in seconds
   * @returns {Promise<boolean>} - Success status
   */
  async set(key, value, ttl = this.ttl.MEDIUM) {
    try {
      const serialized = JSON.stringify(value);
      
      if (isRedisConnected()) {
        const client = getRedisClient();
        await client.setEx(key, ttl, serialized);
        return true;
      } else {
        // Fallback to memory cache
        return this.setInMemory(key, value, ttl);
      }
    } catch (error) {
      console.error(`Cache set error for key ${key}:`, error.message);
      return false;
    }
  }

  /**
   * Delete value from cache
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} - Success status
   */
  async del(key) {
    try {
      if (isRedisConnected()) {
        const client = getRedisClient();
        await client.del(key);
        return true;
      } else {
        // Fallback to memory cache
        this.memoryCache.delete(key);
        this.memoryTTL.delete(key);
        return true;
      }
    } catch (error) {
      console.error(`Cache delete error for key ${key}:`, error.message);
      return false;
    }
  }

  /**
   * Delete multiple keys matching a pattern
   * @param {string} pattern - Key pattern (e.g., 'user:*')
   * @returns {Promise<number>} - Number of keys deleted
   */
  async delPattern(pattern) {
    try {
      if (isRedisConnected()) {
        const client = getRedisClient();
        const keys = await client.keys(pattern);
        if (keys.length > 0) {
          await client.del(keys);
          return keys.length;
        }
        return 0;
      } else {
        // Fallback to memory cache
        let count = 0;
        const regex = new RegExp(pattern.replace('*', '.*'));
        for (const key of this.memoryCache.keys()) {
          if (regex.test(key)) {
            this.memoryCache.delete(key);
            this.memoryTTL.delete(key);
            count++;
          }
        }
        return count;
      }
    } catch (error) {
      console.error(`Cache delete pattern error for ${pattern}:`, error.message);
      return 0;
    }
  }

  /**
   * Check if key exists in cache
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} - Existence status
   */
  async exists(key) {
    try {
      if (isRedisConnected()) {
        const client = getRedisClient();
        const result = await client.exists(key);
        return result === 1;
      } else {
        return this.memoryCache.has(key);
      }
    } catch (error) {
      console.error(`Cache exists error for key ${key}:`, error.message);
      return false;
    }
  }

  /**
   * Increment a numeric value in cache
   * @param {string} key - Cache key
   * @param {number} increment - Amount to increment by
   * @returns {Promise<number>} - New value
   */
  async incr(key, increment = 1) {
    try {
      if (isRedisConnected()) {
        const client = getRedisClient();
        return await client.incrBy(key, increment);
      } else {
        const current = this.memoryCache.get(key) || 0;
        const newValue = current + increment;
        this.memoryCache.set(key, newValue);
        return newValue;
      }
    } catch (error) {
      console.error(`Cache increment error for key ${key}:`, error.message);
      return 0;
    }
  }

  /**
   * Set expiration time for a key
   * @param {string} key - Cache key
   * @param {number} ttl - Time to live in seconds
   * @returns {Promise<boolean>} - Success status
   */
  async expire(key, ttl) {
    try {
      if (isRedisConnected()) {
        const client = getRedisClient();
        await client.expire(key, ttl);
        return true;
      } else {
        if (this.memoryCache.has(key)) {
          this.memoryTTL.set(key, Date.now() + (ttl * 1000));
          return true;
        }
        return false;
      }
    } catch (error) {
      console.error(`Cache expire error for key ${key}:`, error.message);
      return false;
    }
  }

  // ==================== Specialized Cache Methods ====================

  /**
   * Cache user data
   */
  async cacheUser(userId, userData, ttl = this.ttl.LONG) {
    const key = `${this.prefixes.USER}${userId}`;
    return await this.set(key, userData, ttl);
  }

  /**
   * Get cached user data
   */
  async getUser(userId) {
    const key = `${this.prefixes.USER}${userId}`;
    return await this.get(key);
  }

  /**
   * Invalidate user cache
   */
  async invalidateUser(userId) {
    const key = `${this.prefixes.USER}${userId}`;
    return await this.del(key);
  }

  /**
   * Cache group data
   */
  async cacheGroup(groupId, groupData, ttl = this.ttl.LONG) {
    const key = `${this.prefixes.GROUP}${groupId}`;
    return await this.set(key, groupData, ttl);
  }

  /**
   * Get cached group data
   */
  async getGroup(groupId) {
    const key = `${this.prefixes.GROUP}${groupId}`;
    return await this.get(key);
  }

  /**
   * Invalidate group cache
   */
  async invalidateGroup(groupId) {
    const key = `${this.prefixes.GROUP}${groupId}`;
    return await this.del(key);
  }

  /**
   * Cache session data
   */
  async cacheSession(sessionId, sessionData, ttl = this.ttl.SESSION) {
    const key = `${this.prefixes.SESSION}${sessionId}`;
    return await this.set(key, sessionData, ttl);
  }

  /**
   * Get cached session data
   */
  async getSession(sessionId) {
    const key = `${this.prefixes.SESSION}${sessionId}`;
    return await this.get(key);
  }

  /**
   * Invalidate session cache
   */
  async invalidateSession(sessionId) {
    const key = `${this.prefixes.SESSION}${sessionId}`;
    return await this.del(key);
  }

  /**
   * Cache query results
   */
  async cacheQuery(queryKey, results, ttl = this.ttl.MEDIUM) {
    const key = `${this.prefixes.QUERY}${queryKey}`;
    return await this.set(key, results, ttl);
  }

  /**
   * Get cached query results
   */
  async getQuery(queryKey) {
    const key = `${this.prefixes.QUERY}${queryKey}`;
    return await this.get(key);
  }

  /**
   * Invalidate query cache by pattern
   */
  async invalidateQueryPattern(pattern) {
    const fullPattern = `${this.prefixes.QUERY}${pattern}`;
    return await this.delPattern(fullPattern);
  }

  /**
   * Cache Socket.IO room data
   */
  async cacheSocketRoom(roomId, roomData, ttl = this.ttl.SHORT) {
    const key = `${this.prefixes.SOCKET_ROOM}${roomId}`;
    return await this.set(key, roomData, ttl);
  }

  /**
   * Get cached Socket.IO room data
   */
  async getSocketRoom(roomId) {
    const key = `${this.prefixes.SOCKET_ROOM}${roomId}`;
    return await this.get(key);
  }

  /**
   * Track active users in a group
   */
  async addActiveUser(groupId, userId, ttl = this.ttl.SHORT) {
    const key = `${this.prefixes.ACTIVE_USERS}${groupId}`;
    try {
      if (isRedisConnected()) {
        const client = getRedisClient();
        await client.sAdd(key, userId.toString());
        await client.expire(key, ttl);
        return true;
      } else {
        const activeUsers = this.memoryCache.get(key) || new Set();
        activeUsers.add(userId.toString());
        this.memoryCache.set(key, activeUsers);
        this.memoryTTL.set(key, Date.now() + (ttl * 1000));
        return true;
      }
    } catch (error) {
      console.error(`Error adding active user:`, error.message);
      return false;
    }
  }

  /**
   * Remove active user from a group
   */
  async removeActiveUser(groupId, userId) {
    const key = `${this.prefixes.ACTIVE_USERS}${groupId}`;
    try {
      if (isRedisConnected()) {
        const client = getRedisClient();
        await client.sRem(key, userId.toString());
        return true;
      } else {
        const activeUsers = this.memoryCache.get(key);
        if (activeUsers) {
          activeUsers.delete(userId.toString());
          this.memoryCache.set(key, activeUsers);
        }
        return true;
      }
    } catch (error) {
      console.error(`Error removing active user:`, error.message);
      return false;
    }
  }

  /**
   * Get all active users in a group
   */
  async getActiveUsers(groupId) {
    const key = `${this.prefixes.ACTIVE_USERS}${groupId}`;
    try {
      if (isRedisConnected()) {
        const client = getRedisClient();
        const members = await client.sMembers(key);
        return members;
      } else {
        const activeUsers = this.memoryCache.get(key);
        return activeUsers ? Array.from(activeUsers) : [];
      }
    } catch (error) {
      console.error(`Error getting active users:`, error.message);
      return [];
    }
  }

  // ==================== Memory Cache Fallback Methods ====================

  /**
   * Get value from memory cache
   */
  getFromMemory(key) {
    const expiry = this.memoryTTL.get(key);
    if (expiry && Date.now() > expiry) {
      this.memoryCache.delete(key);
      this.memoryTTL.delete(key);
      return null;
    }
    const value = this.memoryCache.get(key);
    return value !== undefined ? value : null;
  }

  /**
   * Set value in memory cache
   */
  setInMemory(key, value, ttl) {
    this.memoryCache.set(key, value);
    this.memoryTTL.set(key, Date.now() + (ttl * 1000));
    return true;
  }

  /**
   * Clean up expired entries from memory cache
   */
  startMemoryCacheCleanup() {
    setInterval(() => {
      const now = Date.now();
      for (const [key, expiry] of this.memoryTTL.entries()) {
        if (now > expiry) {
          this.memoryCache.delete(key);
          this.memoryTTL.delete(key);
        }
      }
    }, 60000); // Clean up every minute
  }

  /**
   * Clear all cache (use with caution)
   */
  async clearAll() {
    try {
      if (isRedisConnected()) {
        const client = getRedisClient();
        await client.flushDb();
      }
      this.memoryCache.clear();
      this.memoryTTL.clear();
      return true;
    } catch (error) {
      console.error('Error clearing cache:', error.message);
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    try {
      if (isRedisConnected()) {
        const client = getRedisClient();
        const info = await client.info('stats');
        return {
          connected: true,
          backend: 'redis',
          info: info
        };
      } else {
        return {
          connected: false,
          backend: 'memory',
          size: this.memoryCache.size,
          keys: Array.from(this.memoryCache.keys())
        };
      }
    } catch (error) {
      console.error('Error getting cache stats:', error.message);
      return { connected: false, error: error.message };
    }
  }
}

// Export singleton instance
module.exports = new CacheService();
