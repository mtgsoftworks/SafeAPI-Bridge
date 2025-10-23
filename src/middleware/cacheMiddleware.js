const cacheService = require('../services/cache');

/**
 * Cache Middleware
 * Caches GET requests and POST responses
 */

const cacheMiddleware = async (req, res, next) => {
  // Only cache specific endpoints
  if (!req.body.endpoint) {
    return next();
  }

  const { api } = req.params;
  const { endpoint, ...body } = req.body;

  // Generate cache key
  const cacheKey = cacheService.generateKey(api, endpoint, body);

  try {
    // Try to get from cache
    const cached = await cacheService.get(cacheKey);

    if (cached) {
      console.log(`🎯 Cache HIT: ${cacheKey}`);
      return res.json(cached);
    }

    console.log(`❌ Cache MISS: ${cacheKey}`);

    // Store original send function
    const originalSend = res.json.bind(res);

    // Override res.json to cache the response
    res.json = function (data) {
      // Only cache successful responses
      if (res.statusCode === 200) {
        cacheService.set(cacheKey, data, 300); // 5 minutes TTL
      }

      return originalSend(data);
    };

    next();
  } catch (error) {
    console.error('Cache middleware error:', error);
    next();
  }
};

module.exports = cacheMiddleware;
