const { isOperationalError } = require('./errorTypes');
const { createErrorResponse, sendError } = require('./responseFormatter');
const { logger } = require('./securityLogger');

/**
 * Centralized Error Handling
 * Handles errors from proxy requests and general application errors
 */

/**
 * Handle Axios errors from API requests
 */
const handleProxyError = (error, api) => {
  // Axios error with response
  if (error.response) {
    return {
      status: error.response.status,
      error: `${api.toUpperCase()} API Error`,
      message: error.response.data?.error?.message || error.response.data?.message || error.message,
      details: error.response.data,
      api
    };
  }

  // Axios error without response (network error, timeout, etc.)
  if (error.request) {
    return {
      status: 503,
      error: 'Service Unavailable',
      message: `Unable to reach ${api.toUpperCase()} API`,
      details: error.message,
      api
    };
  }

  // Other errors
  return {
    status: 500,
    error: 'Internal Server Error',
    message: error.message || 'An unexpected error occurred',
    api
  };
};

/**
 * Express error handling middleware
 */
const errorMiddleware = (err, req, res, next) => {
  logger.error('Error caught by middleware', { error: err.message, path: req.path });

  // Handle CORS rejections explicitly with 403 JSON
  if (err && err.message === 'Not allowed by CORS') {
    const corsError = {
      code: 'CORS_FORBIDDEN',
      message: 'Origin is not allowed by CORS policy',
      details: { origin: req.headers.origin || null }
    };
    return sendError(res, corsError, 403);
  }

  // Determine if this is an operational error
  const isOperational = isOperationalError(err);

  // Log non-operational errors more severely
  if (!isOperational) {
    logger.error('Non-operational error', {
      error: err.message,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: req.requestId
    });
  }

  // Default error response
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  // Create standardized error object
  const errorObj = {
    code: err.code || 'INTERNAL_ERROR',
    message: process.env.NODE_ENV === 'production' && !isOperational
      ? 'An unexpected error occurred'
      : message
  };

  // Include details for operational errors
  if (isOperational && err.details && Object.keys(err.details).length > 0) {
    errorObj.details = err.details;
  }

  // Include stack trace in development
  if (process.env.NODE_ENV === 'development' && err.stack) {
    errorObj.stack = err.stack;
  }

  sendError(res, errorObj, statusCode);
};

/**
 * Handle 404 Not Found
 */
const notFoundHandler = (req, res) => {
  const notFoundError = {
    code: 'NOT_FOUND',
    message: 'The requested endpoint does not exist',
    details: {
      path: req.originalUrl,
      method: req.method
    }
  };

  sendError(res, notFoundError, 404);
};

/**
 * Async handler wrapper to catch errors in async route handlers
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  handleProxyError,
  errorMiddleware,
  notFoundHandler,
  asyncHandler
};
