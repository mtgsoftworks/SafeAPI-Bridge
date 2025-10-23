const Redis = require('ioredis');
const NodeCache = require('node-cache');
const crypto = require('crypto');

/**
 * Cache Service
 * Supports Redis (primary) with NodeCache fallback
 */

class CacheService {
  constructor() {
    this.redis = null;
    this.nodeCache = new NodeCache({ stdTTL: 300 }); // 5 minutes default
    this.usingRedis = false;

    this.initialize();
  }

  /**
   * Initialize Redis connection
   */
  initialize() {
    try {
      if (process.env.REDIS_URL) {
        this.redis = new Redis(process.env.REDIS_URL, {
          retryStrategy: (times) => {
            if (times > 3) {
              console.warn('⚠️ Redis connection failed, using in-memory cache');
              return null;
            }
            return Math.min(times * 50, 2000);
          }
        });

        this.redis.on('connect', () => {
          console.log('✅ Redis connected');
          this.usingRedis = true;
        });

        this.redis.on('error', (err) => {
          console.error('❌ Redis error:', err.message);
          this.usingRedis = false;
        });
      } else {
        console.log('ℹ️  No REDIS_URL found, using in-memory cache');
      }
    } catch (error) {
      console.error('Error initializing Redis:', error);
    }
  }

  /**
   * Generate cache key from request
   */
  generateKey(api, endpoint, body) {
    const hash = crypto
      .createHash('md5')
      .update(JSON.stringify(body))
      .digest('hex');
    return `cache:${api}:${endpoint}:${hash}`;
  }

  /**
   * Get cached value
   */
  async get(key) {
    try {
      if (this.usingRedis && this.redis) {
        const value = await this.redis.get(key);
        return value ? JSON.parse(value) : null;
      }

      return this.nodeCache.get(key) || null;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  /**
   * Set cache value
   */
  async set(key, value, ttl = 300) {
    try {
      if (this.usingRedis && this.redis) {
        await this.redis.setex(key, ttl, JSON.stringify(value));
        return true;
      }

      this.nodeCache.set(key, value, ttl);
      return true;
    } catch (error) {
      console.error('Cache set error:', error);
      return false;
    }
  }

  /**
   * Delete cached value
   */
  async del(key) {
    try {
      if (this.usingRedis && this.redis) {
        await this.redis.del(key);
        return true;
      }

      this.nodeCache.del(key);
      return true;
    } catch (error) {
      console.error('Cache delete error:', error);
      return false;
    }
  }

  /**
   * Clear all cache
   */
  async clear() {
    try {
      if (this.usingRedis && this.redis) {
        await this.redis.flushdb();
        return true;
      }

      this.nodeCache.flushAll();
      return true;
    } catch (error) {
      console.error('Cache clear error:', error);
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    if (this.usingRedis) {
      return { type: 'redis', connected: this.usingRedis };
    }

    const stats = this.nodeCache.getStats();
    return { type: 'in-memory', ...stats };
  }
}

// Export singleton instance
module.exports = new CacheService();
