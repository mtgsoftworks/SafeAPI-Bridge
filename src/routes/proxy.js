const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { validateProxyRequest } = require('../utils/validator');
const { proxyRequest, getAvailableEndpoints } = require('../controllers/proxy');
const { asyncHandler } = require('../utils/errorHandler');
const quotaCheck = require('../middleware/quotaCheck');
const ipCheck = require('../middleware/ipCheck');

/**
 * Proxy Routes
 * Handles requests to external AI APIs
 * Now with IP check, quota check, and caching
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
 * 2. authenticateToken - Verify JWT
 * 3. quotaCheck - Check user quota
 * 4. validateProxyRequest - Validate request
 * 5. proxyRequest - Forward to API
 *
 * Params:
 *   api: openai | gemini | claude | groq | mistral
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
  validateProxyRequest,
  asyncHandler(proxyRequest)
);

router.get(
  '/:api/proxy',
  ipCheck,
  authenticateToken,
  quotaCheck,
  validateProxyRequest,
  asyncHandler(proxyRequest)
);

/**
 * Convenience routes for specific APIs
 * These make it easier to use without specifying the API in the path
 */

// OpenAI
router.post('/openai', ipCheck, authenticateToken, quotaCheck, (req, res, next) => {
  req.params.api = 'openai';
  next();
}, validateProxyRequest, asyncHandler(proxyRequest));

// Gemini
router.post('/gemini', ipCheck, authenticateToken, quotaCheck, (req, res, next) => {
  req.params.api = 'gemini';
  next();
}, validateProxyRequest, asyncHandler(proxyRequest));

// Claude
router.post('/claude', ipCheck, authenticateToken, quotaCheck, (req, res, next) => {
  req.params.api = 'claude';
  next();
}, validateProxyRequest, asyncHandler(proxyRequest));

// Groq
router.post('/groq', ipCheck, authenticateToken, quotaCheck, (req, res, next) => {
  req.params.api = 'groq';
  next();
}, validateProxyRequest, asyncHandler(proxyRequest));

// Mistral
router.post('/mistral', ipCheck, authenticateToken, quotaCheck, (req, res, next) => {
  req.params.api = 'mistral';
  next();
}, validateProxyRequest, asyncHandler(proxyRequest));

module.exports = router;
