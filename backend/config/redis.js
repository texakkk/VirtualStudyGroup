// config/redis.js
const redis = require('redis');

let redisClient = null;
let isConnected = false;

/**
 * Initialize Redis client with connection handling
 */
const initializeRedis = async () => {
  // Skip Redis if explicitly disabled
  if (process.env.REDIS_URL === 'disabled' || process.env.REDIS_URL === 'false') {
    console.log('⚠️  Redis: Disabled via REDIS_URL environment variable');
    return null;
  }

  try {
    // Skip Redis if no URL configured and not in development
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    if (!process.env.REDIS_URL && process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
      console.log('⚠️  Redis: Not configured for this environment (set REDIS_URL to enable)');
      return null;
    }

    // Create Redis client
    redisClient = redis.createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries) => {
          // On Render/production, fail fast if Redis isn't available
          const maxRetries = process.env.REDIS_MAX_RETRIES || 2;
          if (retries > maxRetries) {
            console.error('❌ Redis: Max reconnection attempts reached. Application will continue without caching.');
            return new Error('Max reconnection attempts reached');
          }
          // Exponential backoff: 50ms, 100ms, 150ms
          return Math.min(retries * 50, 500);
        },
        connectTimeout: 3000,
        keepAlive: 30000,
        noDelay: true
      },
      // Disable offline queue to fail fast
      enableOfflineQueue: false,
      // Connection pool settings
      maxRetriesPerRequest: 1
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
