const axios = require('axios');
const { apiHeaders } = require('../config/apis');
const { PERFORMANCE } = require('../config/constants');
const { logger } = require('../utils/securityLogger');

/**
 * API Forwarding Service
 * Handles forwarding requests to external AI APIs
 * Single Responsibility: Make HTTP requests to external APIs
 */

class ApiForwardingService {
  /**
   * Forward request to external API
   * @param {Object} options - Forwarding options
   * @param {string} options.api - API provider name
   * @param {string} options.targetUrl - Target URL
   * @param {string} options.method - HTTP method
   * @param {string} options.apiKey - API key
   * @param {Object} options.requestData - Request body data
   * @param {Object} options.headers - Original request headers
   * @param {boolean} options.wantsStream - Whether client wants streaming response
   * @param {boolean} options.isLightMode - Whether light mode is enabled
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
    queryParams
  }) {
    // Determine timeout based on mode
    const timeoutMs = this.getTimeout(isLightMode);

    // Build headers
    const requestHeaders = this.buildHeaders(api, apiKey, headers);

    // Build axios config
    const axiosConfig = {
      method,
      url: targetUrl,
      headers: requestHeaders,
      timeout: timeoutMs,
      validateStatus: (status) => status < 600,
      ...(wantsStream && { responseType: 'stream' })
    };

    // Add data or params based on method
    if (method === 'GET') {
      axiosConfig.params = queryParams || {};
    } else {
      axiosConfig.data = requestData;
    }

    // Make the request
    const startTime = Date.now();
    const response = await axios(axiosConfig);
    const responseTime = Date.now() - startTime;

    return {
      response,
      responseTime,
      success: response.status >= 200 && response.status < 400
    };
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
