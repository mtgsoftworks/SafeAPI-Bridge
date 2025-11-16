const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const AnalyticsService = require('../services/analytics');

/**
 * Analytics Routes
 * Provides usage statistics and insights
 */

/**
 * GET /analytics/overview
 * Get overall system statistics
 */
router.get('/overview', authenticateToken, async (req, res) => {
  try {
    // Restrict system-wide overview to admin key
    const adminKey = req.headers['x-admin-key'];
    if (!adminKey || adminKey !== process.env.ADMIN_API_KEY) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Admin key required for overview analytics'
      });
    }
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;

    const stats = await AnalyticsService.getOverview(start, end);

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /analytics/user/:userId
 * Get user-specific analytics
 */
router.get('/user/:userId', authenticateToken, async (req, res) => {
  try {
    // Users can only view their own stats (unless valid admin key)
    const adminKey = req.headers['x-admin-key'];
    const isAdmin = !!adminKey && adminKey === process.env.ADMIN_API_KEY;
    if (req.user.userId !== req.params.userId && !isAdmin) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only view your own statistics'
      });
    }

    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;

    const analytics = await AnalyticsService.getUserAnalytics(req.params.userId, start, end);

    res.json(analytics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /analytics/costs
 * Get cost breakdown by API
 */
router.get('/costs', authenticateToken, async (req, res) => {
  try {
    // Admin-only endpoint
    const adminKey = req.headers['x-admin-key'];
    if (!adminKey || adminKey !== process.env.ADMIN_API_KEY) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Admin key required for cost analytics'
      });
    }
    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;

    const costs = await AnalyticsService.getCostBreakdown(start, end);

    res.json(costs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /analytics/errors
 * Get error statistics
 */
router.get('/errors', authenticateToken, async (req, res) => {
  try {
    // Admin-only endpoint
    const adminKey = req.headers['x-admin-key'];
    if (!adminKey || adminKey !== process.env.ADMIN_API_KEY) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Admin key required for error analytics'
      });
    }
    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;

    const errorStats = await AnalyticsService.getErrorStats(start, end);

    res.json(errorStats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /analytics/my-stats
 * Get current user's own statistics
 */
router.get('/my-stats', authenticateToken, async (req, res) => {
  try {
    const analytics = await AnalyticsService.getUserAnalytics(req.user.userId);
    res.json(analytics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
