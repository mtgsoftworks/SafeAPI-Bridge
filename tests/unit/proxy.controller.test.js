/**
 * Proxy Controller Unit Tests
 * Tests for src/controllers/proxy.js
 */

const { healthCheck, getAvailableEndpoints } = require('../../src/controllers/proxy');

// Mock dependencies
jest.mock('../../src/db/client', () => ({
  $queryRaw: jest.fn()
}));

jest.mock('../../src/config/env', () => ({
  openai: { apiKey: 'test-key', baseUrl: 'https://api.openai.com/v1' },
  gemini: { apiKey: null, baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
  claude: { apiKey: 'test-key', baseUrl: 'https://api.anthropic.com/v1' },
  groq: { apiKey: null, baseUrl: 'https://api.groq.com/openai/v1' },
  mistral: { apiKey: null, baseUrl: 'https://api.mistral.ai/v1' },
  zai: { apiKey: null, baseUrl: 'https://api.z.ai/api/paas/v4' },
  deepseek: { apiKey: null, baseUrl: 'https://api.deepseek.com' },
  perplexity: { apiKey: null, baseUrl: 'https://api.perplexity.ai' },
  together: { apiKey: null, baseUrl: 'https://api.together.xyz/v1' },
  openrouter: { apiKey: null, baseUrl: 'https://openrouter.ai/api/v1' },
  fireworks: { apiKey: null, baseUrl: 'https://api.fireworks.ai/inference/v1' },
  github: { apiKey: null, baseUrl: 'https://models.github.ai/inference' },
  replicate: { apiKey: null, baseUrl: 'https://api.replicate.com/v1' },
  stability: { apiKey: null, baseUrl: 'https://api.stability.ai' },
  fal: { apiKey: null, baseUrl: 'https://fal.ai/api' },
  elevenlabs: { apiKey: null, baseUrl: 'https://api.elevenlabs.io/v1' },
  brave: { apiKey: null, baseUrl: 'https://api.search.brave.com/res/v1' },
  deepl: { apiKey: null, baseUrl: 'https://api-free.deepl.com/v2' },
  openmeteo: { apiKey: null, baseUrl: 'https://api.open-meteo.com/v1' }
}));

jest.mock('../../src/utils/securityLogger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

describe('Proxy Controller', () => {
  let mockReq;
  let mockRes;
  const ADMIN_KEY = 'test-admin-key';

  beforeEach(() => {
    process.env.ADMIN_API_KEY = ADMIN_KEY;

    mockReq = {
      params: {},
      body: {},
      query: {},
      headers: {},
      user: { userId: 'test-user', appId: 'test-app' },
      method: 'POST',
      ip: '127.0.0.1'
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    jest.clearAllMocks();
  });

  describe('healthCheck', () => {
    it('should return minimal status for unauthenticated users when database is connected', async () => {
      const prisma = require('../../src/db/client');
      prisma.$queryRaw.mockResolvedValue([{ 1: 1 }]);

      await healthCheck(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      const response = mockRes.json.mock.calls[0][0];
      expect(response.status).toBe('healthy');
      expect(response.timestamp).toBeDefined();
      // Should NOT expose infrastructure details
      expect(response.apis).toBeUndefined();
      expect(response.infrastructure).toBeUndefined();
      expect(response.summary).toBeUndefined();
    });

    it('should return minimal degraded status for unauthenticated users when database fails', async () => {
      const prisma = require('../../src/db/client');
      prisma.$queryRaw.mockRejectedValue(new Error('Connection failed'));

      await healthCheck(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(503);
      const response = mockRes.json.mock.calls[0][0];
      expect(response.status).toBe('degraded');
      expect(response.timestamp).toBeDefined();
      // Should NOT expose infrastructure details
      expect(response.apis).toBeUndefined();
      expect(response.infrastructure).toBeUndefined();
    });

    it('should return detailed status for admin users when database is connected', async () => {
      const prisma = require('../../src/db/client');
      prisma.$queryRaw.mockResolvedValue([{ 1: 1 }]);
      mockReq.headers['x-admin-key'] = ADMIN_KEY;

      await healthCheck(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'healthy',
          infrastructure: expect.objectContaining({
            database: expect.objectContaining({
              status: 'connected'
            })
          })
        })
      );
    });

    it('should return detailed degraded status for admin users when database fails', async () => {
      const prisma = require('../../src/db/client');
      prisma.$queryRaw.mockRejectedValue(new Error('Connection failed'));
      mockReq.headers['x-admin-key'] = ADMIN_KEY;

      await healthCheck(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(503);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'degraded',
          infrastructure: expect.objectContaining({
            database: expect.objectContaining({
              status: 'error'
            })
          })
        })
      );
    });

    it('should include API configuration status for admin users', async () => {
      const prisma = require('../../src/db/client');
      prisma.$queryRaw.mockResolvedValue([{ 1: 1 }]);
      mockReq.headers['x-admin-key'] = ADMIN_KEY;

      await healthCheck(mockReq, mockRes);

      const response = mockRes.json.mock.calls[0][0];
      expect(response.apis).toBeDefined();
      expect(response.apis.openai.configured).toBe(true);
      expect(response.apis.gemini.configured).toBe(false);
    });

    it('should include summary of configured APIs for admin users', async () => {
      const prisma = require('../../src/db/client');
      prisma.$queryRaw.mockResolvedValue([{ 1: 1 }]);
      mockReq.headers['x-admin-key'] = ADMIN_KEY;

      await healthCheck(mockReq, mockRes);

      const response = mockRes.json.mock.calls[0][0];
      expect(response.summary).toMatch(/\d+\/\d+ APIs configured/);
    });

    it('should include timestamp', async () => {
      const prisma = require('../../src/db/client');
      prisma.$queryRaw.mockResolvedValue([{ 1: 1 }]);

      await healthCheck(mockReq, mockRes);

      const response = mockRes.json.mock.calls[0][0];
      expect(response.timestamp).toBeDefined();
      expect(new Date(response.timestamp)).toBeInstanceOf(Date);
    });

    it('should return minimal light mode response for unauthenticated users', async () => {
      const originalLightMode = process.env.LIGHT_MODE;
      process.env.LIGHT_MODE = 'true';

      await healthCheck(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      const response = mockRes.json.mock.calls[0][0];
      expect(response.status).toBe('healthy');
      expect(response.timestamp).toBeDefined();
      // Should NOT expose details in light mode for non-admin
      expect(response.apis).toBeUndefined();
      expect(response.infrastructure).toBeUndefined();

      process.env.LIGHT_MODE = originalLightMode;
    });

    it('should return detailed light mode response for admin users', async () => {
      const originalLightMode = process.env.LIGHT_MODE;
      process.env.LIGHT_MODE = 'true';
      mockReq.headers['x-admin-key'] = ADMIN_KEY;

      await healthCheck(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      const response = mockRes.json.mock.calls[0][0];
      expect(response.mode).toBe('light');
      expect(response.infrastructure.database.status).toBe('skipped');
      expect(response.apis).toBeDefined();

      process.env.LIGHT_MODE = originalLightMode;
    });

    it('should not expose details with invalid admin key', async () => {
      const prisma = require('../../src/db/client');
      prisma.$queryRaw.mockResolvedValue([{ 1: 1 }]);
      mockReq.headers['x-admin-key'] = 'wrong-key';

      await healthCheck(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      const response = mockRes.json.mock.calls[0][0];
      expect(response.status).toBe('healthy');
      // Should NOT expose details with wrong admin key
      expect(response.apis).toBeUndefined();
      expect(response.infrastructure).toBeUndefined();
    });
  });

  describe('getAvailableEndpoints', () => {
    it('should return endpoints for valid API', () => {
      mockReq.params.api = 'openai';

      getAvailableEndpoints(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          api: 'OPENAI',
          configured: true,
          allowedEndpoints: expect.arrayContaining(['/chat/completions'])
        })
      );
    });

    it('should return 404 for invalid API', () => {
      mockReq.params.api = 'invalidapi';

      getAvailableEndpoints(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'API not found',
          message: expect.stringContaining('invalidapi')
        })
      );
    });

    it('should indicate when API is not configured', () => {
      mockReq.params.api = 'gemini';

      getAvailableEndpoints(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          api: 'GEMINI',
          configured: false,
          message: expect.stringContaining('not configured')
        })
      );
    });

    it('should include available APIs in error response', () => {
      mockReq.params.api = 'unknown';

      getAvailableEndpoints(mockReq, mockRes);

      const response = mockRes.json.mock.calls[0][0];
      expect(response.availableApis).toBeDefined();
      expect(Array.isArray(response.availableApis)).toBe(true);
    });

    it('should return base URL for configured API', () => {
      mockReq.params.api = 'openai';

      getAvailableEndpoints(mockReq, mockRes);

      const response = mockRes.json.mock.calls[0][0];
      expect(response.baseUrl).toBe('https://api.openai.com/v1');
    });
  });
});
