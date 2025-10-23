const express = require('express');
const router = express.Router();
const { generateToken } = require('../middleware/auth');
const { validateAuthRequest } = require('../utils/validator');
const { authLimiter } = require('../middleware/rateLimiter');

/**
 * Authentication Routes
 * Generates JWT tokens for Android app
 */

/**
 * POST /auth/token
 * Generate a new JWT token for the client
 *
 * Body:
 * {
 *   "userId": "unique-user-id",
 *   "appId": "android-app-id"
 * }
 */
router.post('/token', authLimiter, validateAuthRequest, (req, res) => {
  try {
    const { userId, appId } = req.body;

    // Create token payload
    const payload = {
      userId,
      appId,
      createdAt: Date.now()
    };

    // Generate token
    const token = generateToken(payload);

    res.json({
      success: true,
      token,
      expiresIn: '7 days',
      tokenType: 'Bearer',
      message: 'Token generated successfully. Use this token in Authorization header as: Bearer <token>'
    });

  } catch (error) {
    console.error('Token generation error:', error);
    res.status(500).json({
      error: 'Token Generation Failed',
      message: error.message
    });
  }
});

/**
 * GET /auth/verify
 * Verify if the current token is valid (requires authentication)
 */
router.get('/verify', require('../middleware/auth').authenticateToken, (req, res) => {
  res.json({
    valid: true,
    user: req.user,
    message: 'Token is valid'
  });
});

module.exports = router;
