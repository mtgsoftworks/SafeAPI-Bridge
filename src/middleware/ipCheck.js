const IpRuleModel = require('../models/IpRule');

/**
 * IP Whitelist/Blacklist Middleware
 * Checks if requesting IP is allowed
 */

const ipCheck = async (req, res, next) => {
  try {
    // Get client IP
    const clientIp = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'];

    // Clean IP (remove ::ffff: prefix for IPv4)
    const cleanIp = clientIp.replace('::ffff:', '');

    // Check if IP is allowed
    const { allowed, reason, rule } = await IpRuleModel.isAllowed(cleanIp);

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
    // On error, allow by default (fail-open)
    next();
  }
};

module.exports = ipCheck;
