/**
 * Response Formatting Utilities
 * Standardizes API response format for consistency
 */

/**
 * Create standardized success response
 */
const createSuccessResponse = (data, requestId = null, meta = {}) => {
  return {
    success: true,
    data,
    requestId,
    timestamp: new Date().toISOString(),
    ...meta
  };
};

/**
 * Create standardized error response
 */
const createErrorResponse = (error, requestId = null) => {
  const response = {
    success: false,
    error: {
      code: error.code || 'INTERNAL_ERROR',
      message: error.message || 'An unexpected error occurred'
    },
    requestId,
    timestamp: new Date().toISOString()
  };

  // Include details for operational errors
  if (error.details && Object.keys(error.details).length > 0) {
    response.error.details = error.details;
  }

  // Include stack trace in development
  if (process.env.NODE_ENV === 'development' && error.stack) {
    response.error.stack = error.stack;
  }

  return response;
};

/**
 * Express response helper for success responses
 */
const sendSuccess = (res, data, statusCode = 200, meta = {}) => {
  return res.status(statusCode).json(
    createSuccessResponse(data, res.req?.requestId, meta)
  );
};

/**
 * Express response helper for error responses
 */
const sendError = (res, error, statusCode = 500) => {
  return res.status(statusCode).json(
    createErrorResponse(error, res.req?.requestId)
  );
};

module.exports = {
  createSuccessResponse,
  createErrorResponse,
  sendSuccess,
  sendError
};