const express = require('express');
const router = express.Router();
const UserModel = require('../models/User');
const IpRuleModel = require('../models/IpRule');
const webhookService = require('../services/webhook');
const prisma = require('../db/client');
const { authenticateToken } = require('../middleware/auth');

/**
 * Admin Routes
 * Manage users, IP rules, webhooks
 *
 * Note: In production, add admin-specific authentication
 */

// Admin authentication middleware (basic version)
const adminAuth = (req, res, next) => {
  const adminKey = req.headers['x-admin-key'];

  if (adminKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid admin key'
    });
  }

  next();
};

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

    res.status(201).json(user);
  } catch (error) {
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

    res.json(user);
  } catch (error) {
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
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
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
      addedBy: 'admin'
    });

    res.status(201).json(rule);
  } catch (error) {
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
    res.json({ message: 'IP rule removed successfully' });
  } catch (error) {
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
 */
router.post('/webhooks', adminAuth, async (req, res) => {
  try {
    const { url, events, secret, headers, retryCount, timeout } = req.body;

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

    res.status(201).json(webhook);
  } catch (error) {
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
    res.json({ message: 'Test webhook sent' });
  } catch (error) {
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
    res.json({ message: 'Webhook deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
