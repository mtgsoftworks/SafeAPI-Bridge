const splitKeyService = require('../services/splitKey');
const { logFailedAuth } = require('../utils/securityLogger');

/**
 * Split Key Middleware
 * Validates and processes Split Key (BYOK) requests
 * This middleware handles the second layer of security for BYOK functionality
 */

/**
 * Middleware to validate Split Key headers and reconstruct the API key
 */
const validateSplitKey = async (req, res, next) => {
  // Skip this middleware if not using Split Key method
  if (req.authMethod !== 'BYOK_SPLIT_KEY') {
    return next();
  }

  const ip = req.clientIp || req.ip || req.headers['x-forwarded-for'] || 'unknown';

  try {
    // Validate split key headers
    const validation = splitKeyService.validateSplitKeyHeaders(req.headers);

    if (!validation.valid) {
      logFailedAuth('split_key', 'invalid_headers', ip, validation.error);
      return res.status(400).json({
        error: 'Invalid Split Key headers',
        message: validation.error,
        required: {
          'X-Partial-Key-Id': 'The key identifier from database',
          'X-Partial-Key': 'The client part of the split key'
        }
      });
    }

    // Attach validated split key info to request
    req.splitKey = {
      keyId: validation.keyId,
      clientPart: validation.clientPart
    };

    next();

  } catch (error) {
    logFailedAuth('split_key', 'validation_error', ip, error.message);
    return res.status(500).json({
      error: 'Split Key validation failed',
      message: 'Unable to validate Split Key headers'
    });
  }
};

/**
 * Middleware to reconstruct the original API key from split parts
 * This should be called after validateSplitKey and before the proxy request
 */
const reconstructApiKey = async (req, res, next) => {
  // Skip this middleware if not using Split Key method
  if (req.authMethod !== 'BYOK_SPLIT_KEY' || !req.splitKey) {
    return next();
  }

  const ip = req.clientIp || req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const userId = req.user?.userId || 'unknown';

  try {
    // Reconstruct the original API key
    const originalApiKey = await splitKeyService.reconstructApiKey(
      req.splitKey.keyId,
      req.splitKey.clientPart
    );

    // Attach the reconstructed key to the request
    // This will be used by the proxy controller
    req.reconstructedApiKey = originalApiKey;

    // Log successful reconstruction (security monitoring)
    logFailedAuth('split_key', 'reconstruction_success', ip,
      `Key ${req.splitKey.keyId} reconstructed for user ${userId}`);

    next();

  } catch (error) {
    logFailedAuth('split_key', 'reconstruction_failed', ip,
      `Key reconstruction failed for ${req.splitKey?.keyId}: ${error.message}`);

    return res.status(401).json({
      error: 'Split Key authentication failed',
      message: 'Unable to reconstruct API key from split parts',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Middleware to enforce Split Key usage for specific APIs
 * This can be used to require BYOK for certain high-security endpoints
 */
const requireSplitKey = (req, res, next) => {
  if (req.authMethod !== 'BYOK_SPLIT_KEY') {
    return res.status(403).json({
      error: 'Split Key required',
      message: 'This endpoint requires BYOK (Bring Your Own Key) authentication',
      requiredHeaders: {
        'Authorization': 'Bearer <JWT_TOKEN>',
        'X-Partial-Key-Id': '<KEY_ID>',
        'X-Partial-Key': '<CLIENT_PART>'
      }
    });
  }

  next();
};

/**
 * Middleware to prevent Split Key usage for certain APIs
 * This can be used to enforce Server Key method for specific endpoints
 */
const forbidSplitKey = (req, res, next) => {
  if (req.authMethod === 'BYOK_SPLIT_KEY') {
    return res.status(403).json({
      error: 'Split Key not allowed',
      message: 'This endpoint requires Server Key authentication',
      instruction: 'Remove X-Partial-Key headers to use Server Key method'
    });
  }

  next();
};

/**
 * Middleware to add security headers for Split Key responses
 */
const addSplitKeySecurityHeaders = (req, res, next) => {
  if (req.authMethod === 'BYOK_SPLIT_KEY') {
    // Add security headers to prevent caching of sensitive data
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');

    // Add content security policy
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'");
  }

  next();
};

module.exports = {
  validateSplitKey,
  reconstructApiKey,
  requireSplitKey,
  forbidSplitKey,
  addSplitKeySecurityHeaders
};