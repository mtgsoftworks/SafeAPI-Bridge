const UserModel = require('../models/User');
const webhookService = require('../services/webhook');

/**
 * Quota Check Middleware
 * Verifies user hasn't exceeded their quota
 */

const quotaCheck = async (req, res, next) => {
  try {
    // Get user from JWT (set by auth middleware)
    const { userId } = req.user;

    // Check quota
    const { exceeded, reason, user } = await UserModel.checkQuota(userId);

    if (exceeded) {
      // Trigger rate limit webhook
      if (reason.includes('quota exceeded')) {
        await webhookService.trigger('user.rate_limited', {
          userId,
          reason,
          timestamp: new Date().toISOString()
        });
      }

      return res.status(429).json({
        error: 'Quota Exceeded',
        message: reason,
        quotaInfo: user ? {
          dailyQuota: user.dailyQuota,
          dailyUsed: user.requestsToday,
          monthlyQuota: user.monthlyQuota,
          monthlyUsed: user.requestsMonth
        } : null
      });
    }

    // Attach user to request
    req.dbUser = user;

    next();
  } catch (error) {
    console.error('Quota check error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to check quota'
    });
  }
};

module.exports = quotaCheck;
