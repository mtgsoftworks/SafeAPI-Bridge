const UserModel = require('../models/User');
const IpRuleModel = require('../models/IpRule');
const webhookService = require('../services/webhook');
const prisma = require('../db/client');
const auditLogService = require('../services/auditLog');
const { validateURL } = require('../utils/urlValidator');
const metricsService = require('../services/metricsService');
const { setLogLevel, getLogLevel } = require('../utils/securityLogger');
const config = require('../config/env');
const abuseGuardService = require('../services/abuseGuard');

/**
 * Admin Controller
 * Handles business logic for admin operations
 */
const AdminController = {
    // ==================== USER MANAGEMENT ====================

    /**
     * List all users
     */
    async listUsers(req, res) {
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
    },

    /**
     * Get specific user
     */
    async getUser(req, res) {
        try {
            const user = await UserModel.findByUserId(req.params.userId);

            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            res.json(user);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    /**
     * Create new user manually
     */
    async createUser(req, res) {
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
    },

    /**
     * Update user quotas
     */
    async updateUserQuota(req, res) {
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
    },

    /**
     * Delete user
     */
    async deleteUser(req, res) {
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
    },

    // ==================== IP RULES ====================

    /**
     * List all IP rules
     */
    async listIpRules(req, res) {
        try {
            const { type } = req.query;
            const rules = await IpRuleModel.getAll(type);
            res.json(rules);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    /**
     * Add new IP rule
     */
    async addIpRule(req, res) {
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
    },

    /**
     * Remove IP rule
     */
    async removeIpRule(req, res) {
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
    },

    // ==================== WEBHOOKS ====================

    /**
     * List all webhooks
     */
    async listWebhooks(req, res) {
        try {
            const webhooks = await prisma.webhook.findMany();
            res.json(webhooks);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    /**
     * Create new webhook
     */
    async createWebhook(req, res) {
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
    },

    /**
     * Test webhook
     */
    async testWebhook(req, res) {
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
    },

    /**
     * Delete webhook
     */
    async deleteWebhook(req, res) {
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
    },

    // ==================== AUDIT LOGS ====================

    /**
     * Get audit logs
     */
    async getAuditLogs(req, res) {
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
    },

    /**
     * Get audit log stats
     */
    async getAuditStats(req, res) {
        try {
            const { days = 7 } = req.query;
            const stats = await auditLogService.getAuditStats(parseInt(days));

            res.json(stats);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    /**
     * Get failed operations
     */
    async getFailedOperations(req, res) {
        try {
            const { limit = 20 } = req.query;
            const failedOps = await auditLogService.getFailedOperations(parseInt(limit));

            res.json(failedOps);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // ==================== SECURITY BLOCKS ====================

    /**
     * List active temporary abuse-guard blocks
     */
    async listSecurityBlocks(req, res) {
        try {
            const blocks = abuseGuardService.listBlocks();
            res.json({
                blocks,
                count: blocks.length,
                settings: abuseGuardService.getSettings()
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    /**
     * Remove a temporary abuse-guard block
     */
    async removeSecurityBlock(req, res) {
        try {
            const { ip } = req.params;
            const removed = abuseGuardService.unblockIp(ip);

            await auditLogService.createAuditLog({
                action: 'security_block.remove',
                adminKeyHash: req.admin.keyHash,
                ipAddress: req.admin.ip,
                userAgent: req.headers['user-agent'],
                details: { blockedIp: ip, removed },
                success: true
            });

            res.json({
                success: true,
                removed,
                ip
            });
        } catch (error) {
            await auditLogService.logFailedOperation(
                'security_block.remove',
                req.admin.keyHash,
                req.admin.ip,
                req.headers['user-agent'],
                error
            );
            res.status(500).json({ error: error.message });
        }
    },

    // ==================== SYSTEM MANAGEMENT ====================

    /**
     * Get system metrics (JSON)
     */
    async getMetrics(req, res) {
        try {
            const metrics = metricsService.getJsonMetrics();
            res.json(metrics);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    /**
     * Get system metrics (Prometheus)
     */
    async getPrometheusMetrics(req, res) {
        try {
            const metrics = metricsService.getPrometheusMetrics();
            res.type('text/plain').send(metrics);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    /**
     * Reset metrics
     */
    async resetMetrics(req, res) {
        try {
            metricsService.resetMetrics();

            await auditLogService.logAdminOperation(
                'reset_metrics',
                req.admin.keyHash,
                req.admin.ip,
                req.headers['user-agent'],
                {}
            );

            res.json({ message: 'Metrics reset successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    /**
     * Get log level
     */
    async getLogLevel(req, res) {
        try {
            const levelInfo = getLogLevel();
            res.json(levelInfo);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    /**
     * Set log level
     */
    async setLogLevel(req, res) {
        try {
            const { level } = req.body;

            if (!level) {
                return res.status(400).json({ error: 'level is required' });
            }

            const result = setLogLevel(level);

            if (!result.success) {
                return res.status(400).json(result);
            }

            // Audit log
            await auditLogService.logAdminOperation(
                'change_log_level',
                req.admin.keyHash,
                req.admin.ip,
                req.headers['user-agent'],
                { newLevel: level }
            );

            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    /**
     * Get provider timeouts
     */
    async getProviderTimeouts(req, res) {
        try {
            res.json({
                timeouts: config.providerTimeouts,
                note: 'Values in milliseconds. Configure via ENV: <PROVIDER>_TIMEOUT_MS'
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
};

module.exports = AdminController;
