const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

/**
 * Split Key Service for BYOK (Bring Your Own Key) functionality
 * Handles cryptographic operations for key splitting and reconstruction
 */

class SplitKeyService {
  constructor() {
    this.prisma = new PrismaClient();
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32; // 256 bits
    this.ivLength = 16; // 128 bits
    this.tagLength = 16; // 128 bits
  }

  /**
   * Split an API key into two parts for BYOK functionality
   * @param {string} originalKey - The original API key to split
   * @param {string} apiProvider - The API provider (openai, gemini, etc.)
   * @param {string} keyId - Unique identifier for this key
   * @param {string} createdBy - User who created this key
   * @returns {Promise<Object>} Split key information
   */
  async splitApiKey(originalKey, apiProvider, keyId, createdBy, description = null) {
    try {
      // Generate a random decryption secret
      const decryptionSecret = crypto.randomBytes(this.keyLength).toString('hex');
      const keyBuffer = Buffer.from(decryptionSecret, 'hex');

      // Generate a random IV
      const iv = crypto.randomBytes(this.ivLength);

      // Create cipher
      const cipher = crypto.createCipheriv(this.algorithm, keyBuffer, iv);
      cipher.setAAD(Buffer.from(apiProvider, 'utf8')); // Additional authenticated data

      // Encrypt the original key
      let encrypted = cipher.update(originalKey, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      // Get the authentication tag
      const tag = cipher.getAuthTag();

      // Split the encrypted key into two parts
      const encryptedBuffer = Buffer.from(encrypted, 'hex');
      const midPoint = Math.floor(encryptedBuffer.length / 2);

      const serverPart = encryptedBuffer.slice(0, midPoint).toString('hex') +
                       Buffer.from(tag).toString('hex') +
                       iv.toString('hex');

      const clientPart = encryptedBuffer.slice(midPoint).toString('hex');

      // Store in database
      const splitKey = await this.prisma.splitKey.create({
        data: {
          keyId,
          apiProvider,
          serverPart,
          clientPart,
          decryptionSecret,
          algorithm: this.algorithm,
          createdBy,
          description
        }
      });

      return {
        keyId: splitKey.keyId,
        apiProvider: splitKey.apiProvider,
        clientPart, // Part B - to be given to client
        serverPart: null, // Never expose server part
        decryptionSecret: null, // Never expose decryption secret
        algorithm: splitKey.algorithm,
        createdAt: splitKey.createdAt
      };

    } catch (error) {
      throw new Error(`Failed to split API key: ${error.message}`);
    }
  }

  /**
   * Reconstruct the original API key from split parts
   * @param {string} keyId - The key identifier
   * @param {string} clientPart - The client part (from request header)
   * @returns {Promise<string>} The reconstructed original API key
   */
  async reconstructApiKey(keyId, clientPart) {
    try {
      // Retrieve split key from database
      const splitKey = await this.prisma.splitKey.findUnique({
        where: {
          keyId,
          active: true
        }
      });

      if (!splitKey) {
        throw new Error('Split key not found or inactive');
      }

      // Verify client part matches
      if (splitKey.clientPart !== clientPart) {
        throw new Error('Invalid client part');
      }

      // Extract components from server part
      const serverPartBuffer = Buffer.from(splitKey.serverPart, 'hex');
      const tagStart = serverPartBuffer.length - this.tagLength - this.ivLength;
      const ivStart = serverPartBuffer.length - this.ivLength;

      const encryptedPart1 = serverPartBuffer.slice(0, tagStart);
      const tag = serverPartBuffer.slice(tagStart, ivStart);
      const iv = serverPartBuffer.slice(ivStart);

      // Combine encrypted parts
      const encryptedPart2 = Buffer.from(clientPart, 'hex');
      const fullEncrypted = Buffer.concat([encryptedPart1, encryptedPart2]);

      // Create decipher
      const keyBuffer = Buffer.from(splitKey.decryptionSecret, 'hex');
      const decipher = crypto.createDecipheriv(this.algorithm, keyBuffer, iv);
      decipher.setAAD(Buffer.from(splitKey.apiProvider, 'utf8'));
      decipher.setAuthTag(tag);

      // Decrypt the key
      let decrypted = decipher.update(fullEncrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      // Update usage count
      await this.prisma.splitKey.update({
        where: { id: splitKey.id },
        data: {
          usageCount: { increment: 1 },
          lastUsed: new Date()
        }
      });

      return decrypted;

    } catch (error) {
      throw new Error(`Failed to reconstruct API key: ${error.message}`);
    }
  }

  /**
   * Get split key information without exposing sensitive data
   * @param {string} keyId - The key identifier
   * @returns {Promise<Object>} Safe split key information
   */
  async getSplitKeyInfo(keyId) {
    try {
      const splitKey = await this.prisma.splitKey.findUnique({
        where: { keyId },
        select: {
          keyId: true,
          apiProvider: true,
          algorithm: true,
          keyVersion: true,
          active: true,
          description: true,
          createdBy: true,
          usageCount: true,
          lastUsed: true,
          createdAt: true,
          updatedAt: true
        }
      });

      if (!splitKey) {
        throw new Error('Split key not found');
      }

      return splitKey;

    } catch (error) {
      throw new Error(`Failed to get split key info: ${error.message}`);
    }
  }

  /**
   * List all split keys for a user
   * @param {string} createdBy - The user who created the keys
   * @returns {Promise<Array>} List of split keys
   */
  async listSplitKeys(createdBy) {
    try {
      const splitKeys = await this.prisma.splitKey.findMany({
        where: { createdBy },
        select: {
          keyId: true,
          apiProvider: true,
          algorithm: true,
          keyVersion: true,
          active: true,
          description: true,
          usageCount: true,
          lastUsed: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: { createdAt: 'desc' }
      });

      return splitKeys;

    } catch (error) {
      throw new Error(`Failed to list split keys: ${error.message}`);
    }
  }

  /**
   * Deactivate a split key
   * @param {string} keyId - The key identifier
   * @param {string} createdBy - The user requesting deactivation
   * @returns {Promise<boolean>} Success status
   */
  async deactivateSplitKey(keyId, createdBy) {
    try {
      const splitKey = await this.prisma.splitKey.findUnique({
        where: { keyId }
      });

      if (!splitKey) {
        throw new Error('Split key not found');
      }

      if (splitKey.createdBy !== createdBy) {
        throw new Error('Not authorized to deactivate this key');
      }

      await this.prisma.splitKey.update({
        where: { id: splitKey.id },
        data: { active: false }
      });

      return true;

    } catch (error) {
      throw new Error(`Failed to deactivate split key: ${error.message}`);
    }
  }

  /**
   * Validate split key headers from request
   * @param {Object} headers - Request headers
   * @returns {Object} Validation result
   */
  validateSplitKeyHeaders(headers) {
    const keyId = headers['x-partial-key-id'];
    const clientPart = headers['x-partial-key'];

    if (!keyId || !clientPart) {
      return {
        valid: false,
        error: 'Missing required split key headers: X-Partial-Key-Id and X-Partial-Key'
      };
    }

    // Basic format validation
    if (typeof keyId !== 'string' || keyId.length < 8) {
      return {
        valid: false,
        error: 'Invalid X-Partial-Key-Id format'
      };
    }

    if (typeof clientPart !== 'string' || clientPart.length < 16) {
      return {
        valid: false,
        error: 'Invalid X-Partial-Key format'
      };
    }

    return {
      valid: true,
      keyId,
      clientPart
    };
  }

  /**
   * Cleanup database connection
   */
  async disconnect() {
    await this.prisma.$disconnect();
  }
}

module.exports = new SplitKeyService();