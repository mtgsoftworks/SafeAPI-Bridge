const crypto = require('crypto');
const { logFailedAuth, logAdminOperation } = require('../utils/securityLogger');
const { trackFailedAuth, isLockedOut } = require('./securityMonitor');

/**
 * Enhanced Admin Authentication Middleware
 * Features:
 * - Timing-safe comparison (prevents timing attacks)
 * - Failed attempt tracking
 * - Audit logging
 * - Rate limiting integration
 */

/**
 * Create a hash of admin key for logging (privacy)
 */
const hashAdminKey = (key) => {
  if (!key) return 'unknown';
  return crypto.createHash('sha256').update(key).digest('hex').substring(0, 16);
};

/**
 * Timing-safe string comparison
 * Prevents timing attacks by ensuring constant-time comparison
 */
const timingSafeCompare = (a, b) => {
  if (!a || !b) return false;

  // Ensure same length (pad shorter one)
  const maxLen = Math.max(a.length, b.length);
  const bufferA = Buffer.alloc(maxLen);
  const bufferB = Buffer.alloc(maxLen);

  bufferA.write(a);
  bufferB.write(b);

  try {
    return crypto.timingSafeEqual(bufferA, bufferB);
  } catch (error) {
    return false;
  }
};

/**
 * Admin Authentication Middleware
 */
const adminAuth = (req, res, next) => {
  const adminKey = req.headers['x-admin-key'];
  const expectedKey = process.env.ADMIN_API_KEY;
  const ip = req.clientIp || req.ip || req.headers['x-forwarded-for'] || 'unknown';

  // Check if IP is locked out due to failed attempts
  if (isLockedOut(ip)) {
    logFailedAuth('admin', 'locked-out', ip, 'IP temporarily locked due to multiple failed attempts');
    return res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many failed authentication attempts. Please try again later.',
      retryAfter: '15 minutes'
    });
  }

  // Validate admin key presence
  if (!adminKey) {
    const attempts = trackFailedAuth(ip);
    logFailedAuth('admin', 'no-key', ip, 'Missing admin key');

    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Admin authentication required',
      attemptsRemaining: Math.max(0, 5 - attempts)
    });
  }

  // Validate expected key configuration
  if (!expectedKey) {
    logFailedAuth('admin', 'misconfigured', ip, 'ADMIN_API_KEY not configured');
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Admin authentication not configured'
    });
  }

  // Timing-safe comparison
  const isValid = timingSafeCompare(adminKey, expectedKey);

  if (!isValid) {
    const attempts = trackFailedAuth(ip);
    const keyHash = hashAdminKey(adminKey);

    logFailedAuth('admin', keyHash, ip, `Invalid admin key (attempt ${attempts})`);

    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid admin key',
      attemptsRemaining: Math.max(0, 5 - attempts)
    });
  }

  // Successful authentication
  const keyHash = hashAdminKey(adminKey);

  // Attach admin info to request
  req.admin = {
    authenticated: true,
    keyHash,
    ip
  };

  // Log admin operation (will be detailed in route handlers)
  req.logAdminAction = (action, details = {}) => {
    logAdminOperation(action, keyHash, ip, details);
  };

  next();
};

/**
 * Admin rate limiter (stricter than global)
 * 5 requests per 15 minutes
 */
const { rateLimit } = require('express-rate-limit');
const { logRateLimitExceeded } = require('../utils/securityLogger');

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: {
    error: 'Too Many Requests',
    message: 'Admin rate limit exceeded. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const ip = req.clientIp || req.ip || 'unknown';
    logRateLimitExceeded('admin', ip, req.path);

    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Admin rate limit exceeded. Please try again later.',
      retryAfter: '15 minutes'
    });
  }
});

module.exports = {
  adminAuth,
  adminLimiter,
  hashAdminKey,
  timingSafeCompare
};
