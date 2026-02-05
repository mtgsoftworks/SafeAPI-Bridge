const axios = require('axios');
const { apiHeaders } = require('../config/apis');
const { PERFORMANCE } = require('../config/constants');
const { logger } = require('../utils/securityLogger');
const { RetryService, RetryStrategy } = require('./retryService');

/**
 * API Forwarding Service
 * Handles forwarding requests to external AI APIs with retry support
 * Single Responsibility: Make HTTP requests to external APIs
 */

class ApiForwardingService {
  // Circuit breaker state per API provider
  static circuitStates = new Map();

  /**
   * Get or create circuit state for an API
   * @private
   */
  static getCircuitState(api) {
    if (!this.circuitStates.has(api)) {
      this.circuitStates.set(api, {
        failures: 0,
        lastFailure: 0,
        isOpen: false
      });
    }
    return this.circuitStates.get(api);
  }

  /**
   * Forward request to external API with retry support
   * @param {Object} options - Forwarding options
   * @param {string} options.api - API provider name
   * @param {string} options.targetUrl - Target URL
   * @param {string} options.method - HTTP method
   * @param {string} options.apiKey - API key
   * @param {Object} options.requestData - Request body data
   * @param {Object} options.headers - Original request headers
   * @param {boolean} options.wantsStream - Whether client wants streaming response
   * @param {boolean} options.isLightMode - Whether light mode is enabled
   * @param {boolean} options.enableRetry - Whether to enable retry (default: true)
   * @returns {Promise<Object>} Axios response
   */
  static async forwardRequest({
    api,
    targetUrl,
    method,
    apiKey,
    requestData,
    headers,
    wantsStream,
    isLightMode,
    queryParams,
    enableRetry = true
  }) {
    const circuitState = this.getCircuitState(api);
    const startTime = Date.now();

    // Build request config
    const buildRequest = () => {
      const timeoutMs = this.getTimeout(isLightMode);
      const requestHeaders = this.buildHeaders(api, apiKey, headers);

      const axiosConfig = {
        method,
        url: targetUrl,
        headers: requestHeaders,
        timeout: timeoutMs,
        validateStatus: (status) => status < 600,
        ...(wantsStream && { responseType: 'stream' })
      };

      if (method === 'GET') {
        axiosConfig.params = queryParams || {};
      } else {
        axiosConfig.data = requestData;
      }

      return axiosConfig;
    };

    // Execute with or without retry
    const executeRequest = async (attempt = 1) => {
      const axiosConfig = buildRequest();

      if (attempt > 1) {
        logger.info('Retry attempt for API request', {
          api,
          url: targetUrl,
          attempt
        });
      }

      const response = await axios(axiosConfig);
      return response;
    };

    try {
      let response;

      if (enableRetry && !wantsStream) {
        // Use retry with circuit breaker for non-streaming requests
        response = await RetryService.executeWithCircuitBreaker(
          executeRequest,
          {
            maxAttempts: parseInt(process.env.API_RETRY_ATTEMPTS || '3'),
            delayMs: parseInt(process.env.API_RETRY_DELAY_MS || '1000'),
            strategy: RetryStrategy.EXPONENTIAL,
            circuitState,
            failureThreshold: 5,
            resetTimeout: 30000,
            context: { api, url: targetUrl },
            onRetry: (error, attempt, delay) => {
              logger.warn('API request retry', {
                api,
                url: targetUrl,
                attempt,
                delay,
                error: error.message
              });
            }
          }
        );
      } else {
        // Direct request for streaming or when retry is disabled
        response = await executeRequest();
      }

      const responseTime = Date.now() - startTime;

      return {
        response,
        responseTime,
        success: response.status >= 200 && response.status < 400,
        retried: false
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;

      logger.error('API forward request failed', {
        api,
        url: targetUrl,
        error: error.message,
        responseTime
      });

      throw error;
    }
  }

  /**
   * Get timeout based on mode
   * @private
   */
  static getTimeout(isLightMode) {
    const envTimeout = parseInt(process.env.UPSTREAM_TIMEOUT_MS || '0');
    if (envTimeout > 0) {
      return envTimeout;
    }
    return isLightMode
      ? PERFORMANCE.LIGHT_MODE_TIMEOUT_MS
      : PERFORMANCE.NORMAL_MODE_TIMEOUT_MS;
  }

  /**
   * Build request headers for external API
   * @private
   */
  static buildHeaders(api, apiKey, originalHeaders) {
    const baseHeaders = apiHeaders[api](apiKey);

    return {
      ...baseHeaders,
      ...(originalHeaders['user-agent'] && { 'User-Agent': originalHeaders['user-agent'] })
    };
  }

  /**
   * Check if response should be streamed
   * @param {Object} headers - Request headers
   * @param {Object} body - Request body
   * @returns {boolean} Whether streaming is requested
   */
  static isStreamRequested(headers, body) {
    const acceptHeader = headers['accept'] || '';
    return acceptHeader.includes('text/event-stream') || body?.stream === true;
  }

  /**
   * Send streaming response
   * @param {Object} res - Express response object
   * @param {Object} axiosResponse - Axios response with stream
   */
  static sendStreamResponse(res, axiosResponse) {
    res.status(axiosResponse.status);

    // Ensure SSE headers
    if (!res.getHeader('Content-Type')) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Pipe the stream
    axiosResponse.data.pipe(res);
  }

  /**
   * Check if response is streamable
   * @param {Object} response - Axios response
   * @returns {boolean} Whether response can be streamed
   */
  static isStreamableResponse(response) {
    return response.data && typeof response.data.pipe === 'function';
  }
}

module.exports = ApiForwardingService;
