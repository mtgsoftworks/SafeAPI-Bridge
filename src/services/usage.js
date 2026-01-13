const UsageModel = require('../models/Usage');
const UserModel = require('../models/User');
const webhookService = require('./webhook');
const { USAGE } = require('../config/constants');
const { logger } = require('../utils/securityLogger');

/**
 * Usage Tracking Service
 * Handles API usage tracking and quota management
 */

class UsageTrackingService {
  /**
   * Track API request
   */
  static async trackRequest({
    userId,
    api,
    endpoint,
    method,
    statusCode,
    success,
    responseTime,
    req,
    responseData = null
  }) {
    try {
      const lightMode = process.env.LIGHT_MODE === 'true';
      // Estimate tokens and cost (skip in light mode to reduce CPU)
      const { tokensUsed, estimatedCost } = lightMode ? { tokensUsed: 0, estimatedCost: 0 } : this.estimateCost(api, responseData);

      if (!lightMode) {
        // Detailed logging only in normal mode
        await UsageModel.log({
          userId,
          api,
          endpoint,
          method,
          statusCode,
          success,
          tokensUsed,
          estimatedCost,
          responseTime,
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.headers['user-agent']
        });
      }

      // Always increment request counters (required for quotas)
      await UserModel.incrementRequests(userId);

      if (!lightMode) {
        // Update total cost and thresholds only in normal mode
        await this.updateUserCost(userId, estimatedCost);
        await this.checkUsageThresholds(userId);
      }

      return { tokensUsed, estimatedCost };
    } catch (error) {
      logger.error('Usage tracking error', { error: error.message, userId, api });
    }
  }

  /**
   * Estimate tokens and cost based on API and response
   */
  static estimateCost(api, responseData) {
    let tokensUsed = 0;
    let estimatedCost = 0;

    if (!responseData) {
      return { tokensUsed, estimatedCost };
    }

    try {
      // OpenAI
      if (api === 'openai' && responseData.usage) {
        tokensUsed = responseData.usage.total_tokens || 0;
        estimatedCost = (tokensUsed / 1000) * USAGE.COST_ESTIMATION_MULTIPLIERS.openai;
      }

      // Gemini
      if (api === 'gemini' && responseData.usageMetadata) {
        tokensUsed = responseData.usageMetadata.totalTokenCount || 0;
        estimatedCost = (tokensUsed / 1000) * USAGE.COST_ESTIMATION_MULTIPLIERS.gemini;
      }

      // Claude
      if (api === 'claude' && responseData.usage) {
        tokensUsed = (responseData.usage.input_tokens || 0) + (responseData.usage.output_tokens || 0);
        estimatedCost = (tokensUsed / 1000) * USAGE.COST_ESTIMATION_MULTIPLIERS.claude;
      }

      // Groq, Mistral and other OpenAI-like providers
      if (
        ['groq', 'mistral', 'deepseek', 'perplexity', 'together', 'openrouter', 'fireworks', 'github'].includes(api) &&
        responseData.usage
      ) {
        tokensUsed = responseData.usage.total_tokens || 0;
        estimatedCost = (tokensUsed / 1000) * USAGE.COST_ESTIMATION_MULTIPLIERS.default;
      }
    } catch (error) {
      logger.error('Cost estimation error', { error: error.message, api });
    }

    return { tokensUsed, estimatedCost };
  }

  /**
   * Update user total cost
   */
  static async updateUserCost(userId, cost) {
    try {
      await require('../db/client').user.update({
        where: { userId },
        data: {
          totalCost: { increment: cost }
        }
      });
    } catch (error) {
      logger.error('Update user cost error', { error: error.message, userId });
    }
  }

  /**
   * Check usage thresholds and trigger webhooks
   */
  static async checkUsageThresholds(userId) {
    try {
      const user = await UserModel.findByUserId(userId);

      // Check if reaching threshold percentage of daily quota
      const dailyThreshold = user.dailyQuota * USAGE.USAGE_THRESHOLD_PERCENTAGE;
      if (user.requestsToday >= dailyThreshold && user.requestsToday < dailyThreshold + 1) {
        await webhookService.trigger('usage.high', {
          userId: user.userId,
          type: 'daily',
          usage: user.requestsToday,
          quota: user.dailyQuota,
          percentage: (USAGE.USAGE_THRESHOLD_PERCENTAGE * 100).toFixed(1)
        });
      }

      // Check if reaching threshold percentage of monthly quota
      const monthlyThreshold = user.monthlyQuota * USAGE.USAGE_THRESHOLD_PERCENTAGE;
      if (user.requestsMonth >= monthlyThreshold && user.requestsMonth < monthlyThreshold + 1) {
        await webhookService.trigger('usage.high', {
          userId: user.userId,
          type: 'monthly',
          usage: user.requestsMonth,
          quota: user.monthlyQuota,
          percentage: (USAGE.USAGE_THRESHOLD_PERCENTAGE * 100).toFixed(1)
        });
      }
    } catch (error) {
      logger.error('Check usage thresholds error', { error: error.message, userId });
    }
  }
}

module.exports = UsageTrackingService;
