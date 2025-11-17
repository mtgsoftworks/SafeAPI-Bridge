const UsageModel = require('../models/Usage');
const UserModel = require('../models/User');
const webhookService = require('./webhook');

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
      console.error('Usage tracking error:', error);
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
        // GPT-3.5: $0.002/1K tokens, GPT-4: $0.03/1K tokens (average estimate)
        estimatedCost = (tokensUsed / 1000) * 0.01;
      }

      // Gemini
      if (api === 'gemini' && responseData.usageMetadata) {
        tokensUsed = responseData.usageMetadata.totalTokenCount || 0;
        // Gemini Pro: ~$0.0005/1K tokens
        estimatedCost = (tokensUsed / 1000) * 0.0005;
      }

      // Claude
      if (api === 'claude' && responseData.usage) {
        tokensUsed = (responseData.usage.input_tokens || 0) + (responseData.usage.output_tokens || 0);
        // Claude: ~$0.008/1K tokens (average)
        estimatedCost = (tokensUsed / 1000) * 0.008;
      }

      // Groq, Mistral and other OpenAI-like providers
      if (
        ['groq', 'mistral', 'deepseek', 'perplexity', 'together', 'openrouter', 'fireworks', 'github'].includes(api) &&
        responseData.usage
      ) {
        tokensUsed = responseData.usage.total_tokens || 0;
        estimatedCost = (tokensUsed / 1000) * 0.001; // Usually cheaper
      }
    } catch (error) {
      console.error('Cost estimation error:', error);
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
      console.error('Update user cost error:', error);
    }
  }

  /**
   * Check usage thresholds and trigger webhooks
   */
  static async checkUsageThresholds(userId) {
    try {
      const user = await UserModel.findByUserId(userId);

      // Check if reaching 80% of daily quota
      if (user.requestsToday >= user.dailyQuota * 0.8 && user.requestsToday < user.dailyQuota * 0.81) {
        await webhookService.trigger('usage.high', {
          userId: user.userId,
          type: 'daily',
          usage: user.requestsToday,
          quota: user.dailyQuota,
          percentage: (user.requestsToday / user.dailyQuota * 100).toFixed(2)
        });
      }

      // Check if reaching 80% of monthly quota
      if (user.requestsMonth >= user.monthlyQuota * 0.8 && user.requestsMonth < user.monthlyQuota * 0.81) {
        await webhookService.trigger('usage.high', {
          userId: user.userId,
          type: 'monthly',
          usage: user.requestsMonth,
          quota: user.monthlyQuota,
          percentage: (user.requestsMonth / user.monthlyQuota * 100).toFixed(2)
        });
      }
    } catch (error) {
      console.error('Check usage thresholds error:', error);
    }
  }
}

module.exports = UsageTrackingService;
