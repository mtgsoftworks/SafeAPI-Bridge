/**
 * Unit Tests for Key Resolution Service
 */

// Create the mocks first, before jest.mock hoisting
const mockFindUnique = jest.fn();
const mockUpdate = jest.fn(() => Promise.resolve({}));

// Mock dependencies
jest.mock('../../src/db/client', () => ({
  splitKey: {
    findUnique: mockFindUnique,
    update: mockUpdate
  }
}));

jest.mock('../../src/utils/crypto', () => ({
  decryptKey: jest.fn()
}));

jest.mock('../../src/utils/securityLogger', () => ({
  logSecurityEvent: jest.fn(),
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

jest.mock('../../src/config/env', () => ({
  openai: { apiKey: 'sk-test-key', baseUrl: 'https://api.openai.com/v1' },
  gemini: { apiKey: 'gemini-key', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
  claude: { apiKey: null, baseUrl: 'https://api.anthropic.com/v1' }
}));

const KeyResolutionService = require('../../src/services/keyResolution');
const prisma = require('../../src/db/client');
const { decryptKey } = require('../../src/utils/crypto');

describe('KeyResolutionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Re-assign mocks to ensure they're properly set
    mockFindUnique.mockReset();
    mockUpdate.mockReset().mockImplementation(() => Promise.resolve({}));
  });

  describe('resolveApiKey', () => {
    describe('Server Key Resolution', () => {
      it('should resolve server key when no BYOK headers present', async () => {
        const result = await KeyResolutionService.resolveApiKey({
          api: 'openai',
          headers: {},
          userId: 'user-123',
          ip: '127.0.0.1'
        });

        expect(result.success).toBe(true);
        expect(result.apiKey).toBe('sk-test-key');
        expect(result.keySource).toBe('SERVER_KEY');
      });

      it('should return error when API not configured', async () => {
        const result = await KeyResolutionService.resolveApiKey({
          api: 'claude',
          headers: {},
          userId: 'user-123',
          ip: '127.0.0.1'
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('API_NOT_CONFIGURED');
        expect(result.status).toBe(503);
      });
    });

    describe('BYOK Split Key Resolution', () => {
      it('should resolve BYOK key when valid headers present', async () => {
        const mockSplitKey = {
          id: 'record-1',
          keyId: 'key-123',
          clientPart: 'client-part-hex',
          serverPart: 'server-part-hex',
          decryptionSecret: 'secret-hex',
          apiProvider: 'openai',
          active: true
        };

        mockFindUnique.mockResolvedValue(mockSplitKey);
        decryptKey.mockReturnValue('decrypted-api-key');

        const result = await KeyResolutionService.resolveApiKey({
          api: 'openai',
          headers: {
            'x-partial-key-id': 'key-123',
            'x-partial-key': 'client-part-hex'
          },
          userId: 'user-123',
          ip: '127.0.0.1'
        });

        expect(result.success).toBe(true);
        expect(result.apiKey).toBe('decrypted-api-key');
        expect(result.keySource).toBe('BYOK_SPLIT_KEY');
        expect(result.keyId).toBe('key-123');
      });

      it('should return error for invalid key ID', async () => {
        mockFindUnique.mockResolvedValue(null);

        const result = await KeyResolutionService.resolveApiKey({
          api: 'openai',
          headers: {
            'x-partial-key-id': 'invalid-key',
            'x-partial-key': 'client-part-hex'
          },
          userId: 'user-123',
          ip: '127.0.0.1'
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('INVALID_SPLIT_KEY_ID');
        expect(result.status).toBe(401);
      });

      it('should return error for inactive key', async () => {
        mockFindUnique.mockResolvedValue({
          keyId: 'key-123',
          active: false
        });

        const result = await KeyResolutionService.resolveApiKey({
          api: 'openai',
          headers: {
            'x-partial-key-id': 'key-123',
            'x-partial-key': 'client-part-hex'
          },
          userId: 'user-123',
          ip: '127.0.0.1'
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('INVALID_SPLIT_KEY_ID');
      });

      it('should return error for mismatched client part', async () => {
        mockFindUnique.mockResolvedValue({
          keyId: 'key-123',
          clientPart: 'correct-client-part',
          active: true
        });

        const result = await KeyResolutionService.resolveApiKey({
          api: 'openai',
          headers: {
            'x-partial-key-id': 'key-123',
            'x-partial-key': 'wrong-client-part'
          },
          userId: 'user-123',
          ip: '127.0.0.1'
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('INVALID_SPLIT_KEY');
        expect(result.status).toBe(401);
      });

      it('should return error when decryption fails', async () => {
        mockFindUnique.mockResolvedValue({
          keyId: 'key-123',
          clientPart: 'client-part-hex',
          serverPart: 'server-part-hex',
          decryptionSecret: 'secret-hex',
          apiProvider: 'openai',
          active: true
        });

        decryptKey.mockImplementation(() => {
          throw new Error('Decryption failed');
        });

        const result = await KeyResolutionService.resolveApiKey({
          api: 'openai',
          headers: {
            'x-partial-key-id': 'key-123',
            'x-partial-key': 'client-part-hex'
          },
          userId: 'user-123',
          ip: '127.0.0.1'
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('DECRYPTION_FAILED');
        expect(result.status).toBe(401);
      });
    });
  });

  describe('buildTargetUrl', () => {
    it('should build standard URL for OpenAI', () => {
      const url = KeyResolutionService.buildTargetUrl('openai', '/chat/completions', 'key');
      expect(url).toBe('https://api.openai.com/v1/chat/completions');
    });

    it('should add API key as query param for Gemini', () => {
      const url = KeyResolutionService.buildTargetUrl('gemini', '/models', 'gemini-key');
      expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models?key=gemini-key');
    });

    it('should handle existing query params for Gemini', () => {
      const url = KeyResolutionService.buildTargetUrl('gemini', '/models?param=value', 'gemini-key');
      expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models?param=value&key=gemini-key');
    });
  });
});
