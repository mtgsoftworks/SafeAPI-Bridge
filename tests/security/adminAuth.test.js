const { timingSafeCompare, hashAdminKey } = require('../../src/middleware/adminAuth');

describe('Admin Authentication Security', () => {
  describe('timingSafeCompare', () => {
    test('should return true for identical strings', () => {
      const result = timingSafeCompare('secret123', 'secret123');
      expect(result).toBe(true);
    });

    test('should return false for different strings', () => {
      const result = timingSafeCompare('secret123', 'secret456');
      expect(result).toBe(false);
    });

    test('should be timing-safe (constant time)', () => {
      const validKey = 'a'.repeat(100);
      const invalidKey1 = 'b' + 'a'.repeat(99); // Differs at first char
      const invalidKey2 = 'a'.repeat(99) + 'b'; // Differs at last char

      const measure = (candidate) => {
        const iterations = 5000;
        const start = process.hrtime.bigint();
        for (let i = 0; i < iterations; i++) {
          timingSafeCompare(validKey, candidate);
        }
        return process.hrtime.bigint() - start;
      };

      // Aggregate measurements avoid single-call timer noise.
      const time1 = measure(invalidKey1);
      const time2 = measure(invalidKey2);

      // Times should be within reasonable range (not drastically different)
      // This is a rough test - timing attacks are subtle
      const ratio = Number(time1 > time2 ? time1 : time2) / Number(time1 > time2 ? time2 : time1);
      expect(ratio).toBeGreaterThan(0.5);
      expect(ratio).toBeLessThan(2.0);
    });

    test('should handle empty strings', () => {
      expect(timingSafeCompare('', '')).toBe(true);
      expect(timingSafeCompare('test', '')).toBe(false);
      expect(timingSafeCompare('', 'test')).toBe(false);
    });

    test('should handle null/undefined inputs', () => {
      expect(timingSafeCompare(null, null)).toBe(false);
      expect(timingSafeCompare(undefined, undefined)).toBe(false);
      expect(timingSafeCompare('test', null)).toBe(false);
      expect(timingSafeCompare(null, 'test')).toBe(false);
    });

    test('should handle different length strings safely', () => {
      expect(timingSafeCompare('short', 'verylongstring')).toBe(false);
      expect(timingSafeCompare('verylongstring', 'short')).toBe(false);
    });
  });

  describe('hashAdminKey', () => {
    test('should hash admin key consistently', () => {
      const key = 'test-admin-key';
      const hash1 = hashAdminKey(key);
      const hash2 = hashAdminKey(key);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(16); // Truncated SHA256
    });

    test('should produce different hashes for different keys', () => {
      const hash1 = hashAdminKey('key1');
      const hash2 = hashAdminKey('key2');

      expect(hash1).not.toBe(hash2);
    });

    test('should handle null/undefined inputs', () => {
      expect(hashAdminKey(null)).toBe('unknown');
      expect(hashAdminKey(undefined)).toBe('unknown');
      expect(hashAdminKey('')).toBe('unknown');
    });

    test('should not reveal the original key', () => {
      const key = 'super-secret-admin-key';
      const hash = hashAdminKey(key);

      expect(hash).not.toContain(key);
      expect(hash).not.toBe(key);
    });
  });
});
