const jwt = require('jsonwebtoken');
const config = require('../config/env');
const tokenBlacklist = require('../services/tokenBlacklist');
const { logFailedAuth } = require('../utils/securityLogger');

/**
 * JWT Authentication Middleware
 * Verifies JWT token from Authorization header
 * Now with token blacklist support for logout functionality
 * AND support for Split Key (BYOK) method validation
 */
const authenticateToken = async (req, res, next) => {
  // Get token from header
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  const ip = req.clientIp || req.ip || req.headers['x-forwarded-for'] || 'unknown';

  if (!token) {
    logFailedAuth('jwt', 'no-token', ip, 'Missing authorization token');
    return res.status(401).json({
      error: 'Authentication required',
      message: 'No token provided'
    });
  }

  // Check if token is blacklisted (logout/revoked)
  const isBlacklisted = await tokenBlacklist.isBlacklisted(token);
  if (isBlacklisted) {
    logFailedAuth('jwt', 'blacklisted', ip, 'Token has been revoked (user logged out)');
    return res.status(401).json({
      error: 'Token Revoked',
      message: 'This token has been logged out. Please log in again.'
    });
  }

  // Verify token
  jwt.verify(token, config.jwtSecret, (err, user) => {
    if (err) {
      logFailedAuth('jwt', user?.userId || 'unknown', ip, `Token verification failed: ${err.message}`);
      return res.status(403).json({
        error: 'Invalid token',
        message: 'Token verification failed'
      });
    }

    req.user = user;
    req.token = token; // Attach token for logout

    // Determine authentication method and attach to request
    const splitKeyHeaders = {
      'x-partial-key-id': req.headers['x-partial-key-id'],
      'x-partial-key': req.headers['x-partial-key']
    };

    req.authMethod = splitKeyHeaders['x-partial-key-id'] && splitKeyHeaders['x-partial-key']
      ? 'BYOK_SPLIT_KEY'
      : 'SERVER_KEY';

    next();
  });
};

/**
 * Generate JWT Token
 * Used by the auth endpoint to create tokens for clients
 */
const generateToken = (payload) => {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn
  });
};

/**
 * Verify Token (for testing/debugging)
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch (error) {
    return null;
  }
};

module.exports = {
  authenticateToken,
  generateToken,
  verifyToken
};
