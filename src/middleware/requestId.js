const { v4: uuidv4 } = require('uuid');

/**
 * Request ID Middleware
 * Adds unique request ID for tracing and correlation
 */
const requestIdMiddleware = (req, res, next) => {
  // Use existing request ID from header or generate new one
  req.requestId = req.headers['x-request-id'] || uuidv4();

  // Set response header for client-side correlation
  res.setHeader('X-Request-ID', req.requestId);

  next();
};

module.exports = requestIdMiddleware;