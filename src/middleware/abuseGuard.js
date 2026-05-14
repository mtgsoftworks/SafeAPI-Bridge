const abuseGuardService = require('../services/abuseGuard');

/**
 * Blocks common unauthenticated scanner probes before they reach parsers/routes.
 */
const abuseGuard = (req, res, next) => {
  const decision = abuseGuardService.checkRequest(req);
  req.abuseGuard = decision.analysis;

  if (decision.action !== 'block') {
    return next();
  }

  res.setHeader('Cache-Control', 'no-store');

  if (decision.status === 404) {
    return res.status(404).end();
  }

  return res.status(429).json({
    error: 'Too Many Requests',
    message: 'Request temporarily blocked'
  });
};

module.exports = abuseGuard;
