const morgan = require('morgan');
const config = require('../config/env');

/**
 * Morgan Logger Configuration
 * Logs HTTP requests in development and production
 */

// Custom token to log request body (be careful with sensitive data)
morgan.token('body', (req) => {
  // Don't log sensitive information like passwords
  if (req.body && Object.keys(req.body).length > 0) {
    const sanitized = { ...req.body };
    // Remove sensitive fields if present
    delete sanitized.password;
    delete sanitized.apiKey;
    return JSON.stringify(sanitized);
  }
  return '-';
});

// Custom token for user ID (from JWT)
morgan.token('user', (req) => {
  return req.user ? req.user.id || req.user.userId : 'anonymous';
});

// Development format with colors
const devFormat = morgan(':method :url :status :response-time ms - :res[content-length] - :user');

// Production format with more details
const prodFormat = morgan(
  ':remote-addr - :user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" - :response-time ms'
);

// Optionally disable HTTP request logging for light mode
const disableHttpLogs = process.env.DISABLE_HTTP_LOGS === 'true' || process.env.LIGHT_MODE === 'true';

// Choose format based on environment
const logger = disableHttpLogs
  ? (req, res, next) => next()
  : (config.nodeEnv === 'production' ? prodFormat : devFormat);

module.exports = logger;
