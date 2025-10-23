const cacheService = require('../services/cache');

/**
 * Cache Middleware
 * Caches GET requests and POST responses
 */

const cacheMiddleware = async (req, res, next) => {
  const { api } = req.params;
  const userId = req.user?.userId || 'anonymous';

  // Determine endpoint and payload depending on method
  const isGet = req.method === 'GET';
  const endpoint = isGet ? (req.query?.endpoint || null) : (req.body?.endpoint || null);

  // Only cache when endpoint is provided
  if (!endpoint) {
    return next();
  }

  // For GET cache, include query minus endpoint; for others, include body minus endpoint
  const payload = isGet
    ? Object.fromEntries(Object.entries(req.query || {}).filter(([k]) => k !== 'endpoint'))
    : Object.fromEntries(Object.entries(req.body || {}).filter(([k]) => k !== 'endpoint'));

  // Generate cache key (scoped by user and method)
  const cacheKey = cacheService.generateKey({ api, endpoint, payload, userId, method: req.method });

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
