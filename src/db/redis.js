const Redis = require('ioredis');
const { logger } = require('../utils/securityLogger');

/**
 * Redis Client Singleton
 * Used for token blacklist and caching
 * Falls back to in-memory store if Redis is unavailable
 */

let redisClient = null;
let isRedisAvailable = false;

// In-memory fallback
const memoryStore = new Map();

/**
 * Initialize Redis client
 */
const initRedis = () => {
  const REDIS_URL = process.env.REDIS_URL;

  if (!REDIS_URL) {
    logger.warn('Redis not configured. Using in-memory fallback for token blacklist.');
    logger.warn('Note: In-memory blacklist will be cleared on server restart.');
    return null;
  }

  try {
    const client = new Redis(REDIS_URL, {
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false
    });

    client.on('connect', () => {
      logger.info('Redis connected successfully');
      isRedisAvailable = true;
    });

    client.on('ready', () => {
      logger.info('Redis ready to accept commands');
    });

    client.on('error', (err) => {
      logger.error('Redis connection error:', { error: err.message });
      isRedisAvailable = false;
    });

    client.on('close', () => {
      logger.warn('Redis connection closed');
      isRedisAvailable = false;
    });

    client.on('reconnecting', () => {
      logger.info('Redis reconnecting...');
    });

    return client;
  } catch (error) {
    logger.error('Failed to initialize Redis:', { error: error.message });
    return null;
  }
};

// Initialize Redis on module load
redisClient = initRedis();

/**
 * Set key with expiration
 */
const set = async (key, value, expirationSeconds = null) => {
  try {
    if (isRedisAvailable && redisClient) {
      if (expirationSeconds) {
        await redisClient.setex(key, expirationSeconds, value);
      } else {
        await redisClient.set(key, value);
      }
      return true;
    } else {
      // Fallback to memory
      memoryStore.set(key, {
        value,
        expiresAt: expirationSeconds ? Date.now() + (expirationSeconds * 1000) : null
      });
      return true;
    }
  } catch (error) {
    logger.error('Redis SET error:', { key, error: error.message });
    // Fallback to memory on error
    memoryStore.set(key, {
      value,
      expiresAt: expirationSeconds ? Date.now() + (expirationSeconds * 1000) : null
    });
    return false;
  }
};

/**
 * Get key
 */
const get = async (key) => {
  try {
    if (isRedisAvailable && redisClient) {
      const value = await redisClient.get(key);
      return value;
    } else {
      // Fallback to memory
      const entry = memoryStore.get(key);
      if (!entry) return null;

      // Check expiration
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        memoryStore.delete(key);
        return null;
      }

      return entry.value;
    }
  } catch (error) {
    logger.error('Redis GET error:', { key, error: error.message });
    // Try memory fallback
    const entry = memoryStore.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      memoryStore.delete(key);
      return null;
    }
    return entry.value;
  }
};

/**
 * Delete key
 */
const del = async (key) => {
  try {
    if (isRedisAvailable && redisClient) {
      await redisClient.del(key);
      return true;
    } else {
      memoryStore.delete(key);
      return true;
    }
  } catch (error) {
    logger.error('Redis DEL error:', { key, error: error.message });
    memoryStore.delete(key);
    return false;
  }
};

/**
 * Check if key exists
 */
const exists = async (key) => {
  try {
    if (isRedisAvailable && redisClient) {
      const result = await redisClient.exists(key);
      return result === 1;
    } else {
      const entry = memoryStore.get(key);
      if (!entry) return false;

      // Check expiration
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        memoryStore.delete(key);
        return false;
      }

      return true;
    }
  } catch (error) {
    logger.error('Redis EXISTS error:', { key, error: error.message });
    const entry = memoryStore.get(key);
    if (!entry) return false;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      memoryStore.delete(key);
      return false;
    }
    return true;
  }
};

/**
 * Get time to live (TTL) for a key
 */
const ttl = async (key) => {
  try {
    if (isRedisAvailable && redisClient) {
      const seconds = await redisClient.ttl(key);
      return seconds;
    } else {
      const entry = memoryStore.get(key);
      if (!entry || !entry.expiresAt) return -1;

      const remaining = Math.floor((entry.expiresAt - Date.now()) / 1000);
      return remaining > 0 ? remaining : -2;
    }
  } catch (error) {
    logger.error('Redis TTL error:', { key, error: error.message });
    return -1;
  }
};

/**
 * Clean up expired keys from memory store (periodic cleanup)
 */
const cleanupMemoryStore = () => {
  const now = Date.now();
  for (const [key, entry] of memoryStore.entries()) {
    if (entry.expiresAt && now > entry.expiresAt) {
      memoryStore.delete(key);
    }
  }
};

// Run memory cleanup every 5 minutes
setInterval(cleanupMemoryStore, 5 * 60 * 1000);

/**
 * Graceful shutdown
 */
const closeRedis = async () => {
  if (redisClient) {
    await redisClient.quit();
    logger.info('Redis connection closed gracefully');
  }
};

// Handle process termination
process.on('SIGTERM', closeRedis);
process.on('SIGINT', closeRedis);

module.exports = {
  redis: redisClient,
  isRedisAvailable: () => isRedisAvailable,
  set,
  get,
  del,
  exists,
  ttl,
  closeRedis
};
