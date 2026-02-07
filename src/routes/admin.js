const express = require('express');
const router = express.Router();
const AdminController = require('../controllers/admin');
const { adminAuth, adminLimiter } = require('../middleware/adminAuth');

/**
 * Admin Routes
 * Manage users, IP rules, webhooks, audit logs
 * 
 * Logic delegated to AdminController
 */

// Apply admin rate limiter to all admin routes
router.use(adminLimiter);

// ==================== USER MANAGEMENT ====================
router.get('/users', adminAuth, AdminController.listUsers);
router.get('/users/:userId', adminAuth, AdminController.getUser);
router.post('/users', adminAuth, AdminController.createUser);
router.put('/users/:userId/quota', adminAuth, AdminController.updateUserQuota);
router.delete('/users/:userId', adminAuth, AdminController.deleteUser);

// ==================== IP RULES ====================
router.get('/ip-rules', adminAuth, AdminController.listIpRules);
router.post('/ip-rules', adminAuth, AdminController.addIpRule);
router.delete('/ip-rules/:ip', adminAuth, AdminController.removeIpRule);

// ==================== WEBHOOKS ====================
router.get('/webhooks', adminAuth, AdminController.listWebhooks);
router.post('/webhooks', adminAuth, AdminController.createWebhook);
router.post('/webhooks/:id/test', adminAuth, AdminController.testWebhook);
router.delete('/webhooks/:id', adminAuth, AdminController.deleteWebhook);

// ==================== AUDIT LOGS ====================
router.get('/audit-logs', adminAuth, AdminController.getAuditLogs);
router.get('/audit-logs/stats', adminAuth, AdminController.getAuditStats);
router.get('/audit-logs/failed', adminAuth, AdminController.getFailedOperations);

// ==================== SYSTEM MANAGEMENT ====================
router.get('/metrics', adminAuth, AdminController.getMetrics);
router.get('/metrics/prometheus', adminAuth, AdminController.getPrometheusMetrics);
router.post('/metrics/reset', adminAuth, AdminController.resetMetrics);

router.get('/log-level', adminAuth, AdminController.getLogLevel);
router.put('/log-level', adminAuth, AdminController.setLogLevel);

router.get('/provider-timeouts', adminAuth, AdminController.getProviderTimeouts);

module.exports = router;
