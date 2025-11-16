const prisma = require('../db/client');

/**
 * IP Rule Model
 * Manages IP whitelist and blacklist
 */

class IpRuleModel {
  /**
   * Add IP to whitelist or blacklist
   */
  static async add({ ipAddress, type, reason = null, addedBy = null }) {
    if (!['whitelist', 'blacklist'].includes(type)) {
      throw new Error('Type must be whitelist or blacklist');
    }

    return await prisma.ipRule.create({
      data: {
        ipAddress,
        type,
        reason,
        addedBy
      }
    });
  }

  /**
   * Check if IP is allowed
   */
  static async isAllowed(ipAddress) {
    const rules = await prisma.ipRule.findMany({
      where: {
        ipAddress,
        active: true
      }
    });

    // If there are no rules, allow by default
    if (rules.length === 0) {
      return { allowed: true };
    }

    // Check blacklist first
    const isBlacklisted = rules.some(rule => rule.type === 'blacklist');
    if (isBlacklisted) {
      return {
        allowed: false,
        reason: 'IP is blacklisted',
        rule: rules.find(r => r.type === 'blacklist')
      };
    }

    // Check whitelist
    const isWhitelisted = rules.some(rule => rule.type === 'whitelist');

    return {
      allowed: isWhitelisted,
      reason: isWhitelisted ? null : 'IP not in whitelist'
    };
  }

  /**
   * Get all rules
   */
  static async getAll(type = null) {
    return await prisma.ipRule.findMany({
      where: type ? { type } : {},
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Remove IP rule
   */
  static async remove(ipAddress) {
    return await prisma.ipRule.deleteMany({
      where: { ipAddress }
    });
  }

  /**
   * Deactivate IP rule
   */
  static async deactivate(ipAddress) {
    return await prisma.ipRule.updateMany({
      where: { ipAddress },
      data: { active: false }
    });
  }

  /**
   * Activate IP rule
   */
  static async activate(ipAddress) {
    return await prisma.ipRule.updateMany({
      where: { ipAddress },
      data: { active: true }
    });
  }
}

module.exports = IpRuleModel;
