const { CACHE } = require('../config/constants');

/**
 * Enhanced Caching Service
 * Supports both Redis and in-memory fallback
 */

// Memory cache as fallback
const memoryCache = new Map();
const memoryCacheExpiry = new Map();

/**
 * Simple in-memory cache implementation
 */
class MemoryCache {
  constructor() {
    this.cache = new Map();
    this.expiry = new Map();
  }

  async set(key, value, ttlSeconds = 300) {
    this.cache.set(key, JSON.stringify(value));
    this.expiry.set(key, Date.now() + (ttlSeconds * 1000));
    return true;
  }

  async get(key) {
    const expiry = this.expiry.get(key);
    if (expiry && Date.now() > expiry) {
      this.cache.delete(key);
      this.expiry.delete(key);
      return null;
    }

    const value = this.cache.get(key);
    return value ? JSON.parse(value) : null;
  }

  async del(key) {
    const existed = this.cache.has(key);
    this.cache.delete(key);
    this.expiry.delete(key);
    return existed;
  }

  async exists(key) {
    const expiry = this.expiry.get(key);
    if (expiry && Date.now() > expiry) {
      this.cache.delete(key);
      this.expiry.delete(key);
      return false;
    }
    return this.cache.has(key);
  }

  async clear() {
    this.cache.clear();
    this.expiry.clear();
  }

  async keys(pattern) {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return Array.from(this.cache.keys()).filter(key => regex.test(key));
  }

  async flushdb() {
    return this.clear();
  }
}

// Redis client (when available)
let redisClient = null;
const memoryCacheService = new MemoryCache();

/**
 * Initialize Redis connection
 */
const initializeRedis = async () => {
  // Try to use Redis if available and configured
  try {
    if (process.env.REDIS_URL) {
      const Redis = require('ioredis');
      redisClient = new Redis(process.env.REDIS_URL, {
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        connectTimeout: 5000,
        commandTimeout: 5000
      });

      redisClient.on('error', (err) => {
        console.warn('Redis connection error, falling back to memory cache:', err.message);
        redisClient = null;
      });

      redisClient.on('connect', () => {
        console.log('✅ Redis connected successfully');
      });

      await redisClient.connect();
      return true;
    }
  } catch (error) {
    console.warn('Redis not available, using memory cache:', error.message);
  }
  return false;
};

/**
 * Get cache client (Redis or memory fallback)
 */
const getCacheClient = () => {
  return redisClient || memoryCacheService;
};

/**
 * Enhanced cache service with Redis and memory fallback
 */
class CacheService {
  constructor() {
    this.isRedisAvailable = false;
    this.initialize();
  }

  async initialize() {
    this.isRedisAvailable = await initializeRedis();
  }

  /**
   * Cache wrapper with TTL and error handling
   */
  async set(key, value, ttlSeconds = CACHE.DEFAULT_TTL) {
    try {
      const client = getCacheClient();
      const serializedValue = JSON.stringify(value);

      if (this.isRedisAvailable && redisClient) {
        // Redis with expiry
        await redisClient.setex(key, ttlSeconds, serializedValue);
      } else {
        // Memory cache fallback
        await client.set(key, value, ttlSeconds);
      }
      return true;
    } catch (error) {
      console.error('Cache set error:', error.message);
      return false;
    }
  }

  /**
   * Get cached value
   */
  async get(key) {
    try {
      const client = getCacheClient();

      if (this.isRedisAvailable && redisClient) {
        const value = await redisClient.get(key);
        return value ? JSON.parse(value) : null;
      } else {
        // Memory cache fallback
        return await client.get(key);
      }
    } catch (error) {
      console.error('Cache get error:', error.message);
      return null;
    }
  }

  /**
   * Delete cached value
   */
  async del(key) {
    try {
      const client = getCacheClient();
      await client.del(key);
      return true;
    } catch (error) {
      console.error('Cache delete error:', error.message);
      return false;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key) {
    try {
      const client = getCacheClient();
      return await client.exists(key);
    } catch (error) {
      console.error('Cache exists error:', error.message);
      return false;
    }
  }

  /**
   * Set cache with tags for cache invalidation
   */
  async setWithTags(key, value, tags = [], ttlSeconds = CACHE.DEFAULT_TTL) {
    try {
      // Set the main value
      await this.set(key, value, ttlSeconds);

      // Store tag relationships
      for (const tag of tags) {
        const tagKey = `tag:${tag}`;
        const tagValue = await this.get(tagKey) || [];
        if (!tagValue.includes(key)) {
          tagValue.push(key);
          await this.set(tagKey, tagValue, ttlSeconds * 2); // Tags live longer
        }
      }
      return true;
    } catch (error) {
      console.error('Cache setWithTags error:', error.message);
      return false;
    }
  }

  /**
   * Invalidate cache by tag
   */
  async invalidateByTag(tag) {
    try {
      const tagKey = `tag:${tag}`;
      const keys = await this.get(tagKey) || [];

      // Delete all keys associated with this tag
      for (const key of keys) {
        await this.del(key);
      }

      // Delete the tag itself
      await this.del(tagKey);
      return keys.length;
    } catch (error) {
      console.error('Cache invalidateByTag error:', error.message);
      return 0;
    }
  }

  /**
   * Get or set pattern (cache-aside)
   */
  async getOrSet(key, fetchFunction, ttlSeconds = CACHE.DEFAULT_TTL) {
    try {
      // Try to get from cache first
      let value = await this.get(key);

      // If not in cache, fetch and cache it
      if (value === null) {
        value = await fetchFunction();
        if (value !== null && value !== undefined) {
          await this.set(key, value, ttlSeconds);
        }
      }

      return value;
    } catch (error) {
      console.error('Cache getOrSet error:', error.message);
      // Fallback to fetch function
      return await fetchFunction();
    }
  }

  /**
   * Clear all cache
   */
  async clear() {
    try {
      const client = getCacheClient();
      await client.flushdb();
      return true;
    } catch (error) {
      console.error('Cache clear error:', error.message);
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    try {
      if (this.isRedisAvailable && redisClient) {
        const info = await redisClient.info('memory');
        return {
          type: 'redis',
          available: true,
          memory: info
        };
      } else {
        return {
          type: 'memory',
          available: true,
          size: memoryCacheService.cache.size
        };
      }
    } catch (error) {
      return {
        type: this.isRedisAvailable ? 'redis' : 'memory',
        available: false,
        error: error.message
      };
    }
  }

  /**
   * Warm up cache with common data
   */
  async warmUp(dataLoader) {
    const warmupKeys = [
      'user:quotas',
      'api:endpoints',
      'rate:limits',
      'security:patterns'
    ];

    try {
      for (const key of warmupKeys) {
        if (!(await this.exists(key))) {
          const data = await dataLoader(key);
          if (data) {
            await this.set(key, data, CACHE.WARMUP_TTL);
          }
        }
      }
    } catch (error) {
      console.error('Cache warmup error:', error.message);
    }
  }
}

// Initialize cache service
const cacheService = new CacheService();

module.exports = cacheService;
module.exports.initializeRedis = initializeRedis;