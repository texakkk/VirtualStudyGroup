// config/redis.js
const redis = require('redis');

let redisClient = null;
let isConnected = false;

/**
 * Initialize Redis client with connection handling
 */
const initializeRedis = async () => {
  try {
    // Create Redis client
    redisClient = redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.error('❌ Redis: Max reconnection attempts reached');
            return new Error('Max reconnection attempts reached');
          }
          // Exponential backoff: 50ms, 100ms, 200ms, etc.
          return Math.min(retries * 50, 3000);
        },
        connectTimeout: 10000,
        keepAlive: 30000,
        noDelay: true
      },
      // Disable offline queue to fail fast
      enableOfflineQueue: false,
      // Connection pool settings
      maxRetriesPerRequest: 3
    });

    // Event handlers
    redisClient.on('connect', () => {
      console.log('🔄 Redis: Connecting...');
    });

    redisClient.on('ready', () => {
      isConnected = true;
      console.log('✅ Redis: Connected and ready');
    });

    redisClient.on('error', (err) => {
      isConnected = false;
      console.error('❌ Redis Error:', err.message);
    });

    redisClient.on('end', () => {
      isConnected = false;
      console.log('🔌 Redis: Connection closed');
    });

    redisClient.on('reconnecting', () => {
      console.log('🔄 Redis: Reconnecting...');
    });

    // Connect to Redis
    await redisClient.connect();
    
    return redisClient;
  } catch (error) {
    console.error('❌ Redis initialization failed:', error.message);
    console.log('⚠️  Application will continue without Redis caching');
    isConnected = false;
    return null;
  }
};

/**
 * Get Redis client instance
 */
const getRedisClient = () => {
  return redisClient;
};

/**
 * Check if Redis is connected
 */
const isRedisConnected = () => {
  return isConnected && redisClient && redisClient.isOpen;
};

/**
 * Gracefully close Redis connection
 */
const closeRedis = async () => {
  if (redisClient && redisClient.isOpen) {
    try {
      await redisClient.quit();
      console.log('✅ Redis connection closed gracefully');
    } catch (error) {
      console.error('❌ Error closing Redis connection:', error.message);
      // Force close if graceful close fails
      await redisClient.disconnect();
    }
  }
};

module.exports = {
  initializeRedis,
  getRedisClient,
  isRedisConnected,
  closeRedis
};
