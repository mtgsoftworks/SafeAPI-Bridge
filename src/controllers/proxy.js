const config = require('../config/env');
const { isEndpointAllowed, SUPPORTED_APIS } = require('../config/apis');
const { handleProxyError } = require('../utils/errorHandler');
const { validateEndpoint, sanitizeBody } = require('../utils/validator');
const UsageTrackingService = require('../services/usage');
const KeyResolutionService = require('../services/keyResolution');
const ApiForwardingService = require('../services/apiForwarding');
const webhookService = require('../services/webhook');
const { requestQueue } = require('../services/requestQueue');
const { logger } = require('../utils/securityLogger');
const prisma = require('../db/client');
const { timingSafeCompare } = require('../middleware/adminAuth');

/**
 * Main Proxy Controller
 * Forwards requests to external AI APIs while hiding API keys
 * Supports both Server Key and BYOK Split Key methods
 * Refactored to use separate services for better SRP compliance
 */

/**
 * Forward request to the target API
 * Supports both Server Key and BYOK Split Key methods
 */
const proxyRequest = async (req, res) => {
  const startTime = Date.now();

  try {
    const { api } = req.params;
    const isGet = req.method === 'GET';
    const endpoint = (req.body && req.body.endpoint) || req.query.endpoint;
    const requestData = sanitizeBody(req.body || {});
    const isLightMode = process.env.LIGHT_MODE === 'true';

    // Get user from middleware (set by auth + quota check)
    const userId = req.user.userId;
    const authMethod = req.authMethod || 'SERVER_KEY';
    const ip = req.clientIp || req.ip || 'unknown';

    // Remove endpoint from body if it exists
    delete requestData.endpoint;

    // Validate endpoint format
    const validation = validateEndpoint(endpoint);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Invalid endpoint',
        message: validation.error
      });
    }

    // Check if endpoint is allowed
    if (!isEndpointAllowed(api, endpoint)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Endpoint '${endpoint}' is not allowed for ${api.toUpperCase()} API`,
        api
      });
    }

    // Resolve API key using KeyResolutionService
    const keyResult = await KeyResolutionService.resolveApiKey({
      api,
      headers: req.headers,
      userId,
      ip
    });

    if (!keyResult.success) {
      return res.status(keyResult.status).json({
        error: keyResult.error,
        message: keyResult.message,
        api,
        authMethod
      });
    }

    const { apiKey, keySource, keyId } = keyResult;

    // Build target URL
    const targetUrl = KeyResolutionService.buildTargetUrl(api, endpoint, apiKey);

    // Log the proxied request
    logger.info('Proxying request', {
      api,
      endpoint,
      method: req.method,
      keySource,
      userId,
      keyId: keyId || null
    });

    // Check if streaming is requested
    const wantsStream = ApiForwardingService.isStreamRequested(req.headers, requestData);

    // Prepare query params for GET requests
    let queryParams = null;
    if (isGet) {
      const { endpoint: _ep, ...queryRest } = req.query || {};
      queryParams = queryRest;
    }

    // Forward request using ApiForwardingService
    const { response, responseTime, success } = await ApiForwardingService.forwardRequest({
      api,
      targetUrl,
      method: req.method,
      apiKey,
      requestData: isGet ? null : requestData,
      headers: req.headers,
      wantsStream,
      isLightMode,
      queryParams
    });

    // Handle streaming response
    if (wantsStream && ApiForwardingService.isStreamableResponse(response)) {
      // Track usage asynchronously (without token count for streams)
      trackUsageAsync({
        userId,
        api,
        endpoint,
        method: req.method,
        statusCode: response.status,
        success,
        responseTime,
        req,
        responseData: null,
        keySource,
        keyId
      });

      ApiForwardingService.sendStreamResponse(res, response);
    } else {
      // Track usage asynchronously
      trackUsageAsync({
        userId,
        api,
        endpoint,
        method: req.method,
        statusCode: response.status,
        success,
        responseTime,
        req,
        responseData: response.data,
        keySource,
        keyId
      });

      // Build response object for stream usage (if applicable)
      const streamResponseData = {
        usage: {
          total_tokens: (response.usageData?.estimatedTokens || 0),
          completion_tokens: (response.usageData?.estimatedTokens || 0),
          prompt_tokens: 0
        }
      };

      // Handle streaming response
      if (wantsStream && response.data && response.data.pipe) {
        // Set headers for SSE/Stream
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Pipe
        response.data.pipe(res);

        // Track usage on end
        response.data.on('end', () => {
          setImmediate(() => {
            UsageTrackingService.trackRequest({
              userId: req.user.userId,
              api,
              endpoint,
              method: req.method,
              statusCode: response.status,
              success: true,
              responseTime,
              req,
              responseData: streamResponseData,
              keySource,
              keyId
            }).catch(err => logger.error('Stream usage tracking error', { error: err.message }));
          });
        });
        return;
      }

      // Normal response tracking
      if (keySource) {
        trackUsageAsync({
          userId: req.user.userId,
          api,
          endpoint,
          method: req.method,
          statusCode: response.status,
          success,
          responseTime,
          req,
          responseData: response.data,
          keySource,
          keyId
        });
      }

      // Forward the response
      res.status(response.status).json(response.data);
    }
  } catch (error) {
    handleProxyError(error, req, res, startTime);
  }
};

/**
 * Track usage asynchronously (fire and forget)
 * @private
 */
const trackUsageAsync = ({ userId, api, endpoint, method, statusCode, success, responseTime, req, responseData, keySource, keyId }) => {
  setImmediate(() => {
    UsageTrackingService.trackRequest({
      userId,
      api,
      endpoint,
      method,
      statusCode,
      success,
      responseTime,
      req,
      responseData,
      metadata: {
        authMethod: keySource === 'BYOK_SPLIT_KEY' ? 'BYOK_SPLIT_KEY' : 'SERVER_KEY',
        keySource,
        ...(keyId && { keyId })
      }
    }).catch(err => logger.error('Usage tracking error', { error: err.message }));
  });
};

/**
 * Handle proxy errors
 * @private
 */
const handleProxyErrorInternal = (error, req, res, startTime) => {
  const responseTime = Date.now() - startTime;
  const errorResponse = handleProxyError(error, req.params.api);

  // Track failed request asynchronously
  if (req.user && req.user.userId) {
    setImmediate(() => {
      UsageTrackingService.trackRequest({
        userId: req.user.userId,
        api: req.params.api,
        endpoint: req.body?.endpoint || req.query?.endpoint || '/unknown',
        method: req.method,
        statusCode: errorResponse.status,
        success: false,
        responseTime,
        req
      }).catch(err => logger.error('Usage tracking error', { error: err.message }));
    });

    // Trigger error webhook
    webhookService.trigger('api.error', {
      userId: req.user.userId,
      api: req.params.api,
      endpoint: req.body?.endpoint,
      error: errorResponse.message,
      statusCode: errorResponse.status
    }).catch(err => logger.error('Webhook error', { error: err.message }));
  }

  res.status(errorResponse.status).json(errorResponse);
};

/**
 * Get available endpoints for a specific API
 */
const getAvailableEndpoints = (req, res) => {
  const { api } = req.params;
  const { allowedEndpoints } = require('../config/apis');

  if (!allowedEndpoints[api]) {
    return res.status(404).json({
      error: 'API not found',
      message: `API '${api}' is not supported`,
      availableApis: Object.keys(allowedEndpoints)
    });
  }

  const apiConfig = config[api];
  const isConfigured = apiConfig && apiConfig.apiKey;

  // Never leak API keys: ensure boolean for configured
  res.json({
    api: api.toUpperCase(),
    configured: Boolean(isConfigured),
    baseUrl: apiConfig?.baseUrl || 'Not configured',
    allowedEndpoints: allowedEndpoints[api],
    message: isConfigured
      ? 'API is configured and ready to use'
      : 'API key not configured. Add it to .env file to use this API'
  });
};

/**
 * Check if request has valid admin authentication
 * @private
 */
const isAdminAuthenticated = (req) => {
  const adminKey = req.headers['x-admin-key'];
  const expectedKey = process.env.ADMIN_API_KEY;
  if (!adminKey || !expectedKey) return false;
  return timingSafeCompare(adminKey, expectedKey);
};

/**
 * Health check for all configured APIs + infrastructure
 * Tests database connectivity
 * Returns minimal info for unauthenticated users, detailed info for admins
 */
const healthCheck = async (req, res) => {
  const isAdmin = isAdminAuthenticated(req);

  // Use centralized API list from config
  const apis = SUPPORTED_APIS;

  // Light mode: keep health check extremely cheap and always HTTP 200
  if (process.env.LIGHT_MODE === 'true') {
    // Minimal response for non-admin users
    if (!isAdmin) {
      return res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString()
      });
    }

    const status = {};
    apis.forEach(api => {
      const apiConfig = config[api];
      status[api] = {
        configured: !!(apiConfig && apiConfig.apiKey),
        baseUrl: apiConfig?.baseUrl || 'Not configured'
      };
    });

    return res.status(200).json({
      status: 'healthy',
      mode: 'light',
      timestamp: new Date().toISOString(),
      apis: status,
      infrastructure: {
        database: { status: 'skipped', latency: 'N/A' }
      },
      summary: `${Object.values(status).filter(s => s.configured).length}/${apis.length} APIs configured`
    });
  }

  const status = {};

  apis.forEach(api => {
    const apiConfig = config[api];
    status[api] = {
      configured: !!(apiConfig && apiConfig.apiKey),
      baseUrl: apiConfig?.baseUrl || 'Not configured'
    };
  });

  const configuredCount = Object.values(status).filter(s => s.configured).length;

  // Test database connectivity
  let dbStatus = 'unknown';
  let dbLatency = 0;
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbLatency = Date.now() - start;
    dbStatus = 'connected';
  } catch (error) {
    dbStatus = 'error';
    logger.error('Database health check failed', { error: error.message });
  }

  // Overall health status
  const isHealthy = dbStatus === 'connected';
  const overallStatus = isHealthy ? 'healthy' : 'degraded';

  // Minimal response for non-admin users (hide infrastructure details)
  if (!isAdmin) {
    return res.status(isHealthy ? 200 : 503).json({
      status: overallStatus,
      timestamp: new Date().toISOString()
    });
  }

  // Get queue stats (only for admin)
  let queueStats = null;
  try {
    queueStats = await requestQueue.getStats();
  } catch (error) {
    logger.error('Queue health check failed', { error: error.message });
  }

  // Detailed response for admin users
  res.status(isHealthy ? 200 : 503).json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    apis: status,
    infrastructure: {
      database: {
        status: dbStatus,
        latency: `${dbLatency}ms`
      },
      queue: queueStats ? {
        type: queueStats.type,
        status: 'connected',
        waiting: queueStats.waiting,
        active: queueStats.active,
        completed: queueStats.completed,
        failed: queueStats.failed
      } : {
        status: 'unavailable'
      }
    },
    summary: `${configuredCount}/${apis.length} APIs configured`
  });
};

module.exports = {
  proxyRequest,
  getAvailableEndpoints,
  healthCheck
};
