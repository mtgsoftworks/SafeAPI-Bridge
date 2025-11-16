const prisma = require('../db/client');
const crypto = require('crypto');

/**
 * User Model
 * Handles all user-related database operations
 */

class UserModel {
  /**
   * Create a new user with auto-generated API key
   */
  static async create({ userId, appId, dailyQuota = 100, monthlyQuota = 3000 }) {
    const apiKey = crypto.randomBytes(32).toString('hex');

    return await prisma.user.create({
      data: {
        userId,
        appId,
        apiKey,
        dailyQuota,
        monthlyQuota
      }
    });
  }

  /**
   * Find user by userId
   */
  static async findByUserId(userId) {
    return await prisma.user.findUnique({
      where: { userId }
    });
  }

  /**
   * Find user by API key
   */
  static async findByApiKey(apiKey) {
    return await prisma.user.findUnique({
      where: { apiKey }
    });
  }

  /**
   * Find or create user (for auto user creation)
   */
  static async findOrCreate({ userId, appId }) {
    let user = await this.findByUserId(userId);

    if (!user) {
      user = await this.create({ userId, appId });
    }

    return user;
  }

  /**
   * Update user quotas
   */
  static async updateQuotas(userId, { dailyQuota, monthlyQuota }) {
    return await prisma.user.update({
      where: { userId },
      data: {
        dailyQuota,
        monthlyQuota
      }
    });
  }

  /**
   * Increment request counters
   */
  static async incrementRequests(userId) {
    return await prisma.user.update({
      where: { userId },
      data: {
        requestsToday: { increment: 1 },
        requestsMonth: { increment: 1 },
        lastUsedAt: new Date()
      }
    });
  }

  /**
   * Reset daily counters (called by cron job)
   */
  static async resetDailyCounters() {
    return await prisma.user.updateMany({
      data: {
        requestsToday: 0
      }
    });
  }

  /**
   * Reset monthly counters
   */
  static async resetMonthlyCounters() {
    return await prisma.user.updateMany({
      data: {
        requestsMonth: 0
      }
    });
  }

  /**
   * Get all users
   */
  static async getAll(skip = 0, take = 50) {
    return await prisma.user.findMany({
      skip,
      take,
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Delete user
   */
  static async delete(userId) {
    return await prisma.user.delete({
      where: { userId }
    });
  }

  /**
   * Check if user has exceeded quota
   */
  static async checkQuota(userId) {
    const user = await this.findByUserId(userId);

    if (!user) {
      return { exceeded: true, reason: 'User not found' };
    }

    if (!user.active) {
      return { exceeded: true, reason: 'User is inactive' };
    }

    if (user.requestsToday >= user.dailyQuota) {
      return { exceeded: true, reason: 'Daily quota exceeded' };
    }

    if (user.requestsMonth >= user.monthlyQuota) {
      return { exceeded: true, reason: 'Monthly quota exceeded' };
    }

    return { exceeded: false, user };
  }
}

module.exports = UserModel;
