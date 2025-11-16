const IpRuleModel = require('../models/IpRule');

/**
 * IP Whitelist/Blacklist Middleware
 * Checks if requesting IP is allowed
 */

const ipCheck = async (req, res, next) => {
  try {
    // Prefer Express-calculated IP (respects trust proxy)
    const xff = req.headers['x-forwarded-for'];
    const forwardedIp = Array.isArray(xff)
      ? xff[0]
      : (typeof xff === 'string' ? xff.split(',')[0].trim() : null);
    const rawIp = req.ip || forwardedIp || req.socket?.remoteAddress || req.connection?.remoteAddress || '';

    // Clean IP (remove ::ffff: prefix for IPv4)
    const cleanIp = (rawIp || '').replace('::ffff:', '');

    if (!cleanIp) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Unable to determine client IP'
      });
    }

    // Check if IP is allowed
    const { allowed, reason } = await IpRuleModel.isAllowed(cleanIp);

    if (!allowed) {
      return res.status(403).json({
        error: 'Forbidden',
        message: reason || 'Your IP address is not allowed to access this service',
        ip: cleanIp
      });
    }

    // Attach IP to request for logging
    req.clientIp = cleanIp;

    next();
  } catch (error) {
    console.error('IP check error:', error);
    // Fail-closed on error for stricter security
    return res.status(503).json({
      error: 'Service Unavailable',
      message: 'IP verification failed. Please try again later.'
    });
  }
};

module.exports = ipCheck;
