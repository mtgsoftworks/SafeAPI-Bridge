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
 *   api: openai | gemini | claude | groq | mistral
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
 * These make it easier to use without specifying the API in the path
 */

// OpenAI
router.post('/openai', ipCheck, authenticateToken, quotaCheck, validateSplitKey, reconstructApiKey, (req, res, next) => {
  req.params.api = 'openai';
  next();
}, validateProxyRequest, addSplitKeySecurityHeaders, asyncHandler(proxyRequest));

// Gemini
router.post('/gemini', ipCheck, authenticateToken, quotaCheck, validateSplitKey, reconstructApiKey, (req, res, next) => {
  req.params.api = 'gemini';
  next();
}, validateProxyRequest, addSplitKeySecurityHeaders, asyncHandler(proxyRequest));

// Claude
router.post('/claude', ipCheck, authenticateToken, quotaCheck, validateSplitKey, reconstructApiKey, (req, res, next) => {
  req.params.api = 'claude';
  next();
}, validateProxyRequest, addSplitKeySecurityHeaders, asyncHandler(proxyRequest));

// Groq
router.post('/groq', ipCheck, authenticateToken, quotaCheck, validateSplitKey, reconstructApiKey, (req, res, next) => {
  req.params.api = 'groq';
  next();
}, validateProxyRequest, addSplitKeySecurityHeaders, asyncHandler(proxyRequest));

// Mistral
router.post('/mistral', ipCheck, authenticateToken, quotaCheck, validateSplitKey, reconstructApiKey, (req, res, next) => {
  req.params.api = 'mistral';
  next();
}, validateProxyRequest, addSplitKeySecurityHeaders, asyncHandler(proxyRequest));

module.exports = router;
