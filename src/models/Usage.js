const prisma = require('../db/client');

/**
 * API Usage Model
 * Tracks all API requests and usage statistics
 */

class UsageModel {
  /**
   * Log an API request
   */
  static async log({
    userId,
    api,
    endpoint,
    method = 'POST',
    statusCode,
    success = true,
    tokensUsed = 0,
    estimatedCost = 0,
    responseTime,
    ipAddress = null,
    userAgent = null
  }) {
    return await prisma.apiUsage.create({
      data: {
        userId,
        api,
        endpoint,
        method,
        statusCode,
        success,
        tokensUsed,
        estimatedCost,
        responseTime,
        ipAddress,
        userAgent
      }
    });
  }

  /**
   * Get usage statistics for a user
   */
  static async getUserStats(userId, startDate = null, endDate = null) {
    const where = {
      userId,
      ...(startDate && endDate && {
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      })
    };

    const [totalRequests, successfulRequests, totalCost, apiBreakdown] = await Promise.all([
      prisma.apiUsage.count({ where }),
      prisma.apiUsage.count({ where: { ...where, success: true } }),
      prisma.apiUsage.aggregate({
        where,
        _sum: { estimatedCost: true, tokensUsed: true }
      }),
      prisma.apiUsage.groupBy({
        by: ['api'],
        where,
        _count: true,
        _sum: { estimatedCost: true, tokensUsed: true }
      })
    ]);

    return {
      totalRequests,
      successfulRequests,
      failedRequests: totalRequests - successfulRequests,
      totalCost: totalCost._sum.estimatedCost || 0,
      totalTokens: totalCost._sum.tokensUsed || 0,
      apiBreakdown
    };
  }

  /**
   * Get overall system statistics
   */
  static async getSystemStats(startDate = null, endDate = null) {
    const where = startDate && endDate ? {
      createdAt: {
        gte: startDate,
        lte: endDate
      }
    } : {};

    const [totalRequests, totalUsers, totalCost, apiStats] = await Promise.all([
      prisma.apiUsage.count({ where }),
      prisma.user.count(),
      prisma.apiUsage.aggregate({
        where,
        _sum: { estimatedCost: true, tokensUsed: true }
      }),
      prisma.apiUsage.groupBy({
        by: ['api'],
        where,
        _count: true,
        _sum: { estimatedCost: true, tokensUsed: true },
        _avg: { responseTime: true }
      })
    ]);

    return {
      totalRequests,
      totalUsers,
      totalCost: totalCost._sum.estimatedCost || 0,
      totalTokens: totalCost._sum.tokensUsed || 0,
      apiStats
    };
  }

  /**
   * Get recent requests
   */
  static async getRecentRequests(userId = null, limit = 100) {
    return await prisma.apiUsage.findMany({
      where: userId ? { userId } : {},
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: {
          select: {
            userId: true,
            appId: true
          }
        }
      }
    });
  }

  /**
   * Delete old usage records (for cleanup)
   */
  static async deleteOldRecords(daysToKeep = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    return await prisma.apiUsage.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate
        }
      }
    });
  }
}

module.exports = UsageModel;
