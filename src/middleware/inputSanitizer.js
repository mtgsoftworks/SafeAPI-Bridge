const validator = require('validator');
const { logSuspiciousActivity } = require('../utils/securityLogger');

/**
 * Advanced Input Sanitization Middleware
 * Provides comprehensive protection against various attack vectors
 */

// Sanitization configuration
const SANITIZATION_CONFIG = {
  // Maximum field lengths
  maxStringLength: 10000,
  maxJsonDepth: 10,

  // Blocked patterns
  blockedPatterns: [
    // SQL injection patterns
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|CREATE|ALTER|EXEC|EXECUTE)\b)/i,
    /(\'|\"|;|--|\/\*|\*\/|xp_|sp_)/i,

    // XSS patterns
    /<script[^>]*>.*?<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,

    // Path traversal
    /\.\.[\/\\]/g,
    /%2e%2e[\/\\]/gi,

    // NoSQL injection
    /\{.*\$.*\}/g,

    // Command injection
    /[;&|`$(){}[\]]/g
  ],

  // Allowed content types
  allowedContentTypes: [
    'application/json',
    'application/x-www-form-urlencoded',
    'text/plain',
    'multipart/form-data'
  ]
};

/**
 * Sanitize string value
 */
const sanitizeString = (value, maxLength = SANITIZATION_CONFIG.maxStringLength) => {
  if (typeof value !== 'string') {
    return value;
  }

  // Check length
  if (value.length > maxLength) {
    throw new Error(`Input exceeds maximum length of ${maxLength} characters`);
  }

  let sanitized = value;

  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');

  // Normalize Unicode
  sanitized = sanitized.normalize('NFKC');

  // Escape HTML entities
  sanitized = validator.escape(sanitized);

  // Check for blocked patterns
  for (const pattern of SANITIZATION_CONFIG.blockedPatterns) {
    if (pattern.test(sanitized)) {
      logSuspiciousActivity('BLOCKED_PATTERN_DETECTED', {
        pattern: pattern.source,
        value: sanitized.substring(0, 100) + (sanitized.length > 100 ? '...' : '')
      });
      throw new Error('Input contains potentially malicious content');
    }
  }

  return sanitized;
};

/**
 * Sanitize object recursively
 */
const sanitizeObject = (obj, depth = 0, maxDepth = SANITIZATION_CONFIG.maxJsonDepth) => {
  if (depth > maxDepth) {
    throw new Error('Input exceeds maximum object depth');
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, depth + 1, maxDepth));
  }

  if (obj && typeof obj === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      // Sanitize key
      const sanitizedKey = sanitizeString(key, 255);

      // Sanitize value based on type
      if (typeof value === 'string') {
        sanitized[sanitizedKey] = sanitizeString(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[sanitizedKey] = sanitizeObject(value, depth + 1, maxDepth);
      } else {
        sanitized[sanitizedKey] = value;
      }
    }
    return sanitized;
  }

  return obj;
};

/**
 * Validate and sanitize request body
 */
const sanitizeRequestBody = (req, res, next) => {
  try {
    // Check content type
    const contentType = req.headers['content-type'];
    if (contentType && !SANITIZATION_CONFIG.allowedContentTypes.some(type =>
      contentType.toLowerCase().includes(type.toLowerCase())
    )) {
      return res.status(415).json({
        error: 'Unsupported Media Type',
        message: `Content type ${contentType} is not allowed`
      });
    }

    // Sanitize request body
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeObject(req.body);
    }

    // Sanitize query parameters
    if (req.query) {
      req.query = sanitizeObject(req.query);
    }

    // Sanitize path parameters
    if (req.params) {
      req.params = sanitizeObject(req.params);
    }

    next();
  } catch (error) {
    console.error('Input sanitization error:', error.message);

    return res.status(400).json({
      error: 'Invalid Input',
      message: 'Request contains invalid or potentially malicious content'
    });
  }
};

/**
 * Validate JSON structure
 */
const validateJsonStructure = (req, res, next) => {
  try {
    // Check if we have a body that should be JSON
    const contentType = req.headers['content-type'] || '';

    if (contentType.includes('application/json') && req.body) {
      // Ensure it's properly parsed JSON
      if (typeof req.body !== 'object') {
        throw new Error('Invalid JSON structure');
      }

      // Check JSON size (rough estimation)
      const jsonString = JSON.stringify(req.body);
      if (jsonString.length > SANITIZATION_CONFIG.maxStringLength) {
        throw new Error(`JSON payload too large (max ${SANITIZATION_CONFIG.maxStringLength} characters)`);
      }
    }

    next();
  } catch (error) {
    return res.status(400).json({
      error: 'JSON Validation Error',
      message: error.message
    });
  }
};

/**
 * Rate limiting for suspicious patterns
 */
const suspiciousActivityTracker = new Map();
const SUSPICIOUS_THRESHOLD = 5;
const SUSPICIOUS_WINDOW = 10 * 60 * 1000; // 10 minutes

const trackSuspiciousActivity = (ip, activityType) => {
  const now = Date.now();
  const key = `${ip}:${activityType}`;

  if (!suspiciousActivityTracker.has(key)) {
    suspiciousActivityTracker.set(key, {
      count: 1,
      firstSeen: now,
      lastSeen: now
    });
  } else {
    const data = suspiciousActivityTracker.get(key);

    // Reset if outside window
    if (now - data.firstSeen > SUSPICIOUS_WINDOW) {
      data.count = 1;
      data.firstSeen = now;
    } else {
      data.count++;
      data.lastSeen = now;
    }

    // Log if threshold exceeded
    if (data.count === SUSPICIOUS_THRESHOLD) {
      logSuspiciousActivity('REPEATED_SUSPICIOUS_ACTIVITY', {
        ip,
        activityType,
        count: data.count,
        timeWindow: SUSPICIOUS_WINDOW / 1000 / 60
      });
    }
  }

  // Clean old entries periodically
  if (Math.random() < 0.01) { // 1% chance to clean
    const cutoff = now - SUSPICIOUS_WINDOW;
    for (const [key, data] of suspiciousActivityTracker.entries()) {
      if (data.lastSeen < cutoff) {
        suspiciousActivityTracker.delete(key);
      }
    }
  }
};

/**
 * Main input sanitization middleware
 */
const inputSanitizer = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';

  try {
    // Apply sanitization
    sanitizeRequestBody(req, res, (err) => {
      if (err) return;

      validateJsonStructure(req, res, (err) => {
        if (err) return;

        // Track activity for security monitoring
        trackSuspiciousActivity(ip, 'request_processing');

        next();
      });
    });
  } catch (error) {
    console.error('Input sanitization middleware error:', error);
    return res.status(500).json({
      error: 'Sanitization Error',
      message: 'An error occurred while processing your request'
    });
  }
};

module.exports = {
  inputSanitizer,
  sanitizeString,
  sanitizeObject,
  validateJsonStructure,
  trackSuspiciousActivity
};