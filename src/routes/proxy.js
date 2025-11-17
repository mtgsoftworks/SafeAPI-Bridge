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
 *   api: openai | gemini | claude | groq | mistral | zai | deepseek | perplexity | together | openrouter | fireworks | replicate | stability | fal | elevenlabs | brave | deepl | openmeteo
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

// Z.ai (GLM-4.6 and similar models)
router.post('/zai', ipCheck, authenticateToken, quotaCheck, validateSplitKey, reconstructApiKey, (req, res, next) => {
  req.params.api = 'zai';
  next();
}, validateProxyRequest, addSplitKeySecurityHeaders, asyncHandler(proxyRequest));

// DeepSeek
router.post('/deepseek', ipCheck, authenticateToken, quotaCheck, validateSplitKey, reconstructApiKey, (req, res, next) => {
  req.params.api = 'deepseek';
  next();
}, validateProxyRequest, addSplitKeySecurityHeaders, asyncHandler(proxyRequest));

// Perplexity
router.post('/perplexity', ipCheck, authenticateToken, quotaCheck, validateSplitKey, reconstructApiKey, (req, res, next) => {
  req.params.api = 'perplexity';
  next();
}, validateProxyRequest, addSplitKeySecurityHeaders, asyncHandler(proxyRequest));

// Together AI
router.post('/together', ipCheck, authenticateToken, quotaCheck, validateSplitKey, reconstructApiKey, (req, res, next) => {
  req.params.api = 'together';
  next();
}, validateProxyRequest, addSplitKeySecurityHeaders, asyncHandler(proxyRequest));

// OpenRouter
router.post('/openrouter', ipCheck, authenticateToken, quotaCheck, validateSplitKey, reconstructApiKey, (req, res, next) => {
  req.params.api = 'openrouter';
  next();
}, validateProxyRequest, addSplitKeySecurityHeaders, asyncHandler(proxyRequest));

// Fireworks AI
router.post('/fireworks', ipCheck, authenticateToken, quotaCheck, validateSplitKey, reconstructApiKey, (req, res, next) => {
  req.params.api = 'fireworks';
  next();
}, validateProxyRequest, addSplitKeySecurityHeaders, asyncHandler(proxyRequest));

// Replicate
router.post('/replicate', ipCheck, authenticateToken, quotaCheck, validateSplitKey, reconstructApiKey, (req, res, next) => {
  req.params.api = 'replicate';
  next();
}, validateProxyRequest, addSplitKeySecurityHeaders, asyncHandler(proxyRequest));

// Stability AI
router.post('/stability', ipCheck, authenticateToken, quotaCheck, validateSplitKey, reconstructApiKey, (req, res, next) => {
  req.params.api = 'stability';
  next();
}, validateProxyRequest, addSplitKeySecurityHeaders, asyncHandler(proxyRequest));

// Fal AI
router.post('/fal', ipCheck, authenticateToken, quotaCheck, validateSplitKey, reconstructApiKey, (req, res, next) => {
  req.params.api = 'fal';
  next();
}, validateProxyRequest, addSplitKeySecurityHeaders, asyncHandler(proxyRequest));

// ElevenLabs
router.post('/elevenlabs', ipCheck, authenticateToken, quotaCheck, validateSplitKey, reconstructApiKey, (req, res, next) => {
  req.params.api = 'elevenlabs';
  next();
}, validateProxyRequest, addSplitKeySecurityHeaders, asyncHandler(proxyRequest));

// Brave Search
router.post('/brave', ipCheck, authenticateToken, quotaCheck, validateSplitKey, reconstructApiKey, (req, res, next) => {
  req.params.api = 'brave';
  next();
}, validateProxyRequest, addSplitKeySecurityHeaders, asyncHandler(proxyRequest));

// DeepL
router.post('/deepl', ipCheck, authenticateToken, quotaCheck, validateSplitKey, reconstructApiKey, (req, res, next) => {
  req.params.api = 'deepl';
  next();
}, validateProxyRequest, addSplitKeySecurityHeaders, asyncHandler(proxyRequest));

// Open-Meteo
router.post('/openmeteo', ipCheck, authenticateToken, quotaCheck, validateSplitKey, reconstructApiKey, (req, res, next) => {
  req.params.api = 'openmeteo';
  next();
}, validateProxyRequest, addSplitKeySecurityHeaders, asyncHandler(proxyRequest));

module.exports = router;
