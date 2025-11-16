/**
 * HTTPS Enforcement Middleware
 * Redirects HTTP requests to HTTPS in production
 * Improves security by ensuring encrypted connections
 */

const { logger } = require('../utils/securityLogger');

const httpsEnforcement = (req, res, next) => {
  // Only enforce HTTPS in production
  if (process.env.NODE_ENV !== 'production') {
    return next();
  }

  // Check if request is already HTTPS
  const isHttps =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    req.headers['x-forwarded-ssl'] === 'on';

  if (!isHttps) {
    // Log the redirect for monitoring
    logger.log('security', 'HTTP → HTTPS redirect', {
      ip: req.ip,
      path: req.path,
      userAgent: req.headers['user-agent']
    });

    // Redirect to HTTPS
    const httpsUrl = `https://${req.headers.host}${req.url}`;
    return res.redirect(301, httpsUrl);
  }

  next();
};

module.exports = httpsEnforcement;
