/**
 * Unit Tests for Validator Utilities
 */

const { VALIDATION } = require('../../src/config/constants');

// Mock the dependencies
jest.mock('../../src/config/securityPatterns', () => ({
  containsMaliciousPattern: jest.fn((input) => {
    // Simulate detecting SQL injection patterns
    return /('|--|;|union|select|drop|delete|insert)/i.test(input);
  })
}));

jest.mock('../../src/config/apis', () => ({
  SUPPORTED_APIS: ['openai', 'gemini', 'claude', 'groq', 'mistral']
}));

const { validateProxyRequest, validateEndpoint, validateAuthRequest, sanitizeBody } = require('../../src/utils/validator');

describe('Validator Utilities', () => {
  describe('validateEndpoint', () => {
    it('should validate a proper endpoint', () => {
      const result = validateEndpoint('/chat/completions');
      expect(result.valid).toBe(true);
    });

    it('should reject null endpoint', () => {
      const result = validateEndpoint(null);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should reject endpoint without leading slash', () => {
      const result = validateEndpoint('chat/completions');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('start with /');
    });

    it('should reject endpoint with path traversal', () => {
      const result = validateEndpoint('/api/../../../etc/passwd');
      expect(result.valid).toBe(false);
    });

    it('should reject endpoint with double slashes', () => {
      const result = validateEndpoint('/api//completions');
      expect(result.valid).toBe(false);
    });

    it('should reject extremely long endpoints', () => {
      const longEndpoint = '/' + 'a'.repeat(VALIDATION.MAX_ENDPOINT_LENGTH + 1);
      const result = validateEndpoint(longEndpoint);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too long');
    });
  });

  describe('sanitizeBody', () => {
    it('should remove dangerous fields from body', () => {
      const body = {
        message: 'Hello',
        apiKey: 'sk-secret',
        password: 'secret123',
        data: 'valid'
      };

      const sanitized = sanitizeBody(body);

      expect(sanitized.message).toBe('Hello');
      expect(sanitized.data).toBe('valid');
      expect(sanitized.apiKey).toBeUndefined();
      expect(sanitized.password).toBeUndefined();
    });

    it('should handle nested objects', () => {
      const body = {
        outer: {
          inner: {
            apiKey: 'secret',
            value: 'keep'
          }
        }
      };

      const sanitized = sanitizeBody(body);

      expect(sanitized.outer.inner.value).toBe('keep');
      expect(sanitized.outer.inner.apiKey).toBeUndefined();
    });

    it('should handle arrays', () => {
      const body = {
        items: [
          { name: 'item1', token: 'secret' },
          { name: 'item2', data: 'valid' }
        ]
      };

      const sanitized = sanitizeBody(body);

      expect(sanitized.items[0].name).toBe('item1');
      expect(sanitized.items[0].token).toBeUndefined();
      expect(sanitized.items[1].data).toBe('valid');
    });

    it('should return null/undefined as-is', () => {
      expect(sanitizeBody(null)).toBeNull();
      expect(sanitizeBody(undefined)).toBeUndefined();
    });
  });

  describe('validateProxyRequest middleware', () => {
    let mockReq, mockRes, mockNext;

    beforeEach(() => {
      mockReq = {
        params: { api: 'openai' },
        method: 'POST',
        body: { endpoint: '/chat/completions', message: 'test' },
        query: {},
        headers: { 'content-type': 'application/json' },
        requestId: 'test-123'
      };

      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      mockNext = jest.fn();
    });

    it('should pass valid POST request', () => {
      validateProxyRequest(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject invalid API provider', () => {
      mockReq.params.api = 'invalid-api';
      validateProxyRequest(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalled();
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should require endpoint for GET requests', () => {
      mockReq.method = 'GET';
      mockReq.query = {};

      validateProxyRequest(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should validate GET request with endpoint in query', () => {
      mockReq.method = 'GET';
      mockReq.query = { endpoint: '/models' };

      validateProxyRequest(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('validateAuthRequest middleware', () => {
    let mockReq, mockRes, mockNext;

    beforeEach(() => {
      mockReq = {
        body: { userId: 'user123', appId: 'app456' },
        requestId: 'test-123'
      };

      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      mockNext = jest.fn();
    });

    it('should pass valid auth request', () => {
      validateAuthRequest(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject missing userId', () => {
      mockReq.body = { appId: 'app456' };
      validateAuthRequest(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject missing appId', () => {
      mockReq.body = { userId: 'user123' };
      validateAuthRequest(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject userId that is too short', () => {
      mockReq.body = { userId: 'ab', appId: 'app456' };
      validateAuthRequest(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject userId that is too long', () => {
      mockReq.body = { userId: 'a'.repeat(VALIDATION.MAX_USER_ID_LENGTH + 1), appId: 'app456' };
      validateAuthRequest(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});
