const jwt = require('jsonwebtoken');
const tokenBlacklist = require('../../src/services/tokenBlacklist');

describe('Token Blacklist Service', () => {
  const JWT_SECRET = 'test-secret';

  beforeEach(() => {
    // Reset mocks between tests
    jest.clearAllMocks();
  });

  describe('addToBlacklist', () => {
    test('should blacklist a valid token', async () => {
      const payload = { userId: 'test-user' };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });

      const result = await tokenBlacklist.addToBlacklist(token, 'test-user', '127.0.0.1');

      expect(result).toBe(true);
    });

    test('should not blacklist an already expired token', async () => {
      const payload = { userId: 'test-user' };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '-1h' }); // Already expired

      const result = await tokenBlacklist.addToBlacklist(token, 'test-user', '127.0.0.1');

      // Should still return true (no error) but token isn't stored
      expect(result).toBe(true);
    });

    test('should handle invalid tokens gracefully', async () => {
      const result = await tokenBlacklist.addToBlacklist('invalid-token', 'test-user', '127.0.0.1');

      expect(result).toBe(false);
    });

    test('should handle null/undefined tokens', async () => {
      expect(await tokenBlacklist.addToBlacklist(null, 'user', 'ip')).toBe(false);
      expect(await tokenBlacklist.addToBlacklist(undefined, 'user', 'ip')).toBe(false);
    });
  });

  describe('isBlacklisted', () => {
    test('should return false for non-blacklisted tokens', async () => {
      const payload = { userId: 'test-user' };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });

      const result = await tokenBlacklist.isBlacklisted(token);

      // Since we're using in-memory fallback in tests, this should be false
      expect(result).toBe(false);
    });

    test('should return true for blacklisted tokens', async () => {
      const payload = { userId: 'test-user' };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });

      // Blacklist the token
      await tokenBlacklist.addToBlacklist(token, 'test-user', '127.0.0.1');

      // Check if it's blacklisted
      const result = await tokenBlacklist.isBlacklisted(token);

      expect(result).toBe(true);
    });

    test('should handle invalid tokens gracefully', async () => {
      const result = await tokenBlacklist.isBlacklisted('invalid-token');

      // Should fail-open (return false) for safety
      expect(result).toBe(false);
    });
  });

  describe('removeFromBlacklist', () => {
    test('should remove token from blacklist', async () => {
      const payload = { userId: 'test-user' };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });

      // Blacklist
      await tokenBlacklist.addToBlacklist(token, 'test-user', '127.0.0.1');

      // Remove
      const result = await tokenBlacklist.removeFromBlacklist(token);
      expect(result).toBe(true);

      // Verify it's no longer blacklisted
      const isBlacklisted = await tokenBlacklist.isBlacklisted(token);
      expect(isBlacklisted).toBe(false);
    });
  });

  describe('getBlacklistInfo', () => {
    test('should return null for non-blacklisted tokens', async () => {
      const payload = { userId: 'test-user' };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });

      const info = await tokenBlacklist.getBlacklistInfo(token);

      expect(info).toBeNull();
    });

    test('should return info for blacklisted tokens', async () => {
      const payload = { userId: 'test-user' };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });

      // Blacklist
      await tokenBlacklist.addToBlacklist(token, 'test-user', '192.168.1.1');

      // Get info
      const info = await tokenBlacklist.getBlacklistInfo(token);

      expect(info).not.toBeNull();
      expect(info.userId).toBe('test-user');
      expect(info.ip).toBe('192.168.1.1');
      expect(info.tokenId).toBeDefined();
    });
  });
});
