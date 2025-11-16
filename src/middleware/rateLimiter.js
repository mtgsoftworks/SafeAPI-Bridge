const rateLimit = require('express-rate-limit');
const config = require('../config/env');

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
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs
  message: {
    error: 'Too many authentication attempts',
    message: 'Too many attempts from this IP, please try again later',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  limiter,
  authLimiter
};
