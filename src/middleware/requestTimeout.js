/**
 * Request Timeout Middleware
 * Prevents hanging requests from consuming resources
 * Automatically terminates requests that exceed the timeout
 */

const { logger } = require('../utils/securityLogger');

const REQUEST_TIMEOUT = parseInt(process.env.REQUEST_TIMEOUT_MS) || 30000; // 30 seconds default

const requestTimeout = (req, res, next) => {
  // Set timeout for this request
  req.setTimeout(REQUEST_TIMEOUT, () => {
    logger.warn('Request timeout', {
      ip: req.ip,
      method: req.method,
      path: req.path,
      timeout: REQUEST_TIMEOUT
    });

    // Send timeout response if not already sent
    if (!res.headersSent) {
      res.status(408).json({
        error: 'Request Timeout',
        message: 'Request took too long to process',
        timeout: `${REQUEST_TIMEOUT / 1000}s`
      });
    }
  });

  // Also set response timeout
  res.setTimeout(REQUEST_TIMEOUT, () => {
    if (!res.headersSent) {
      logger.error('Response timeout', {
        ip: req.ip,
        method: req.method,
        path: req.path
      });
    }
  });

  next();
};

module.exports = requestTimeout;
