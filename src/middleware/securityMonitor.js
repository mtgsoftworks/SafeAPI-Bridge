const { logger, logSuspiciousActivity } = require('../utils/securityLogger');

/**
 * Security Monitoring Middleware
 * Detects and logs suspicious activity patterns
 */

// Track failed authentication attempts by IP
const failedAuthAttempts = new Map();
const FAILED_AUTH_THRESHOLD = 5;
const FAILED_AUTH_WINDOW = 15 * 60 * 1000; // 15 minutes

/**
 * Clean up old failed auth attempts
 */
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of failedAuthAttempts.entries()) {
    if (now - data.firstAttempt > FAILED_AUTH_WINDOW) {
      failedAuthAttempts.delete(ip);
    }
  }
}, 5 * 60 * 1000); // Clean every 5 minutes

/**
 * Track failed auth attempt
 */
const trackFailedAuth = (ip) => {
  const now = Date.now();

  if (!failedAuthAttempts.has(ip)) {
    failedAuthAttempts.set(ip, {
      count: 1,
      firstAttempt: now,
      lastAttempt: now
    });
  } else {
    const data = failedAuthAttempts.get(ip);

    // Reset if outside window
    if (now - data.firstAttempt > FAILED_AUTH_WINDOW) {
      failedAuthAttempts.set(ip, {
        count: 1,
        firstAttempt: now,
        lastAttempt: now
      });
    } else {
      data.count++;
      data.lastAttempt = now;

      // Alert if threshold exceeded
      if (data.count === FAILED_AUTH_THRESHOLD) {
        logSuspiciousActivity('BRUTE_FORCE_ATTEMPT', {
          ip,
          attempts: data.count,
          timeWindow: `${FAILED_AUTH_WINDOW / 1000 / 60} minutes`,
          action: 'Multiple failed authentication attempts detected'
        });
      }
    }
  }

  return failedAuthAttempts.get(ip).count;
};

/**
 * Check if IP is currently locked out
 */
const isLockedOut = (ip) => {
  const data = failedAuthAttempts.get(ip);
  if (!data) return false;

  const now = Date.now();
  return data.count >= FAILED_AUTH_THRESHOLD &&
         (now - data.firstAttempt) <= FAILED_AUTH_WINDOW;
};

/**
 * Security monitoring middleware
 * Logs security-relevant request information
 */
const securityMonitor = (req, res, next) => {
  const startTime = Date.now();

  // Log request for security audit
  const logRequest = () => {
    const duration = Date.now() - startTime;
    const ip = req.clientIp || req.ip || req.headers['x-forwarded-for'] || 'unknown';

    // Log security-sensitive routes
    const securityRoutes = ['/auth', '/admin', '/analytics'];
    const isSecurityRoute = securityRoutes.some(route => req.path.startsWith(route));

    if (isSecurityRoute) {
      logger.info('Security Route Access', {
        method: req.method,
        path: req.path,
        ip,
        userAgent: req.headers['user-agent'],
        statusCode: res.statusCode,
        duration,
        userId: req.user?.userId
      });
    }

    // Detect suspicious patterns
    detectSuspiciousPatterns(req, res, ip);
  };

  // Capture response finish event
  res.on('finish', logRequest);

  next();
};

/**
 * Detect suspicious activity patterns
 */
const detectSuspiciousPatterns = (req, res, ip) => {
  const userAgent = req.headers['user-agent'] || '';
  const statusCode = res.statusCode;

  // Detect missing user agent (bot indicator)
  if (!userAgent && req.path !== '/health' && req.path !== '/') {
    logSuspiciousActivity('MISSING_USER_AGENT', {
      ip,
      path: req.path,
      method: req.method
    });
  }

  // Detect SQL injection attempts in query parameters
  const queryString = JSON.stringify(req.query);
  const sqlKeywords = ['union', 'select', 'drop', 'insert', 'delete', '--', ';--'];
  if (sqlKeywords.some(keyword => queryString.toLowerCase().includes(keyword))) {
    logSuspiciousActivity('SQL_INJECTION_ATTEMPT', {
      ip,
      path: req.path,
      query: req.query
    });
  }

  // Detect path traversal attempts
  if (req.path.includes('..') || req.path.includes('%2e%2e')) {
    logSuspiciousActivity('PATH_TRAVERSAL_ATTEMPT', {
      ip,
      path: req.path
    });
  }

  // Detect unusual request sizes
  const contentLength = parseInt(req.headers['content-length'] || '0');
  if (contentLength > 5 * 1024 * 1024) { // 5MB
    logSuspiciousActivity('LARGE_PAYLOAD', {
      ip,
      path: req.path,
      contentLength,
      warning: 'Potential DoS attempt'
    });
  }
};

module.exports = {
  securityMonitor,
  trackFailedAuth,
  isLockedOut
};
