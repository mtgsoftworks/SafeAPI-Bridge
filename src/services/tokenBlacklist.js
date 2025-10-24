const jwt = require('jsonwebtoken');
const { logTokenBlacklist } = require('../utils/securityLogger');

/**
 * Token Blacklist Service (pure in-memory)
 * Stores revoked JWT tokens in-process with TTL cleanup.
 */

const store = new Map(); // key: tokenId -> { userId, ip, expiresAt, blacklistedAt }
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

const getTokenId = (token) => {
  if (typeof token !== 'string' || token.length < 16) return null;
  return token.substring(token.length - 16);
};

const addToBlacklist = async (token, userId, ip = 'unknown') => {
  try {
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.exp) return false;

    const now = Math.floor(Date.now() / 1000);
    const ttl = decoded.exp - now;
    if (ttl <= 0) return true; // already expired

    const tokenId = getTokenId(token);
    if (!tokenId) return false;

    store.set(tokenId, {
      userId,
      ip,
      blacklistedAt: new Date().toISOString(),
      expiresAt: new Date(decoded.exp * 1000).toISOString(),
      _expMs: decoded.exp * 1000
    });

    logTokenBlacklist('add', userId, tokenId, ip);
    return true;
  } catch (e) {
    console.error('Error adding token to blacklist:', e);
    return false;
  }
};

const isBlacklisted = async (token) => {
  try {
    const tokenId = getTokenId(token);
    if (!tokenId) return false;
    const entry = store.get(tokenId);
    if (!entry) return false;
    if (entry._expMs && Date.now() > entry._expMs) {
      store.delete(tokenId);
      return false;
    }
    logTokenBlacklist('check', entry.userId || 'unknown', tokenId, entry.ip || 'unknown');
    return true;
  } catch (e) {
    console.error('Error checking token blacklist:', e);
    return false;
  }
};

const removeFromBlacklist = async (token) => {
  try {
    const tokenId = getTokenId(token);
    if (!tokenId) return false;
    store.delete(tokenId);
    return true;
  } catch (e) {
    console.error('Error removing token from blacklist:', e);
    return false;
  }
};

const getBlacklistInfo = async (token) => {
  try {
    const tokenId = getTokenId(token);
    if (!tokenId) return null;
    const entry = store.get(tokenId);
    if (!entry) return null;
    const ttlSeconds = entry._expMs ? Math.max(0, Math.floor((entry._expMs - Date.now()) / 1000)) : -1;
    return { tokenId, ttlSeconds, ...entry };
  } catch (e) {
    console.error('Error getting blacklist info:', e);
    return null;
  }
};

const blacklistUserTokens = async () => {
  console.warn('blacklistUserTokens not implemented (memory store only)');
  return false;
};

const getBlacklistStats = async () => {
  return { type: 'memory', totalBlacklisted: store.size };
};

// periodic cleanup
setInterval(() => {
  const now = Date.now();
  for (const [tokenId, entry] of store.entries()) {
    if (entry._expMs && now > entry._expMs) {
      store.delete(tokenId);
    }
  }
}, CLEANUP_INTERVAL_MS);

module.exports = {
  addToBlacklist,
  isBlacklisted,
  removeFromBlacklist,
  getBlacklistInfo,
  blacklistUserTokens,
  getBlacklistStats
};
