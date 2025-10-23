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

/**
 * POST /auth/logout
 * Logout current user by blacklisting their token
 * Requires authentication
 */
router.post('/logout', require('../middleware/auth').authenticateToken, async (req, res) => {
  try {
    const { token } = req;
    const { userId } = req.user;
    const ip = req.clientIp || req.ip || req.headers['x-forwarded-for'] || 'unknown';

    // Add token to blacklist
    const tokenBlacklist = require('../services/tokenBlacklist');
    const success = await tokenBlacklist.addToBlacklist(token, userId, ip);

    if (success) {
      res.json({
        success: true,
        message: 'Logged out successfully. Token has been revoked.',
        userId
      });
    } else {
      res.status(500).json({
        error: 'Logout Failed',
        message: 'Failed to revoke token. Please try again.'
      });
    }

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      error: 'Logout Failed',
      message: error.message
    });
  }
});

/**
 * GET /auth/token-info
 * Get information about the current token
 * Useful for debugging and monitoring
 */
router.get('/token-info', require('../middleware/auth').authenticateToken, async (req, res) => {
  try {
    const { token } = req;
    const jwt = require('jsonwebtoken');

    // Decode token (already verified by middleware)
    const decoded = jwt.decode(token);

    const tokenBlacklist = require('../services/tokenBlacklist');
    const blacklistInfo = await tokenBlacklist.getBlacklistInfo(token);

    const now = Math.floor(Date.now() / 1000);
    const expiresIn = decoded.exp - now;

    res.json({
      user: req.user,
      issuedAt: new Date(decoded.iat * 1000).toISOString(),
      expiresAt: new Date(decoded.exp * 1000).toISOString(),
      expiresInSeconds: expiresIn,
      expiresInHours: (expiresIn / 3600).toFixed(2),
      isBlacklisted: !!blacklistInfo,
      blacklistInfo
    });

  } catch (error) {
    console.error('Token info error:', error);
    res.status(500).json({
      error: 'Failed to get token info',
      message: error.message
    });
  }
});

module.exports = router;
