const axios = require('axios');
const config = require('../config/env');
const { isEndpointAllowed, apiHeaders } = require('../config/apis');
const { handleProxyError } = require('../utils/errorHandler');
const { validateEndpoint, sanitizeBody } = require('../utils/validator');
const UsageTrackingService = require('../services/usage');
const webhookService = require('../services/webhook');
const { logSecurityEvent } = require('../utils/securityLogger');
const prisma = require('../db/client');
const { decryptKey } = require('../utils/crypto');

/**
 * Main Proxy Controller
 * Forwards requests to external AI APIs while hiding API keys
 * Supports both Server Key and BYOK Split Key methods
 * Now with usage tracking and analytics
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

    // Get user from middleware (set by auth + quota check)
    const userId = req.user.userId;
    const authMethod = req.authMethod || 'SERVER_KEY';

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

    // Determine API key based on headers (BYOK Split Key) or server config
    let apiKey;
    let keySource;

    const partialKeyId = req.headers['x-partial-key-id'];
    const clientPart = req.headers['x-partial-key'];

    if (partialKeyId && clientPart) {
      // Method B: BYOK Split Key using database + crypto
      try {
        const splitKeyRecord = await prisma.splitKey.findUnique({
          where: { keyId: partialKeyId }
        });

        if (!splitKeyRecord || !splitKeyRecord.active) {
          return res.status(401).json({
            error: 'Invalid X-Partial-Key-Id',
            message: 'Split key not found or inactive'
          });
        }

        if (splitKeyRecord.clientPart !== clientPart) {
          return res.status(401).json({
            error: 'Invalid Split Key',
            message: 'Invalid X-Partial-Key or X-Partial-Key-Id combination'
          });
        }

        try {
          apiKey = decryptKey(
            splitKeyRecord.serverPart,
            splitKeyRecord.decryptionSecret,
            splitKeyRecord.apiProvider,
            clientPart
          );
        } catch (decryptError) {
          console.error('Failed to decrypt API key:', decryptError);
          return res.status(401).json({
            error: 'Failed to decrypt API key',
            message: 'Unable to reconstruct API key from split parts'
          });
        }

        keySource = 'BYOK_SPLIT_KEY';

        // Log successful BYOK usage
        logSecurityEvent('byok_key_used', userId, req.ip, {
          api,
          endpoint,
          keyId: splitKeyRecord.keyId
        });
      } catch (dbError) {
        console.error('Split key lookup error:', dbError);
        return res.status(500).json({
          error: 'Split Key Lookup Failed',
          message: 'Unable to validate split key'
        });
      }
    } else {
      // Method A: Server Key from configuration / .env
      const apiConfig = config[api];
      if (!apiConfig || !apiConfig.apiKey) {
        return res.status(503).json({
          error: 'Service Not Available',
          message: `${api.toUpperCase()} API is not configured. Please add the API key to .env file`,
          api,
          authMethod: 'SERVER_KEY'
        });
      }
      apiKey = apiConfig.apiKey;
      keySource = 'SERVER_KEY';
    }

    // Build request URL
    let targetUrl = `${config[api].baseUrl}${endpoint}`;

    // Special handling for Gemini (API key in query parameter)
    if (api === 'gemini') {
      const separator = targetUrl.includes('?') ? '&' : '?';
      targetUrl = `${targetUrl}${separator}key=${apiKey}`;
    }

    // Prepare headers
    const headers = apiHeaders[api](apiKey);

    // Log the proxied request with authentication method
    console.log(`🔄 Proxying ${req.method} request to ${api.toUpperCase()}: ${endpoint} (${keySource})`);

    if (authMethod === 'BYOK_SPLIT_KEY') {
      console.log(`🔐 BYOK Mode: Using split key ${req.splitKey?.keyId} for user ${userId}`);
    }

    // Determine streaming
    const acceptHeader = req.headers['accept'] || '';
    const wantsStream = acceptHeader.includes('text/event-stream') || requestData.stream === true;

    // Prepare axios config
    const timeoutMs = parseInt(process.env.UPSTREAM_TIMEOUT_MS || '0') || (process.env.LIGHT_MODE === 'true' ? 30000 : 60000);
    const axiosConfig = {
      method: req.method,
      url: targetUrl,
      headers: {
        ...headers,
        ...(req.headers['user-agent'] && { 'User-Agent': req.headers['user-agent'] })
      },
      timeout: timeoutMs,
      validateStatus: (status) => status < 600,
      ...(wantsStream && { responseType: 'stream' })
    };

    // For GET requests, pass remaining query params through (excluding endpoint)
    if (isGet) {
      const { endpoint: _ep, ...queryRest } = req.query || {};
      // For Gemini, API key already appended; include other query params
      axiosConfig.params = queryRest;
    } else {
      axiosConfig.data = requestData;
    }

    // Make the request to external API
    const response = await axios(axiosConfig);

    const responseTime = Date.now() - startTime;
    const success = response.status >= 200 && response.status < 400;

    if (wantsStream && response.data && typeof response.data.pipe === 'function') {
      // Forward streaming response
      res.status(response.status);
      // Ensure SSE headers if upstream didn't set properly
      if (!res.getHeader('Content-Type')) {
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      }
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Track usage without tokens (unknown for stream)
      UsageTrackingService.trackRequest({
        userId,
        api,
        endpoint,
        method: req.method,
        statusCode: response.status,
        success,
        responseTime,
        req,
        responseData: null,
        metadata: {
          authMethod,
          keySource,
          ...(authMethod === 'BYOK_SPLIT_KEY' && { keyId: req.splitKey?.keyId })
        }
      }).catch(err => console.error('Usage tracking error:', err));

      response.data.pipe(res);
    } else {
      // Track usage (async, don't wait)
      UsageTrackingService.trackRequest({
        userId,
        api,
        endpoint,
        method: req.method,
        statusCode: response.status,
        success,
        responseTime,
        req,
        responseData: response.data,
        metadata: {
          authMethod,
          keySource,
          ...(authMethod === 'BYOK_SPLIT_KEY' && { keyId: req.splitKey?.keyId })
        }
      }).catch(err => console.error('Usage tracking error:', err));

      // Forward the response
      res.status(response.status).json(response.data);
    }

  } catch (error) {
    const responseTime = Date.now() - startTime;
    const errorResponse = handleProxyError(error, req.params.api);

    // Track failed request
    if (req.user && req.user.userId) {
      UsageTrackingService.trackRequest({
        userId: req.user.userId,
        api: req.params.api,
        endpoint: req.body.endpoint || req.query.endpoint || '/unknown',
        method: req.method,
        statusCode: errorResponse.status,
        success: false,
        responseTime,
        req
      }).catch(err => console.error('Usage tracking error:', err));

      // Trigger error webhook
      webhookService.trigger('api.error', {
        userId: req.user.userId,
        api: req.params.api,
        endpoint: req.body.endpoint,
        error: errorResponse.message,
        statusCode: errorResponse.status
      }).catch(err => console.error('Webhook error:', err));
    }

    res.status(errorResponse.status).json(errorResponse);
  }
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
 * Health check for all configured APIs + infrastructure
 * Tests database connectivity
 */
const healthCheck = async (req, res) => {
  // Light mode: keep health check extremely cheap and always HTTP 200
  if (process.env.LIGHT_MODE === 'true') {
    const apis = [
      'openai',
      'gemini',
      'claude',
      'groq',
      'mistral',
      'zai',
      'deepseek',
      'perplexity',
      'together',
      'openrouter',
      'fireworks',
      'github',
      'replicate',
      'stability',
      'fal',
      'elevenlabs',
      'brave',
      'deepl',
      'openmeteo'
    ];
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

  const apis = [
    'openai',
    'gemini',
    'claude',
    'groq',
    'mistral',
    'zai',
    'deepseek',
    'perplexity',
    'together',
    'openrouter',
    'fireworks',
    'github',
    'replicate',
    'stability',
    'fal',
    'elevenlabs',
    'brave',
    'deepl',
    'openmeteo'
  ];
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
    const prisma = require('../db/client');
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbLatency = Date.now() - start;
    dbStatus = 'connected';
  } catch (error) {
    dbStatus = 'error';
    console.error('Database health check failed:', error.message);
  }

  // Overall health status
  const isHealthy = dbStatus === 'connected';
  const overallStatus = isHealthy ? 'healthy' : 'degraded';

  res.status(isHealthy ? 200 : 503).json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    apis: status,
    infrastructure: {
      database: {
        status: dbStatus,
        latency: `${dbLatency}ms`
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
