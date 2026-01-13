const config = require('../config/env');
const prisma = require('../db/client');
const { decryptKey } = require('../utils/crypto');
const { logSecurityEvent, logger } = require('../utils/securityLogger');

/**
 * Key Resolution Service
 * Handles API key resolution from various sources (Server Key, BYOK Split Key)
 * Single Responsibility: Resolve API keys from different authentication methods
 */

class KeyResolutionService {
  /**
   * Resolve API key based on authentication method
   * @param {Object} options - Resolution options
   * @param {string} options.api - API provider name
   * @param {Object} options.headers - Request headers
   * @param {string} options.userId - User ID for logging
   * @param {string} options.ip - Request IP for logging
   * @returns {Promise<Object>} Resolution result with apiKey and keySource
   */
  static async resolveApiKey({ api, headers, userId, ip }) {
    const partialKeyId = headers['x-partial-key-id'];
    const clientPart = headers['x-partial-key'];

    // Check if BYOK Split Key headers are present
    if (partialKeyId && clientPart) {
      return await this.resolveBYOKKey({
        api,
        partialKeyId,
        clientPart,
        userId,
        ip
      });
    }

    // Fall back to server key
    return this.resolveServerKey(api);
  }

  /**
   * Resolve API key from BYOK split key
   * @private
   */
  static async resolveBYOKKey({ api, partialKeyId, clientPart, userId, ip }) {
    const splitKeyRecord = await prisma.splitKey.findUnique({
      where: { keyId: partialKeyId }
    });

    if (!splitKeyRecord || !splitKeyRecord.active) {
      return {
        success: false,
        error: 'INVALID_SPLIT_KEY_ID',
        message: 'Split key not found or inactive',
        status: 401
      };
    }

    if (splitKeyRecord.clientPart !== clientPart) {
      return {
        success: false,
        error: 'INVALID_SPLIT_KEY',
        message: 'Invalid X-Partial-Key or X-Partial-Key-Id combination',
        status: 401
      };
    }

    try {
      const apiKey = decryptKey(
        splitKeyRecord.serverPart,
        splitKeyRecord.decryptionSecret,
        splitKeyRecord.apiProvider,
        clientPart
      );

      // Log successful BYOK usage
      logSecurityEvent('byok_key_used', userId, ip, {
        api,
        keyId: splitKeyRecord.keyId
      });

      // Update usage count asynchronously (fire and forget with safe error handling)
      setImmediate(() => {
        if (prisma.splitKey && typeof prisma.splitKey.update === 'function') {
          prisma.splitKey.update({
            where: { id: splitKeyRecord.id },
            data: {
              usageCount: { increment: 1 },
              lastUsed: new Date()
            }
          }).catch(err => logger.error('Split key usage update error', { error: err.message }));
        }
      });

      return {
        success: true,
        apiKey,
        keySource: 'BYOK_SPLIT_KEY',
        keyId: splitKeyRecord.keyId
      };
    } catch (decryptError) {
      return {
        success: false,
        error: 'DECRYPTION_FAILED',
        message: 'Unable to reconstruct API key from split parts',
        status: 401
      };
    }
  }

  /**
   * Resolve API key from server configuration
   * @private
   */
  static resolveServerKey(api) {
    const apiConfig = config[api];

    if (!apiConfig || !apiConfig.apiKey) {
      return {
        success: false,
        error: 'API_NOT_CONFIGURED',
        message: `${api.toUpperCase()} API is not configured. Please add the API key to .env file`,
        status: 503
      };
    }

    return {
      success: true,
      apiKey: apiConfig.apiKey,
      keySource: 'SERVER_KEY'
    };
  }

  /**
   * Build target URL for API request
   * @param {string} api - API provider name
   * @param {string} endpoint - API endpoint
   * @param {string} apiKey - API key (for providers that need it in URL)
   * @returns {string} Complete target URL
   */
  static buildTargetUrl(api, endpoint, apiKey) {
    const baseUrl = config[api].baseUrl;
    let targetUrl = `${baseUrl}${endpoint}`;

    // Special handling for Gemini (API key in query parameter)
    if (api === 'gemini') {
      const separator = targetUrl.includes('?') ? '&' : '?';
      targetUrl = `${targetUrl}${separator}key=${apiKey}`;
    }

    return targetUrl;
  }
}

module.exports = KeyResolutionService;
