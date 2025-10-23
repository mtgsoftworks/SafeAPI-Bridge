const express = require('express');
const router = express.Router();
const { generateToken } = require('../middleware/auth');
const { validateAuthRequest } = require('../utils/validator');
const { authLimiter } = require('../middleware/rateLimiter');
const UserModel = require('../models/User');
const webhookService = require('../services/webhook');

/**
 * Authentication Routes
 * Generates JWT tokens for Android app with auto user creation
 */

/**
 * POST /auth/token
 * Generate a new JWT token for the client
 * Automatically creates user if doesn't exist
 *
 * Body:
 * {
 *   "userId": "unique-user-id",
 *   "appId": "android-app-id"
 * }
 */
router.post('/token', authLimiter, validateAuthRequest, async (req, res) => {
  try {
    const { userId, appId } = req.body;

    // Find or create user (auto user creation)
    const user = await UserModel.findOrCreate({ userId, appId });

    // Check if this is a new user
    const isNewUser = user.createdAt.getTime() > Date.now() - 1000; // Created in last second

    // Trigger webhook for new user (do not include sensitive apiKey)
    if (isNewUser) {
      await webhookService.trigger('user.created', {
        userId: user.userId,
        appId: user.appId,
        quotas: {
          daily: user.dailyQuota,
          monthly: user.monthlyQuota
        },
        createdAt: user.createdAt
      });
    }

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
      user: {
        userId: user.userId,
        appId: user.appId,
        dailyQuota: user.dailyQuota,
        monthlyQuota: user.monthlyQuota,
        requestsToday: user.requestsToday,
        requestsMonth: user.requestsMonth
      },
      message: isNewUser
        ? 'New user created and token generated successfully'
        : 'Token generated successfully. Use this token in Authorization header as: Bearer <token>'
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
