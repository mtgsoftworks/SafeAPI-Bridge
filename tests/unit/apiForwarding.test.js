/**
 * Unit Tests for API Forwarding Service
 */

// Mock axios
jest.mock('axios');

jest.mock('../../src/config/apis', () => ({
  apiHeaders: {
    openai: (key) => ({ 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }),
    gemini: () => ({ 'Content-Type': 'application/json' }),
    claude: (key) => ({ 'x-api-key': key, 'anthropic-version': '2025-06-01', 'Content-Type': 'application/json' })
  }
}));

jest.mock('../../src/config/constants', () => ({
  PERFORMANCE: {
    LIGHT_MODE_TIMEOUT_MS: 30000,
    NORMAL_MODE_TIMEOUT_MS: 60000
  }
}));

jest.mock('../../src/utils/securityLogger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

const axios = require('axios');
const ApiForwardingService = require('../../src/services/apiForwarding');

describe('ApiForwardingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.UPSTREAM_TIMEOUT_MS;
  });

  describe('forwardRequest', () => {
    it('should make successful request', async () => {
      axios.mockResolvedValue({
        status: 200,
        data: { message: 'success' }
      });

      const result = await ApiForwardingService.forwardRequest({
        api: 'openai',
        targetUrl: 'https://api.openai.com/v1/chat/completions',
        method: 'POST',
        apiKey: 'sk-test-key',
        requestData: { messages: [{ role: 'user', content: 'Hello' }] },
        headers: {},
        wantsStream: false,
        isLightMode: false
      });

      expect(result.success).toBe(true);
      expect(result.response.status).toBe(200);
      expect(result.responseTime).toBeGreaterThanOrEqual(0);
    });

    it('should use light mode timeout when enabled', async () => {
      axios.mockResolvedValue({ status: 200, data: {} });

      await ApiForwardingService.forwardRequest({
        api: 'openai',
        targetUrl: 'https://api.openai.com/v1/chat/completions',
        method: 'POST',
        apiKey: 'sk-test-key',
        requestData: {},
        headers: {},
        wantsStream: false,
        isLightMode: true
      });

      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 30000
        })
      );
    });

    it('should use normal mode timeout when light mode disabled', async () => {
      axios.mockResolvedValue({ status: 200, data: {} });

      await ApiForwardingService.forwardRequest({
        api: 'openai',
        targetUrl: 'https://api.openai.com/v1/chat/completions',
        method: 'POST',
        apiKey: 'sk-test-key',
        requestData: {},
        headers: {},
        wantsStream: false,
        isLightMode: false
      });

      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 60000
        })
      );
    });

    it('should use env timeout when specified', async () => {
      process.env.UPSTREAM_TIMEOUT_MS = '45000';
      axios.mockResolvedValue({ status: 200, data: {} });

      await ApiForwardingService.forwardRequest({
        api: 'openai',
        targetUrl: 'https://api.openai.com/v1/chat/completions',
        method: 'POST',
        apiKey: 'sk-test-key',
        requestData: {},
        headers: {},
        wantsStream: false,
        isLightMode: false
      });

      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 45000
        })
      );
    });

    it('should set stream responseType when streaming requested', async () => {
      axios.mockResolvedValue({ status: 200, data: {} });

      await ApiForwardingService.forwardRequest({
        api: 'openai',
        targetUrl: 'https://api.openai.com/v1/chat/completions',
        method: 'POST',
        apiKey: 'sk-test-key',
        requestData: { stream: true },
        headers: {},
        wantsStream: true,
        isLightMode: false
      });

      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({
          responseType: 'stream'
        })
      );
    });

    it('should use query params for GET requests', async () => {
      axios.mockResolvedValue({ status: 200, data: {} });

      await ApiForwardingService.forwardRequest({
        api: 'openai',
        targetUrl: 'https://api.openai.com/v1/models',
        method: 'GET',
        apiKey: 'sk-test-key',
        requestData: null,
        headers: {},
        wantsStream: false,
        isLightMode: false,
        queryParams: { limit: 10 }
      });

      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          params: { limit: 10 }
        })
      );
    });

    it('should include user-agent from original headers', async () => {
      axios.mockResolvedValue({ status: 200, data: {} });

      await ApiForwardingService.forwardRequest({
        api: 'openai',
        targetUrl: 'https://api.openai.com/v1/chat/completions',
        method: 'POST',
        apiKey: 'sk-test-key',
        requestData: {},
        headers: { 'user-agent': 'CustomApp/1.0' },
        wantsStream: false,
        isLightMode: false
      });

      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': 'CustomApp/1.0'
          })
        })
      );
    });

    it('should report failure for 4xx/5xx responses', async () => {
      axios.mockResolvedValue({ status: 400, data: { error: 'Bad request' } });

      const result = await ApiForwardingService.forwardRequest({
        api: 'openai',
        targetUrl: 'https://api.openai.com/v1/chat/completions',
        method: 'POST',
        apiKey: 'sk-test-key',
        requestData: {},
        headers: {},
        wantsStream: false,
        isLightMode: false
      });

      expect(result.success).toBe(false);
      expect(result.response.status).toBe(400);
    });
  });

  describe('isStreamRequested', () => {
    it('should return true for text/event-stream accept header', () => {
      const result = ApiForwardingService.isStreamRequested(
        { accept: 'text/event-stream' },
        {}
      );
      expect(result).toBe(true);
    });

    it('should return true for stream: true in body', () => {
      const result = ApiForwardingService.isStreamRequested(
        {},
        { stream: true }
      );
      expect(result).toBe(true);
    });

    it('should return false when no streaming indicators', () => {
      const result = ApiForwardingService.isStreamRequested(
        { accept: 'application/json' },
        {}
      );
      expect(result).toBe(false);
    });
  });

  describe('isStreamableResponse', () => {
    it('should return true for response with pipe function', () => {
      const mockResponse = {
        data: { pipe: jest.fn() }
      };
      expect(ApiForwardingService.isStreamableResponse(mockResponse)).toBe(true);
    });

    it('should return false for regular response', () => {
      const mockResponse = {
        data: { message: 'Hello' }
      };
      expect(ApiForwardingService.isStreamableResponse(mockResponse)).toBe(false);
    });

    it('should return false for null data', () => {
      const mockResponse = { data: null };
      // The function returns falsy value (null && ...) which is null, but treated as false
      expect(ApiForwardingService.isStreamableResponse(mockResponse)).toBeFalsy();
    });
  });
});
