const jwt = require('jsonwebtoken');
const redisClient = require('../db/redis');
const { logTokenBlacklist } = require('../utils/securityLogger');
const config = require('../config/env');

/**
 * Token Blacklist Service
 * Manages revoked JWT tokens using Redis (or in-memory fallback)
 */

const BLACKLIST_PREFIX = 'blacklist:token:';

/**
 * Add token to blacklist
 * @param {string} token - JWT token to blacklist
 * @param {string} userId - User ID (for logging)
 * @param {string} ip - IP address (for logging)
 * @returns {Promise<boolean>} Success status
 */
const addToBlacklist = async (token, userId, ip = 'unknown') => {
  try {
    // Decode token to get expiration
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.exp) {
      throw new Error('Invalid token or missing expiration');
    }

    // Calculate TTL (time until token naturally expires)
    const now = Math.floor(Date.now() / 1000);
    const ttl = decoded.exp - now;

    if (ttl <= 0) {
      // Token already expired, no need to blacklist
      return true;
    }

    // Generate unique token ID (last 16 chars of token)
    const tokenId = token.substring(token.length - 16);
    const key = `${BLACKLIST_PREFIX}${tokenId}`;

    // Store in Redis/Memory with TTL matching token expiration
    await redisClient.set(key, JSON.stringify({
      userId,
      blacklistedAt: new Date().toISOString(),
      expiresAt: new Date(decoded.exp * 1000).toISOString(),
      ip
    }), ttl);

    // Log the blacklist event
    logTokenBlacklist('add', userId, tokenId, ip);

    return true;
  } catch (error) {
    console.error('Error adding token to blacklist:', error);
    return false;
  }
};

/**
 * Check if token is blacklisted
 * @param {string} token - JWT token to check
 * @returns {Promise<boolean>} True if blacklisted
 */
const isBlacklisted = async (token) => {
  try {
    // Generate token ID
    const tokenId = token.substring(token.length - 16);
    const key = `${BLACKLIST_PREFIX}${tokenId}`;

    // Check if exists in Redis/Memory
    const exists = await redisClient.exists(key);

    if (exists) {
      // Log the check (optional, can be verbose)
      const data = await redisClient.get(key);
      const parsed = data ? JSON.parse(data) : {};
      logTokenBlacklist('check', parsed.userId || 'unknown', tokenId, parsed.ip || 'unknown');
    }

    return exists;
  } catch (error) {
    console.error('Error checking token blacklist:', error);
    // Fail-open: if we can't check, allow the token (better UX)
    // Alternative: fail-closed for maximum security
    return false;
  }
};

/**
 * Remove token from blacklist (manual unblock)
 * @param {string} token - JWT token to remove
 * @returns {Promise<boolean>} Success status
 */
const removeFromBlacklist = async (token) => {
  try {
    const tokenId = token.substring(token.length - 16);
    const key = `${BLACKLIST_PREFIX}${tokenId}`;

    await redisClient.del(key);
    return true;
  } catch (error) {
    console.error('Error removing token from blacklist:', error);
    return false;
  }
};

/**
 * Get blacklist info for a token
 * @param {string} token - JWT token
 * @returns {Promise<object|null>} Blacklist info or null
 */
const getBlacklistInfo = async (token) => {
  try {
    const tokenId = token.substring(token.length - 16);
    const key = `${BLACKLIST_PREFIX}${tokenId}`;

    const data = await redisClient.get(key);
    if (!data) return null;

    const info = JSON.parse(data);
    const ttl = await redisClient.ttl(key);

    return {
      ...info,
      tokenId,
      ttlSeconds: ttl
    };
  } catch (error) {
    console.error('Error getting blacklist info:', error);
    return null;
  }
};

/**
 * Blacklist all tokens for a user (emergency logout)
 * Note: This requires storing user->tokens mapping, which we don't have
 * For now, this is a placeholder for future enhancement
 */
const blacklistUserTokens = async (userId) => {
  // TODO: Implement user token tracking if needed
  // This would require storing issued tokens per user
  console.warn('blacklistUserTokens not fully implemented - requires token tracking');
  return false;
};

/**
 * Get statistics about blacklisted tokens
 * Note: This requires scanning Redis keys, which is expensive
 * Only use for admin dashboards, not regular operations
 */
const getBlacklistStats = async () => {
  try {
    if (!redisClient.isRedisAvailable()) {
      return {
        type: 'memory',
        message: 'Using in-memory store, stats not available'
      };
    }

    // This is expensive! Only use sparingly
    const keys = await redisClient.redis.keys(`${BLACKLIST_PREFIX}*`);

    return {
      type: 'redis',
      totalBlacklisted: keys.length
    };
  } catch (error) {
    console.error('Error getting blacklist stats:', error);
    return {
      error: error.message
    };
  }
};

module.exports = {
  addToBlacklist,
  isBlacklisted,
  removeFromBlacklist,
  getBlacklistInfo,
  blacklistUserTokens,
  getBlacklistStats
};
