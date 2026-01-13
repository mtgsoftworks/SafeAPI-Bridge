const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { validateProxyRequest } = require('../utils/validator');
const { proxyRequest, getAvailableEndpoints } = require('../controllers/proxy');
const { asyncHandler } = require('../utils/errorHandler');
const quotaCheck = require('../middleware/quotaCheck');
const ipCheck = require('../middleware/ipCheck');
const { validateSplitKey, reconstructApiKey, addSplitKeySecurityHeaders } = require('../middleware/splitKey');

/**
 * Proxy Routes
 * Handles requests to external AI APIs
 * Supports both Server Key and BYOK Split Key methods
 * Now with IP check, quota check, and enhanced security
 */

/**
 * GET /api/:api/endpoints
 * Get list of allowed endpoints for a specific API
 * Example: GET /api/openai/endpoints
 */
router.get('/:api/endpoints', authenticateToken, getAvailableEndpoints);

/**
 * POST /api/:api/proxy
 * Main proxy endpoint - forwards requests to external APIs
 *
 * Middleware chain:
 * 1. ipCheck - Verify IP is allowed
 * 2. authenticateToken - Verify JWT (determines auth method)
 * 3. quotaCheck - Check user quota
 * 4. validateSplitKey - Validate Split Key headers (if using BYOK)
 * 5. reconstructApiKey - Reconstruct API key from split parts (if using BYOK)
 * 6. validateProxyRequest - Validate request
 * 7. addSplitKeySecurityHeaders - Add security headers for BYOK responses
 * 8. proxyRequest - Forward to API
 *
 * Params:
 *   api: openai | gemini | claude | groq | mistral | zai | deepseek | perplexity | together | openrouter | fireworks | github | replicate | stability | fal | elevenlabs | brave | deepl | openmeteo
 *
 * Headers (for BYOK Split Key method):
 *   Authorization: Bearer <JWT_TOKEN>
 *   X-Partial-Key-Id: <KEY_ID>
 *   X-Partial-Key: <CLIENT_PART_HASH>
 *
 * Headers (for Server Key method):
 *   Authorization: Bearer <JWT_TOKEN>
 *
 * Body:
 * {
 *   "endpoint": "/chat/completions",
 *   "model": "gpt-3.5-turbo",
 *   "messages": [...],
 *   ... other API-specific parameters
 * }
 */
// Support both GET and POST for proxy
router.post(
  '/:api/proxy',
  ipCheck,
  authenticateToken,
  quotaCheck,
  validateSplitKey,
  reconstructApiKey,
  validateProxyRequest,
  addSplitKeySecurityHeaders,
  asyncHandler(proxyRequest)
);

router.get(
  '/:api/proxy',
  ipCheck,
  authenticateToken,
  quotaCheck,
  validateSplitKey,
  reconstructApiKey,
  validateProxyRequest,
  addSplitKeySecurityHeaders,
  asyncHandler(proxyRequest)
);

/**
 * Convenience routes for specific APIs
 * Dynamically generated to eliminate code duplication
 */

// List of supported APIs for convenience routes
const supportedApis = [
  'openai', 'gemini', 'claude', 'groq', 'mistral', 'zai', 'deepseek',
  'perplexity', 'together', 'openrouter', 'fireworks', 'github', 'replicate',
  'stability', 'fal', 'elevenlabs', 'brave', 'deepl', 'openmeteo'
];

// Middleware factory for API convenience routes
const createApiRoute = (apiName) => {
  return [
    ipCheck,
    authenticateToken,
    quotaCheck,
    validateSplitKey,
    reconstructApiKey,
    (req, res, next) => {
      req.params.api = apiName;
      next();
    },
    validateProxyRequest,
    addSplitKeySecurityHeaders,
    asyncHandler(proxyRequest)
  ];
};

// Generate convenience routes dynamically
supportedApis.forEach(api => {
  router.post(`/${api}`, createApiRoute(api));
});

module.exports = router;
