const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

/**
 * Winston Security Logger
 * Structured logging with security event tracking
 */

const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, '../../logs');
const LOG_LEVEL = process.env.LOG_LEVEL || (process.env.LIGHT_MODE === 'true' ? 'warn' : 'info');
const NODE_ENV = process.env.NODE_ENV || 'development';
const DISABLE_FILE_LOGS = process.env.DISABLE_FILE_LOGS === 'true' || process.env.LIGHT_MODE === 'true';

// Custom log levels for security events
const customLevels = {
  levels: {
    error: 0,
    warn: 1,
    security: 2,
    info: 3,
    http: 4,
    debug: 5
  },
  colors: {
    error: 'red',
    warn: 'yellow',
    security: 'magenta',
    info: 'green',
    http: 'cyan',
    debug: 'blue'
  }
};

winston.addColors(customLevels.colors);

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let metaStr = '';
    if (Object.keys(meta).length > 0) {
      metaStr = '\n' + JSON.stringify(meta, null, 2);
    }
    return `${timestamp} [${level}]: ${message}${metaStr}`;
  })
);

// JSON format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create transports
const transports = [];

// Console transport (development or when file logs disabled)
if (NODE_ENV === 'development' || DISABLE_FILE_LOGS) {
  transports.push(
    new winston.transports.Console({
      format: consoleFormat
    })
  );
}

// File transports with daily rotation (disabled in light mode)
if (!DISABLE_FILE_LOGS) {
  // Combined log (all levels)
  transports.push(
    new DailyRotateFile({
      filename: path.join(LOG_DIR, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d',
      format: fileFormat,
      level: LOG_LEVEL
    })
  );

  // Error log (errors only)
  transports.push(
    new DailyRotateFile({
      filename: path.join(LOG_DIR, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d',
      format: fileFormat,
      level: 'error'
    })
  );

  // Security log (security events only)
  transports.push(
    new DailyRotateFile({
      filename: path.join(LOG_DIR, 'security-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '90d', // Keep security logs longer
      format: fileFormat,
      level: 'security'
    })
  );
}

// Create logger instance
const logger = winston.createLogger({
  levels: customLevels.levels,
  transports
});

/**
 * Security event logger
 * Logs security-related events with structured data
 */
const logSecurityEvent = (eventType, data = {}) => {
  logger.log('security', `Security Event: ${eventType}`, {
    eventType,
    timestamp: new Date().toISOString(),
    ...data
  });
};

/**
 * Track failed authentication attempts
 */
const logFailedAuth = (type, identifier, ip, reason) => {
  logSecurityEvent('FAILED_AUTH', {
    authType: type, // 'jwt', 'admin', etc.
    identifier, // userId, admin key hash, etc.
    ip,
    reason,
    severity: 'medium'
  });
};

/**
 * Track suspicious activity
 */
const logSuspiciousActivity = (activityType, details) => {
  logSecurityEvent('SUSPICIOUS_ACTIVITY', {
    activityType,
    details,
    severity: 'high'
  });
};

/**
 * Track admin operations
 */
const logAdminOperation = (action, adminKeyHash, ip, details = {}) => {
  logSecurityEvent('ADMIN_OPERATION', {
    action,
    adminKeyHash, // Hashed for privacy
    ip,
    details,
    severity: 'low'
  });
};

/**
 * Track rate limit violations
 */
const logRateLimitExceeded = (identifier, ip, endpoint) => {
  logSecurityEvent('RATE_LIMIT_EXCEEDED', {
    identifier,
    ip,
    endpoint,
    severity: 'medium'
  });
};

/**
 * Track SSRF attempts
 */
const logSSRFAttempt = (url, ip, reason) => {
  logSecurityEvent('SSRF_ATTEMPT', {
    url,
    ip,
    reason,
    severity: 'critical'
  });
};

/**
 * Track token blacklist events
 */
const logTokenBlacklist = (action, userId, tokenId, ip) => {
  logSecurityEvent('TOKEN_BLACKLIST', {
    action, // 'add', 'check'
    userId,
    tokenId,
    ip,
    severity: 'low'
  });
};

module.exports = {
  logger,
  logSecurityEvent,
  logFailedAuth,
  logSuspiciousActivity,
  logAdminOperation,
  logRateLimitExceeded,
  logSSRFAttempt,
  logTokenBlacklist
};
