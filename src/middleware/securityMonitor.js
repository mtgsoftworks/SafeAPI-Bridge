const { logger, logSuspiciousActivity } = require('../utils/securityLogger');
const { SECURITY } = require('../config/constants');
const LRUCache = require('../utils/lruCache');
const { classifyRequestPath } = require('../services/abuseGuard');

/**
 * Security Monitoring Middleware
 * Detects and logs suspicious activity patterns
 */

// Track failed authentication attempts by IP using LRU cache
const failedAuthAttempts = new LRUCache(SECURITY.LRU_CACHE_MAX_ENTRIES, SECURITY.FAILED_AUTH_WINDOW_MS);

// Track suspicious activity patterns with automatic cleanup
const suspiciousActivityTracker = new LRUCache(SECURITY.SUSPICIOUS_CACHE_MAX_ENTRIES, SECURITY.SUSPICIOUS_ACTIVITY_WINDOW_MS);

/**
 * Track failed auth attempt
 */
const trackFailedAuth = (ip) => {
  const now = Date.now();
  const existing = failedAuthAttempts.get(ip);

  if (!existing) {
    const newData = {
      count: 1,
      firstAttempt: now,
      lastAttempt: now
    };
    failedAuthAttempts.set(ip, newData);
    return 1;
  }

  // Reset if outside window
  if (now - existing.firstAttempt > SECURITY.FAILED_AUTH_WINDOW) {
    const newData = {
      count: 1,
      firstAttempt: now,
      lastAttempt: now
    };
    failedAuthAttempts.set(ip, newData);
    return 1;
  }

  // Increment count
  existing.count++;
  existing.lastAttempt = now;
  failedAuthAttempts.set(ip, existing);

  // Alert if threshold exceeded
  if (existing.count === SECURITY.FAILED_AUTH_THRESHOLD) {
    logSuspiciousActivity('BRUTE_FORCE_ATTEMPT', {
      ip,
      attempts: existing.count,
      timeWindow: `${SECURITY.FAILED_AUTH_WINDOW / 1000 / 60} minutes`,
      action: 'Multiple failed authentication attempts detected'
    });
  }

  return existing.count;
};

/**
 * Check if IP is currently locked out
 */
const isLockedOut = (ip) => {
  const data = failedAuthAttempts.get(ip);
  if (!data) return false;

  const now = Date.now();
  return data.count >= SECURITY.FAILED_AUTH_THRESHOLD &&
         (now - data.firstAttempt) <= SECURITY.FAILED_AUTH_WINDOW;
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

const { containsMaliciousPattern, checkPatternType } = require('../config/securityPatterns');

/**
 * Detect suspicious activity patterns
 */
const detectSuspiciousPatterns = (req, res, ip) => {
  const userAgent = req.headers['user-agent'] || '';
  const pathSignals = classifyRequestPath(req.path, userAgent);

  // Missing UA alone is too noisy; treat it as high severity only with scanner paths.
  if (!userAgent && req.path !== '/health' && req.path !== '/' && pathSignals.isProbe) {
    logSuspiciousActivity('MISSING_USER_AGENT', {
      ip,
      path: req.path,
      method: req.method,
      reasons: pathSignals.reasons
    });
  }

  // Detect various injection attempts in query parameters
  const queryString = JSON.stringify(req.query);
  if (containsMaliciousPattern(queryString)) {
    const detectedTypes = [];
    if (checkPatternType(queryString, 'SQL_INJECTION')) detectedTypes.push('SQL_INJECTION');
    if (checkPatternType(queryString, 'XSS')) detectedTypes.push('XSS');
    if (checkPatternType(queryString, 'COMMAND_INJECTION')) detectedTypes.push('COMMAND_INJECTION');
    if (checkPatternType(queryString, 'LDAP_INJECTION')) detectedTypes.push('LDAP_INJECTION');
    if (checkPatternType(queryString, 'NOSQL_INJECTION')) detectedTypes.push('NOSQL_INJECTION');

    logSuspiciousActivity('INJECTION_ATTEMPT', {
      ip,
      path: req.path,
      query: req.query,
      detectedTypes,
      severity: detectedTypes.length > 2 ? 'HIGH' : 'MEDIUM'
    });
  }

  // Detect path traversal attempts
  if (checkPatternType(req.path, 'PATH_TRAVERSAL')) {
    logSuspiciousActivity('PATH_TRAVERSAL_ATTEMPT', {
      ip,
      path: req.path,
      severity: 'HIGH'
    });
  }

  // Detect unusual request sizes
  const contentLength = parseInt(req.headers['content-length'] || '0');
  if (contentLength > SECURITY.MAX_CONTENT_LENGTH_BYTES) {
    logSuspiciousActivity('LARGE_PAYLOAD', {
      ip,
      path: req.path,
      contentLength,
      warning: 'Potential DoS attempt',
      severity: contentLength > SECURITY.MAX_CONTENT_LENGTH_BYTES * 2 ? 'HIGH' : 'MEDIUM'
    });
  }

  // Detect suspicious user agents
  const suspiciousUA = /bot|crawler|spider|scraper|curl|wget|python|java|go-http/i;
  if (userAgent && suspiciousUA.test(userAgent) && !req.path.includes('/health')) {
    // Track suspicious activity pattern
    const key = `${ip}:${userAgent}`;
    const existing = suspiciousActivityTracker.get(key);

    if (!existing) {
      suspiciousActivityTracker.set(key, { count: 1, firstSeen: Date.now() });
    } else {
      existing.count++;
      suspiciousActivityTracker.set(key, existing);

      // Alert if threshold exceeded
      if (existing.count >= SECURITY.SUSPICIOUS_ACTIVITY_THRESHOLD) {
        logSuspiciousActivity('SUSPICIOUS_AUTOMATED_ACTIVITY', {
          ip,
          userAgent,
          requestCount: existing.count,
          timeWindow: `${SECURITY.SUSPICIOUS_ACTIVITY_WINDOW_MS / 1000 / 60} minutes`,
          severity: 'MEDIUM'
        });
      }
    }
  }
};

module.exports = {
  securityMonitor,
  trackFailedAuth,
  isLockedOut
};
