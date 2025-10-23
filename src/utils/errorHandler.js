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
  console.error('Error:', err);

  // Handle CORS rejections explicitly with 403 JSON
  if (err && err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      error: 'CORS Forbidden',
      message: 'Origin is not allowed by CORS policy',
      origin: req.headers.origin || null
    });
  }

  // Default error response
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    error: err.name || 'Error',
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

/**
 * Handle 404 Not Found
 */
const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested endpoint does not exist',
    path: req.originalUrl,
    method: req.method
  });
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
