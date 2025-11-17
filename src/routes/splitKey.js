const express = require('express');
const router = express.Router();
const splitKeyService = require('../services/splitKey');
const { authenticateToken } = require('../middleware/auth');
const { logSecurityEvent } = require('../utils/securityLogger');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

/**
 * Rate limiting for split key operations
 */
const splitKeyLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  message: {
    error: 'Too many split key operations',
    retryAfter: '60 seconds'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Generate a keyId based on userId, appId and a random suffix.
 * Example: sk-android-app-user123-9f3a1c0b
 */
const generateKeyId = (userId, appId) => {
  const safeUserId = String(userId || 'user')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 24) || 'user';

  const safeAppId = String(appId || 'app')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 24) || 'app';

  const randomSuffix = crypto.randomBytes(4).toString('hex'); // 8 hex chars

  return `sk-${safeAppId}-${safeUserId}-${randomSuffix}`;
};

/**
 * Split a new API key
 * POST /api/split-key/split
 */
router.post('/split', authenticateToken, splitKeyLimiter, async (req, res) => {
  try {
    let { originalKey, apiProvider, keyId, description } = req.body;
    const userId = req.user.userId;
    const appId = req.user.appId;

    // Validate required fields
    if (!originalKey || !apiProvider) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['originalKey', 'apiProvider']
      });
    }

    // Validate API provider
    const validProviders = [
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
    if (!validProviders.includes(apiProvider.toLowerCase())) {
      return res.status(400).json({
        error: 'Invalid API provider',
        validProviders
      });
    }

    // If keyId is not provided, generate one from userId + appId + random suffix
    if (!keyId || typeof keyId !== 'string' || !keyId.trim()) {
      keyId = generateKeyId(userId, appId);
    } else {
      // Validate user-provided keyId format
      if (keyId.length < 8 || !/^[a-zA-Z0-9_-]+$/.test(keyId)) {
        return res.status(400).json({
          error: 'Invalid keyId format. Must be at least 8 characters and contain only letters, numbers, hyphens, and underscores'
        });
      }
    }

    // Check if keyId already exists
    try {
      await splitKeyService.getSplitKeyInfo(keyId);
      return res.status(409).json({
        error: 'Key ID already exists',
        keyId
      });
    } catch (error) {
      // Key doesn't exist, which is good
    }

    const result = await splitKeyService.splitApiKey(
      originalKey,
      apiProvider.toLowerCase(),
      keyId,
      userId,
      description
    );

    // Log the key splitting operation
    logSecurityEvent('split_key_created', userId, req.ip, {
      keyId,
      apiProvider,
      description
    });

    res.status(201).json({
      success: true,
      message: 'API key successfully split for BYOK usage',
      data: {
        ...result,
        instructions: {
          method: 'BYOK_SPLIT_KEY',
          headers: {
            'Authorization': 'Bearer <JWT_TOKEN>',
            'X-Partial-Key-Id': result.keyId,
            'X-Partial-Key': result.clientPart
          },
          securityNote: 'Store the client part (X-Partial-Key) securely in your application code. Never expose it in client-side code or logs.'
        }
      }
    });

  } catch (error) {
    console.error('Split key error:', error);

    logSecurityEvent('split_key_error', req.user?.userId, req.ip, {
      error: error.message
    });

    res.status(500).json({
      error: 'Failed to split API key',
      message: error.message
    });
  }
});

/**
 * Get split key information
 * GET /api/split-key/:keyId
 */
router.get('/:keyId', authenticateToken, async (req, res) => {
  try {
    const { keyId } = req.params;
    const userId = req.user.userId;

    const splitKeyInfo = await splitKeyService.getSplitKeyInfo(keyId);

    // Only allow the creator to view their own keys
    if (splitKeyInfo.createdBy !== userId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only view your own split keys'
      });
    }

    res.json({
      success: true,
      data: splitKeyInfo
    });

  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Split key not found',
        keyId: req.params.keyId
      });
    }

    res.status(500).json({
      error: 'Failed to get split key info',
      message: error.message
    });
  }
});

/**
 * List all split keys for the authenticated user
 * GET /api/split-key
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const splitKeys = await splitKeyService.listSplitKeys(userId);

    res.json({
      success: true,
      data: splitKeys,
      count: splitKeys.length
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to list split keys',
      message: error.message
    });
  }
});

/**
 * Deactivate a split key
 * DELETE /api/split-key/:keyId
 */
router.delete('/:keyId', authenticateToken, async (req, res) => {
  try {
    const { keyId } = req.params;
    const userId = req.user.userId;

    await splitKeyService.deactivateSplitKey(keyId, userId);

    // Log the deactivation
    logSecurityEvent('split_key_deactivated', userId, req.ip, {
      keyId
    });

    res.json({
      success: true,
      message: 'Split key successfully deactivated'
    });

  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Split key not found',
        keyId: req.params.keyId
      });
    }

    if (error.message.includes('Not authorized')) {
      return res.status(403).json({
        error: 'Access denied',
        message: error.message
      });
    }

    res.status(500).json({
      error: 'Failed to deactivate split key',
      message: error.message
    });
  }
});

/**
 * Validate split key headers (testing endpoint)
 * POST /api/split-key/validate
 */
router.post('/validate', authenticateToken, async (req, res) => {
  try {
    const headers = req.headers;
    const validation = splitKeyService.validateSplitKeyHeaders(headers);

    if (!validation.valid) {
      return res.status(400).json({
        valid: false,
        error: validation.error
      });
    }

    // Try to reconstruct the key to validate it works
    try {
      const originalKey = await splitKeyService.reconstructApiKey(
        validation.keyId,
        validation.clientPart
      );

      res.json({
        valid: true,
        keyId: validation.keyId,
        message: 'Split key headers are valid and key can be reconstructed',
        keyLength: originalKey.length
      });

    } catch (reconstructError) {
      res.status(400).json({
        valid: false,
        error: 'Split key reconstruction failed',
        details: reconstructError.message
      });
    }

  } catch (error) {
    res.status(500).json({
      error: 'Validation failed',
      message: error.message
    });
  }
});

module.exports = router;
