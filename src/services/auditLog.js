const prisma = require('../db/client');
const { logAdminOperation } = require('../utils/securityLogger');

/**
 * Audit Log Service
 * Records all admin operations to database for compliance and security auditing
 */

/**
 * Create an audit log entry
 */
const createAuditLog = async ({
  action,
  adminKeyHash,
  ipAddress,
  userAgent = null,
  details = {},
  success = true
}) => {
  try {
    const auditLog = await prisma.auditLog.create({
      data: {
        action,
        adminKey: adminKeyHash,
        ipAddress,
        userAgent,
        details: JSON.stringify(details),
        success
      }
    });

    // Also log to Winston for immediate visibility
    logAdminOperation(action, adminKeyHash, ipAddress, {
      success,
      details
    });

    return auditLog;
  } catch (error) {
    console.error('Failed to create audit log:', error);
    // Don't throw - audit log failure shouldn't break admin operations
    // But do log to Winston
    logAdminOperation(action, adminKeyHash, ipAddress, {
      success,
      details,
      auditLogError: error.message
    });
  }
};

/**
 * Log admin user management action
 */
const logUserManagement = async (action, adminKeyHash, ip, userAgent, userId, details = {}) => {
  return createAuditLog({
    action: `user.${action}`, // user.create, user.update, user.delete
    adminKeyHash,
    ipAddress: ip,
    userAgent,
    details: {
      userId,
      ...details
    },
    success: true
  });
};

/**
 * Log admin IP rule management
 */
const logIPRuleManagement = async (action, adminKeyHash, ip, userAgent, ruleIp, details = {}) => {
  return createAuditLog({
    action: `ip_rule.${action}`, // ip_rule.add, ip_rule.remove
    adminKeyHash,
    ipAddress: ip,
    userAgent,
    details: {
      ruleIp,
      ...details
    },
    success: true
  });
};

/**
 * Log admin webhook management
 */
const logWebhookManagement = async (action, adminKeyHash, ip, userAgent, webhookId, details = {}) => {
  return createAuditLog({
    action: `webhook.${action}`, // webhook.create, webhook.delete, webhook.test
    adminKeyHash,
    ipAddress: ip,
    userAgent,
    details: {
      webhookId,
      ...details
    },
    success: true
  });
};

/**
 * Log failed admin operation
 */
const logFailedOperation = async (action, adminKeyHash, ip, userAgent, error) => {
  return createAuditLog({
    action,
    adminKeyHash,
    ipAddress: ip,
    userAgent,
    details: {
      error: error.message || error
    },
    success: false
  });
};

/**
 * Get audit logs with pagination
 */
const getAuditLogs = async (skip = 0, take = 50, filters = {}) => {
  const where = {};

  if (filters.action) {
    where.action = { contains: filters.action };
  }

  if (filters.adminKey) {
    where.adminKey = filters.adminKey;
  }

  if (filters.success !== undefined) {
    where.success = filters.success;
  }

  if (filters.startDate || filters.endDate) {
    where.createdAt = {};
    if (filters.startDate) {
      where.createdAt.gte = new Date(filters.startDate);
    }
    if (filters.endDate) {
      where.createdAt.lte = new Date(filters.endDate);
    }
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip: parseInt(skip),
      take: parseInt(take),
      orderBy: { createdAt: 'desc' }
    }),
    prisma.auditLog.count({ where })
  ]);

  return {
    logs: logs.map(log => ({
      ...log,
      details: JSON.parse(log.details || '{}')
    })),
    total,
    skip: parseInt(skip),
    take: parseInt(take)
  };
};

/**
 * Get audit logs for specific admin key
 */
const getAuditLogsByAdmin = async (adminKeyHash, skip = 0, take = 50) => {
  return getAuditLogs(skip, take, { adminKey: adminKeyHash });
};

/**
 * Get recent failed operations
 */
const getFailedOperations = async (limit = 20) => {
  const logs = await prisma.auditLog.findMany({
    where: { success: false },
    take: limit,
    orderBy: { createdAt: 'desc' }
  });

  return logs.map(log => ({
    ...log,
    details: JSON.parse(log.details || '{}')
  }));
};

/**
 * Get audit log statistics
 */
const getAuditStats = async (days = 7) => {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const [total, successful, failed, byAction] = await Promise.all([
    prisma.auditLog.count({
      where: { createdAt: { gte: startDate } }
    }),
    prisma.auditLog.count({
      where: {
        createdAt: { gte: startDate },
        success: true
      }
    }),
    prisma.auditLog.count({
      where: {
        createdAt: { gte: startDate },
        success: false
      }
    }),
    prisma.auditLog.groupBy({
      by: ['action'],
      where: { createdAt: { gte: startDate } },
      _count: true,
      orderBy: { _count: { action: 'desc' } },
      take: 10
    })
  ]);

  return {
    period: `Last ${days} days`,
    total,
    successful,
    failed,
    successRate: total > 0 ? ((successful / total) * 100).toFixed(2) + '%' : '0%',
    topActions: byAction.map(item => ({
      action: item.action,
      count: item._count
    }))
  };
};

module.exports = {
  createAuditLog,
  logUserManagement,
  logIPRuleManagement,
  logWebhookManagement,
  logFailedOperation,
  getAuditLogs,
  getAuditLogsByAdmin,
  getFailedOperations,
  getAuditStats
};
