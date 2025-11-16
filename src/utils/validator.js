/**
 * Request Validation Utilities
 * Validates incoming requests for proper format and required fields
 */

/**
 * Validate API request structure
 */
const validateProxyRequest = (req, res, next) => {
  const { body, params, method, query } = req;
  const { api } = params;

  // Validate API parameter
  const validApis = ['openai', 'gemini', 'claude', 'groq', 'mistral'];
  if (!validApis.includes(api)) {
    return res.status(400).json({
      error: 'Invalid API',
      message: `API must be one of: ${validApis.join(', ')}`,
      validApis
    });
  }

  // For GET requests, allow empty body but require endpoint in query
  if (method === 'GET') {
    if (!query || !query.endpoint) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'For GET requests, endpoint must be provided in query string as ?endpoint=/path'
      });
    }
    return next();
  }

  // For non-GET, require a body
  if (!body || Object.keys(body).length === 0) {
    return res.status(400).json({
      error: 'Invalid request',
      message: 'Request body is required'
    });
  }

  next();
};

/**
 * Validate endpoint format
 */
const validateEndpoint = (endpoint) => {
  // Endpoint should start with /
  if (!endpoint || !endpoint.startsWith('/')) {
    return {
      valid: false,
      error: 'Endpoint must start with /'
    };
  }

  // Basic sanitization - prevent path traversal
  if (endpoint.includes('..') || endpoint.includes('//')) {
    return {
      valid: false,
      error: 'Invalid endpoint format'
    };
  }

  return { valid: true };
};

/**
 * Validate auth request
 */
const validateAuthRequest = (req, res, next) => {
  const { userId, appId } = req.body;

  if (!userId || !appId) {
    return res.status(400).json({
      error: 'Invalid request',
      message: 'userId and appId are required',
      required: ['userId', 'appId']
    });
  }

  // Validate userId format (basic check)
  if (typeof userId !== 'string' || userId.length < 3) {
    return res.status(400).json({
      error: 'Invalid userId',
      message: 'userId must be a string with at least 3 characters'
    });
  }

  // Validate appId format
  if (typeof appId !== 'string' || appId.length < 3) {
    return res.status(400).json({
      error: 'Invalid appId',
      message: 'appId must be a string with at least 3 characters'
    });
  }

  next();
};

/**
 * Sanitize request body
 * Remove potentially dangerous fields
 */
const sanitizeBody = (body) => {
  const sanitized = { ...body };

  // Remove fields that should not be sent to external APIs
  delete sanitized.apiKey;
  delete sanitized.token;
  delete sanitized.password;

  return sanitized;
};

module.exports = {
  validateProxyRequest,
  validateEndpoint,
  validateAuthRequest,
  sanitizeBody
};
