const { VALIDATION } = require('../config/constants');
const { ValidationError, InvalidApiError, InvalidEndpointError } = require('./errorTypes');
const { containsMaliciousPattern } = require('../config/securityPatterns');
const { SUPPORTED_APIS } = require('../config/apis');

/**
 * Request Validation Utilities
 * Validates incoming requests for proper format and required fields
 */

/**
 * Validate API provider name
 */
const validateApiProvider = (api) => {
  if (!api || typeof api !== 'string') {
    throw new ValidationError('API provider is required and must be a string', 'api');
  }

  if (!SUPPORTED_APIS.includes(api.toLowerCase())) {
    throw new InvalidApiError(api.toLowerCase(), SUPPORTED_APIS);
  }

  return api.toLowerCase();
};

/**
 * Validate endpoint format and security
 */
const validateEndpointSecurity = (endpoint) => {
  if (!endpoint || typeof endpoint !== 'string') {
    throw new ValidationError('Endpoint is required and must be a string', 'endpoint');
  }

  // Check for malicious patterns
  if (containsMaliciousPattern(endpoint)) {
    throw new ValidationError('Invalid endpoint format detected', 'endpoint', { endpoint });
  }

  // Endpoint should start with /
  if (!endpoint.startsWith('/')) {
    throw new ValidationError('Endpoint must start with /', 'endpoint', { endpoint });
  }

  // Additional security checks
  if (endpoint.includes('..') || endpoint.includes('//')) {
    throw new ValidationError('Invalid endpoint format', 'endpoint', { endpoint });
  }

  // Length check
  if (endpoint.length > VALIDATION.MAX_ENDPOINT_LENGTH) {
    throw new ValidationError('Endpoint too long', 'endpoint', { length: endpoint.length });
  }

  return endpoint;
};

/**
 * Validate request body size and content
 */
const validateRequestBody = (body, contentType) => {
  if (!body) {
    throw new ValidationError('Request body is required', 'body');
  }

  // Check body size (rough estimate)
  const bodySize = JSON.stringify(body).length;
  const maxSize = VALIDATION.MAX_REQUEST_BODY_BYTES;

  if (bodySize > maxSize) {
    throw new ValidationError('Request body too large', 'body', {
      size: bodySize,
      maxSize: maxSize
    });
  }

  // Check for deeply nested objects
  const maxDepth = VALIDATION.MAX_OBJECT_DEPTH;
  const checkDepth = (obj, depth = 0) => {
    if (depth > maxDepth) {
      throw new ValidationError('Request body too deeply nested', 'body', { depth });
    }

    if (typeof obj === 'object' && obj !== null) {
      for (const value of Object.values(obj)) {
        checkDepth(value, depth + 1);
      }
    }
  };

  checkDepth(body);

  return body;
};

/**
 * Validate API request structure
 */
const validateProxyRequest = (req, res, next) => {
  try {
    const { body, params, method, query } = req;
    const { api } = params;

    // Validate API provider
    validateApiProvider(api);

    // For GET requests, require endpoint in query
    if (method === 'GET') {
      if (!query?.endpoint) {
        throw new ValidationError(
          'For GET requests, endpoint must be provided in query string as ?endpoint=/path',
          'endpoint'
        );
      }
      validateEndpointSecurity(query.endpoint);
      return next();
    }

    // For non-GET requests, validate body
    validateRequestBody(body, req.headers['content-type']);

    next();
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          timestamp: new Date().toISOString(),
          requestId: req.requestId
        }
      });
    }
    next(error);
  }
};

/**
 * Validate auth request with enhanced security
 */
const validateAuthRequest = (req, res, next) => {
  try {
    const { userId, appId } = req.body;

    if (!userId || !appId) {
      throw new ValidationError('userId and appId are required', null, {
        required: ['userId', 'appId']
      });
    }

    // Validate userId format and security
    if (typeof userId !== 'string') {
      throw new ValidationError('userId must be a string', 'userId');
    }

    if (userId.length < VALIDATION.MIN_USER_ID_LENGTH) {
      throw new ValidationError(
        `userId must be at least ${VALIDATION.MIN_USER_ID_LENGTH} characters`,
        'userId',
        { length: userId.length }
      );
    }

    if (userId.length > VALIDATION.MAX_USER_ID_LENGTH) {
      throw new ValidationError('userId too long', 'userId', { length: userId.length });
    }

    // Check for malicious patterns in userId
    if (containsMaliciousPattern(userId)) {
      throw new ValidationError('Invalid userId format detected', 'userId', { userId });
    }

    // Validate appId format and security
    if (typeof appId !== 'string') {
      throw new ValidationError('appId must be a string', 'appId');
    }

    if (appId.length < VALIDATION.MIN_APP_ID_LENGTH) {
      throw new ValidationError(
        `appId must be at least ${VALIDATION.MIN_APP_ID_LENGTH} characters`,
        'appId',
        { length: appId.length }
      );
    }

    if (appId.length > VALIDATION.MAX_APP_ID_LENGTH) {
      throw new ValidationError('appId too long', 'appId', { length: appId.length });
    }

    // Check for malicious patterns in appId
    if (containsMaliciousPattern(appId)) {
      throw new ValidationError('Invalid appId format detected', 'appId', { appId });
    }

    // Validate additional fields if present
    if (req.body.metadata) {
      if (typeof req.body.metadata !== 'object' || Array.isArray(req.body.metadata)) {
        throw new ValidationError('metadata must be an object', 'metadata');
      }

      const metadataSize = JSON.stringify(req.body.metadata).length;
      if (metadataSize > VALIDATION.MAX_METADATA_SIZE) {
        throw new ValidationError('metadata too large', 'metadata', {
          size: metadataSize,
          maxSize: VALIDATION.MAX_METADATA_SIZE
        });
      }
    }

    next();
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          timestamp: new Date().toISOString(),
          requestId: req.requestId
        }
      });
    }
    next(error);
  }
};

/**
 * Sanitize request body with enhanced security
 */
const sanitizeBody = (body) => {
  if (!body || typeof body !== 'object') {
    return body;
  }

  const sanitized = { ...body };

  // Remove dangerous fields that should not be sent to external APIs
  const dangerousFields = [
    'apiKey', 'token', 'password', 'secret', 'key',
    'authorization', 'credential', 'auth', 'private'
  ];

  dangerousFields.forEach(field => {
    delete sanitized[field];
    delete sanitized[field.toLowerCase()];
    delete sanitized[field.toUpperCase()];
  });

  // Recursively sanitize nested objects
  const sanitizeRecursive = (obj) => {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(sanitizeRecursive);
    }

    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();

      // Skip dangerous keys
      if (dangerousFields.some(field => lowerKey.includes(field.toLowerCase()))) {
        continue;
      }

      result[key] = sanitizeRecursive(value);
    }

    return result;
  };

  return sanitizeRecursive(sanitized);
};

/**
 * Legacy endpoint validation for backward compatibility
 */
const validateEndpoint = (endpoint) => {
  try {
    validateEndpointSecurity(endpoint);
    return { valid: true };
  } catch (error) {
    return { valid: false, error: error.message };
  }
};

module.exports = {
  validateProxyRequest,
  validateEndpoint,
  validateAuthRequest,
  sanitizeBody
};
