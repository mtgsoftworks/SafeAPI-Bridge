const crypto = require('crypto');

/**
 * Crypto utilities for split-key (BYOK) operations.
 *
 * Encryption layout (see src/services/splitKey.js):
 * - originalKey is encrypted with AES-256-GCM using:
 *   - key = decryptionSecret (hex string -> 32 bytes)
 *   - iv = 16 random bytes
 *   - AAD = apiProvider (utf8)
 * - The encrypted ciphertext is split into two parts:
 *   - serverPart: first half of ciphertext + tag + iv (all hex)
 *   - clientPart: second half of ciphertext (hex)
 *
 * This helper reverses that process and reconstructs the original key.
 */

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH_BYTES = 32; // 256 bits
const IV_LENGTH_BYTES = 16;  // 128 bits
const TAG_LENGTH_BYTES = 16; // 128 bits

/**
 * Decrypt an API key from split-key components.
 *
 * @param {string} serverPart - Hex string containing first half of ciphertext + tag + iv.
 * @param {string} decryptionSecret - Hex string used as AES-256-GCM key.
 * @param {string} apiProvider - Provider name used as AAD during encryption.
 * @param {string} clientPart - Hex string with second half of ciphertext.
 * @returns {string} The decrypted original API key.
 */
function decryptKey(serverPart, decryptionSecret, apiProvider, clientPart) {
  if (!serverPart || !decryptionSecret || !apiProvider || !clientPart) {
    throw new Error('Missing parameters for decryptKey');
  }

  const serverBuf = Buffer.from(serverPart, 'hex');

  if (serverBuf.length <= IV_LENGTH_BYTES + TAG_LENGTH_BYTES) {
    throw new Error('Invalid serverPart length');
  }

  // Layout: [encryptedPart1][tag][iv]
  const tagStart = serverBuf.length - TAG_LENGTH_BYTES - IV_LENGTH_BYTES;
  const ivStart = serverBuf.length - IV_LENGTH_BYTES;

  const encryptedPart1 = serverBuf.slice(0, tagStart);
  const tag = serverBuf.slice(tagStart, ivStart);
  const iv = serverBuf.slice(ivStart);

  const encryptedPart2 = Buffer.from(clientPart, 'hex');
  const fullEncrypted = Buffer.concat([encryptedPart1, encryptedPart2]);

  const keyBuffer = Buffer.from(decryptionSecret, 'hex');

  if (keyBuffer.length !== KEY_LENGTH_BYTES) {
    throw new Error('Invalid decryptionSecret length');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
  decipher.setAAD(Buffer.from(apiProvider, 'utf8'));
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(fullEncrypted, undefined, 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

module.exports = {
  decryptKey
};

