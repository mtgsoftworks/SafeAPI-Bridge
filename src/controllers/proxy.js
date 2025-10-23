const axios = require('axios');
const config = require('../config/env');
const { isEndpointAllowed, apiHeaders } = require('../config/apis');
const { handleProxyError } = require('../utils/errorHandler');
const { validateEndpoint, sanitizeBody } = require('../utils/validator');
const UsageTrackingService = require('../services/usage');
const webhookService = require('../services/webhook');

/**
 * Main Proxy Controller
 * Forwards requests to external AI APIs while hiding API keys
 * Now with usage tracking and analytics
 */

/**
 * Forward request to the target API
 */
const proxyRequest = async (req, res) => {
  const startTime = Date.now();

  try {
    const { api } = req.params;
    const endpoint = req.body.endpoint || req.query.endpoint;
    const requestData = sanitizeBody(req.body);

    // Get user from middleware (set by auth + quota check)
    const userId = req.user.userId;

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

    // Get API configuration
    const apiConfig = config[api];
    if (!apiConfig || !apiConfig.apiKey) {
      return res.status(503).json({
        error: 'Service Not Available',
        message: `${api.toUpperCase()} API is not configured. Please add the API key to .env file`,
        api
      });
    }

    // Build request URL
    let targetUrl = `${apiConfig.baseUrl}${endpoint}`;

    // Special handling for Gemini (API key in query parameter)
    if (api === 'gemini') {
      const separator = targetUrl.includes('?') ? '&' : '?';
      targetUrl = `${targetUrl}${separator}key=${apiConfig.apiKey}`;
    }

    // Prepare headers
    const headers = apiHeaders[api](apiConfig.apiKey);

    // Log the proxied request
    console.log(`🔄 Proxying ${req.method} request to ${api.toUpperCase()}: ${endpoint}`);

    // Make the request to external API
    const response = await axios({
      method: req.method,
      url: targetUrl,
      data: requestData,
      headers: {
        ...headers,
        // Forward some client headers
        ...(req.headers['user-agent'] && { 'User-Agent': req.headers['user-agent'] })
      },
      timeout: 60000, // 60 seconds timeout
      validateStatus: (status) => status < 600 // Don't throw on 4xx/5xx
    });

    const responseTime = Date.now() - startTime;
    const success = response.status >= 200 && response.status < 400;

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
      responseData: response.data
    }).catch(err => console.error('Usage tracking error:', err));

    // Forward the response
    res.status(response.status).json(response.data);

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

  res.json({
    api: api.toUpperCase(),
    configured: isConfigured,
    baseUrl: apiConfig?.baseUrl || 'Not configured',
    allowedEndpoints: allowedEndpoints[api],
    message: isConfigured
      ? 'API is configured and ready to use'
      : 'API key not configured. Add it to .env file to use this API'
  });
};

/**
 * Health check for all configured APIs
 */
const healthCheck = (req, res) => {
  const apis = ['openai', 'gemini', 'claude', 'groq', 'mistral'];
  const status = {};

  apis.forEach(api => {
    const apiConfig = config[api];
    status[api] = {
      configured: !!(apiConfig && apiConfig.apiKey),
      baseUrl: apiConfig?.baseUrl || 'Not configured'
    };
  });

  const configuredCount = Object.values(status).filter(s => s.configured).length;

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    apis: status,
    summary: `${configuredCount}/${apis.length} APIs configured`
  });
};

module.exports = {
  proxyRequest,
  getAvailableEndpoints,
  healthCheck
};
