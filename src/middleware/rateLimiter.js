const rateLimit = require('express-rate-limit');
const config = require('../config/env');
const { RATE_LIMITING } = require('../config/constants');

/**
 * Rate Limiter Configuration
 * Limits the number of requests per IP address
 */
const limiter = rateLimit({
  windowMs: config.rateLimiting.windowMs,
  max: config.rateLimiting.maxRequests,
  message: {
    error: 'Too many requests',
    message: `You have exceeded the ${config.rateLimiting.maxRequests} requests in ${config.rateLimiting.windowMs / 1000 / 60} minutes limit!`,
    retryAfter: 'Please try again later'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // Never rate-limit liveness endpoints
  skip: (req) => req.path === '/health' || req.path === '/',
  // Skip successful requests - only count failed ones (optional)
  // skip: (req, res) => res.statusCode < 400,
});

/**
 * Strict Rate Limiter for auth endpoints
 * More restrictive to prevent brute force attacks
 */
const authLimiter = rateLimit({
  windowMs: RATE_LIMITING.AUTH_WINDOW_MS,
  max: RATE_LIMITING.AUTH_MAX_REQUESTS,
  message: {
    error: 'Too many authentication attempts',
    message: 'Too many attempts from this IP, please try again later',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Provider-specific Rate Limiter Factory
 * Creates a distinct limiter for each provider route
 */
const createProviderRateLimiter = (api) => {
  const settings = config.providerRatelimits[api] || config.providerRatelimits.default;

  return rateLimit({
    windowMs: settings.windowMs,
    max: settings.max,
    keyGenerator: (req) => {
      // Limit by IP for now (could be by User/App ID later)
      return `${api}:${req.ip}`;
    },
    message: {
      error: 'Provider Rate Limit Exceeded',
      message: `Too many requests for ${api} API. Limit is ${settings.max} per minute.`,
      retryAfter: 'Please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === '/health',
  });
};

// Cache limiters to avoid recreation
const providerLimiters = {};
const getProviderLimiter = (req, res, next) => {
  const api = req.params.api;
  if (!api) return next();

  if (!providerLimiters[api]) {
    providerLimiters[api] = createProviderRateLimiter(api);
  }

  return providerLimiters[api](req, res, next);
};

module.exports = {
  limiter,
  authLimiter,
  getProviderLimiter
};
