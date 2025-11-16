const UsageModel = require('../models/Usage');
const prisma = require('../db/client');

/**
 * Analytics Service
 * Provides usage analytics and statistics
 */

class AnalyticsService {
  /**
   * Get overview statistics
   */
  static async getOverview(startDate = null, endDate = null) {
    const stats = await UsageModel.getSystemStats(startDate, endDate);

    // Get top users
    const topUsers = await this.getTopUsers(10, startDate, endDate);

    // Get hourly distribution
    const hourlyStats = await this.getHourlyDistribution(startDate, endDate);

    return {
      ...stats,
      topUsers,
      hourlyDistribution: hourlyStats
    };
  }

  /**
   * Get user-specific analytics
   */
  static async getUserAnalytics(userId, startDate = null, endDate = null) {
    const [stats, recentRequests, apiBreakdown] = await Promise.all([
      UsageModel.getUserStats(userId, startDate, endDate),
      UsageModel.getRecentRequests(userId, 20),
      this.getUserApiBreakdown(userId, startDate, endDate)
    ]);

    return {
      ...stats,
      recentRequests,
      apiBreakdown
    };
  }

  /**
   * Get top users by usage
   */
  static async getTopUsers(limit = 10, startDate = null, endDate = null) {
    const where = startDate && endDate ? {
      createdAt: {
        gte: startDate,
        lte: endDate
      }
    } : {};

    const topUsers = await prisma.apiUsage.groupBy({
      by: ['userId'],
      where,
      _count: true,
      _sum: {
        estimatedCost: true,
        tokensUsed: true
      },
      orderBy: {
        _count: {
          userId: 'desc'
        }
      },
      take: limit
    });

    // Enrich with user data
    const enriched = await Promise.all(
      topUsers.map(async (item) => {
        const user = await prisma.user.findUnique({
          where: { userId: item.userId },
          select: { userId: true, appId: true, createdAt: true }
        });

        return {
          ...user,
          totalRequests: item._count,
          totalCost: item._sum.estimatedCost || 0,
          totalTokens: item._sum.tokensUsed || 0
        };
      })
    );

    return enriched;
  }

  /**
   * Get hourly distribution of requests
   */
  static async getHourlyDistribution(startDate = null, endDate = null) {
    const where = startDate && endDate ? {
      createdAt: {
        gte: startDate,
        lte: endDate
      }
    } : {};

    // Fetch timestamps and group in JS for cross-DB compatibility (SQLite/Postgres)
    const rows = await prisma.apiUsage.findMany({
      where,
      select: { createdAt: true }
    });

    const counts = new Array(24).fill(0);
    for (const r of rows) {
      const d = new Date(r.createdAt);
      const hour = d.getHours();
      counts[hour]++;
    }

    return counts.map((count, hour) => ({ hour, count }));
  }

  /**
   * Get API breakdown for specific user
   */
  static async getUserApiBreakdown(userId, startDate = null, endDate = null) {
    const where = {
      userId,
      ...(startDate && endDate && {
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      })
    };

    return await prisma.apiUsage.groupBy({
      by: ['api'],
      where,
      _count: true,
      _sum: {
        estimatedCost: true,
        tokensUsed: true
      },
      _avg: {
        responseTime: true
      }
    });
  }

  /**
   * Get cost breakdown by API
   */
  static async getCostBreakdown(startDate = null, endDate = null) {
    const where = startDate && endDate ? {
      createdAt: {
        gte: startDate,
        lte: endDate
      }
    } : {};

    const breakdown = await prisma.apiUsage.groupBy({
      by: ['api'],
      where,
      _count: true,
      _sum: {
        estimatedCost: true,
        tokensUsed: true
      },
      orderBy: {
        _sum: {
          estimatedCost: 'desc'
        }
      }
    });

    const total = breakdown.reduce((sum, item) => sum + (item._sum.estimatedCost || 0), 0);

    return {
      breakdown: breakdown.map(item => ({
        api: item.api,
        requests: item._count,
        cost: item._sum.estimatedCost || 0,
        tokens: item._sum.tokensUsed || 0,
        percentage: total > 0 ? ((item._sum.estimatedCost || 0) / total * 100).toFixed(2) : 0
      })),
      total
    };
  }

  /**
   * Get error rate statistics
   */
  static async getErrorStats(startDate = null, endDate = null) {
    const where = startDate && endDate ? {
      createdAt: {
        gte: startDate,
        lte: endDate
      }
    } : {};

    const [total, successful] = await Promise.all([
      prisma.apiUsage.count({ where }),
      prisma.apiUsage.count({ where: { ...where, success: true } })
    ]);

    const failed = total - successful;
    const errorRate = total > 0 ? (failed / total * 100).toFixed(2) : 0;

    return {
      total,
      successful,
      failed,
      errorRate: parseFloat(errorRate)
    };
  }
}

module.exports = AnalyticsService;
