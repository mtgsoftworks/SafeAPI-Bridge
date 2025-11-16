const express = require('express');
const router = express.Router();
const UserModel = require('../models/User');
const IpRuleModel = require('../models/IpRule');
const webhookService = require('../services/webhook');
const prisma = require('../db/client');
const { authenticateToken } = require('../middleware/auth');
const { adminAuth, adminLimiter } = require('../middleware/adminAuth');
const auditLogService = require('../services/auditLog');
const { validateURL } = require('../utils/urlValidator');

/**
 * Admin Routes
 * Manage users, IP rules, webhooks, audit logs
 *
 * Security Features:
 * - Timing-safe authentication
 * - Rate limiting (5 req/15min)
 * - Audit logging
 * - Failed attempt tracking
 */

// Apply admin rate limiter to all admin routes
router.use(adminLimiter);

// ==================== USER MANAGEMENT ====================

/**
 * GET /admin/users
 * List all users
 */
router.get('/users', adminAuth, async (req, res) => {
  try {
    const { skip = 0, take = 50 } = req.query;
    const users = await UserModel.getAll(parseInt(skip), parseInt(take));

    res.json({
      users,
      count: users.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /admin/users/:userId
 * Get specific user
 */
router.get('/users/:userId', adminAuth, async (req, res) => {
  try {
    const user = await UserModel.findByUserId(req.params.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/users
 * Create new user manually
 */
router.post('/users', adminAuth, async (req, res) => {
  try {
    const { userId, appId, dailyQuota, monthlyQuota } = req.body;

    const user = await UserModel.create({
      userId,
      appId,
      dailyQuota,
      monthlyQuota
    });

    // Audit log
    await auditLogService.logUserManagement(
      'create',
      req.admin.keyHash,
      req.admin.ip,
      req.headers['user-agent'],
      userId,
      { appId, dailyQuota, monthlyQuota }
    );

    res.status(201).json(user);
  } catch (error) {
    await auditLogService.logFailedOperation(
      'user.create',
      req.admin.keyHash,
      req.admin.ip,
      req.headers['user-agent'],
      error
    );
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /admin/users/:userId/quota
 * Update user quotas
 */
router.put('/users/:userId/quota', adminAuth, async (req, res) => {
  try {
    const { dailyQuota, monthlyQuota } = req.body;

    const user = await UserModel.updateQuotas(req.params.userId, {
      dailyQuota,
      monthlyQuota
    });

    // Audit log
    await auditLogService.logUserManagement(
      'update_quota',
      req.admin.keyHash,
      req.admin.ip,
      req.headers['user-agent'],
      req.params.userId,
      { dailyQuota, monthlyQuota }
    );

    res.json(user);
  } catch (error) {
    await auditLogService.logFailedOperation(
      'user.update_quota',
      req.admin.keyHash,
      req.admin.ip,
      req.headers['user-agent'],
      error
    );
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /admin/users/:userId
 * Delete user
 */
router.delete('/users/:userId', adminAuth, async (req, res) => {
  try {
    await UserModel.delete(req.params.userId);

    // Audit log
    await auditLogService.logUserManagement(
      'delete',
      req.admin.keyHash,
      req.admin.ip,
      req.headers['user-agent'],
      req.params.userId
    );

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    await auditLogService.logFailedOperation(
      'user.delete',
      req.admin.keyHash,
      req.admin.ip,
      req.headers['user-agent'],
      error
    );
    res.status(500).json({ error: error.message });
  }
});

// ==================== IP RULES ====================

/**
 * GET /admin/ip-rules
 * List all IP rules
 */
router.get('/ip-rules', adminAuth, async (req, res) => {
  try {
    const { type } = req.query;
    const rules = await IpRuleModel.getAll(type);
    res.json(rules);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/ip-rules
 * Add new IP rule
 */
router.post('/ip-rules', adminAuth, async (req, res) => {
  try {
    const { ipAddress, type, reason } = req.body;

    const rule = await IpRuleModel.add({
      ipAddress,
      type,
      reason,
      addedBy: req.admin.keyHash
    });

    // Audit log
    await auditLogService.logIPRuleManagement(
      'add',
      req.admin.keyHash,
      req.admin.ip,
      req.headers['user-agent'],
      ipAddress,
      { type, reason }
    );

    res.status(201).json(rule);
  } catch (error) {
    await auditLogService.logFailedOperation(
      'ip_rule.add',
      req.admin.keyHash,
      req.admin.ip,
      req.headers['user-agent'],
      error
    );
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /admin/ip-rules/:ip
 * Remove IP rule
 */
router.delete('/ip-rules/:ip', adminAuth, async (req, res) => {
  try {
    await IpRuleModel.remove(req.params.ip);

    // Audit log
    await auditLogService.logIPRuleManagement(
      'remove',
      req.admin.keyHash,
      req.admin.ip,
      req.headers['user-agent'],
      req.params.ip
    );

    res.json({ message: 'IP rule removed successfully' });
  } catch (error) {
    await auditLogService.logFailedOperation(
      'ip_rule.remove',
      req.admin.keyHash,
      req.admin.ip,
      req.headers['user-agent'],
      error
    );
    res.status(500).json({ error: error.message });
  }
});

// ==================== WEBHOOKS ====================

/**
 * GET /admin/webhooks
 * List all webhooks
 */
router.get('/webhooks', adminAuth, async (req, res) => {
  try {
    const webhooks = await prisma.webhook.findMany();
    res.json(webhooks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/webhooks
 * Create new webhook
 * Now with SSRF protection
 */
router.post('/webhooks', adminAuth, async (req, res) => {
  try {
    const { url, events, secret, headers, retryCount, timeout } = req.body;

    // Validate URL for SSRF protection
    const urlValidation = validateURL(url, req.admin.ip);
    if (!urlValidation.valid) {
      await auditLogService.logFailedOperation(
        'webhook.create',
        req.admin.keyHash,
        req.admin.ip,
        req.headers['user-agent'],
        new Error(`SSRF protection: ${urlValidation.error}`)
      );

      return res.status(400).json({
        error: 'Invalid Webhook URL',
        message: urlValidation.error,
        security: 'SSRF protection enabled'
      });
    }

    const webhook = await prisma.webhook.create({
      data: {
        url,
        events,
        secret,
        headers,
        retryCount,
        timeout
      }
    });

    // Audit log
    await auditLogService.logWebhookManagement(
      'create',
      req.admin.keyHash,
      req.admin.ip,
      req.headers['user-agent'],
      webhook.id,
      { url, events }
    );

    res.status(201).json(webhook);
  } catch (error) {
    await auditLogService.logFailedOperation(
      'webhook.create',
      req.admin.keyHash,
      req.admin.ip,
      req.headers['user-agent'],
      error
    );
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/webhooks/:id/test
 * Test webhook
 */
router.post('/webhooks/:id/test', adminAuth, async (req, res) => {
  try {
    await webhookService.test(req.params.id);

    // Audit log
    await auditLogService.logWebhookManagement(
      'test',
      req.admin.keyHash,
      req.admin.ip,
      req.headers['user-agent'],
      req.params.id
    );

    res.json({ message: 'Test webhook sent' });
  } catch (error) {
    await auditLogService.logFailedOperation(
      'webhook.test',
      req.admin.keyHash,
      req.admin.ip,
      req.headers['user-agent'],
      error
    );
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /admin/webhooks/:id
 * Delete webhook
 */
router.delete('/webhooks/:id', adminAuth, async (req, res) => {
  try {
    await prisma.webhook.delete({
      where: { id: req.params.id }
    });

    // Audit log
    await auditLogService.logWebhookManagement(
      'delete',
      req.admin.keyHash,
      req.admin.ip,
      req.headers['user-agent'],
      req.params.id
    );

    res.json({ message: 'Webhook deleted successfully' });
  } catch (error) {
    await auditLogService.logFailedOperation(
      'webhook.delete',
      req.admin.keyHash,
      req.admin.ip,
      req.headers['user-agent'],
      error
    );
    res.status(500).json({ error: error.message });
  }
});

// ==================== AUDIT LOGS ====================

/**
 * GET /admin/audit-logs
 * Get audit logs with pagination and filtering
 */
router.get('/audit-logs', adminAuth, async (req, res) => {
  try {
    const { skip = 0, take = 50, action, success, startDate, endDate } = req.query;

    const filters = {};
    if (action) filters.action = action;
    if (success !== undefined) filters.success = success === 'true';
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;

    const result = await auditLogService.getAuditLogs(skip, take, filters);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /admin/audit-logs/stats
 * Get audit log statistics
 */
router.get('/audit-logs/stats', adminAuth, async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const stats = await auditLogService.getAuditStats(parseInt(days));

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /admin/audit-logs/failed
 * Get recent failed operations
 */
router.get('/audit-logs/failed', adminAuth, async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const failedOps = await auditLogService.getFailedOperations(parseInt(limit));

    res.json(failedOps);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
