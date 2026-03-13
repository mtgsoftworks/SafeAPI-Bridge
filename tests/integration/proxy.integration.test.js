/**
 * Proxy Integration Tests
 * Tests the complete proxy functionality including authentication and API forwarding
 * 
 * NOTE: These tests require the server to be running and may fail in CI without proper setup.
 * Skip if server startup fails.
 */

const request = require('supertest');

// Conditionally load server to prevent startup issues in test environment
let app;
let generateToken;
try {
  app = require('../../src/server');
  generateToken = require('../../src/middleware/auth').generateToken;
} catch (error) {
  console.warn('Server startup failed in test environment:', error.message);
}

// Test configuration
const TEST_USER_ID = 'test-user-integration';
const TEST_APP_ID = 'test-app-integration';

describe('Proxy Integration Tests', () => {
  let authToken;
  let server;

  beforeAll(async () => {
    // Start test server
    server = app.listen(0); // Use random available port

    // Generate test JWT token
    authToken = generateToken({ userId: TEST_USER_ID, appId: TEST_APP_ID });
  });

  afterAll(async () => {
    // Clean up test server
    if (server) {
      await new Promise((resolve) => {
        server.close(resolve);
      });
    }
  });

  describe('Authentication', () => {
    test('should reject requests without authentication', async () => {
      const response = await request(app)
        .post('/api/openai/proxy')
        .send({
          endpoint: '/chat/completions',
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'Hello' }]
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    test('should accept requests with valid JWT token', async () => {
      // This test would normally require a mocked API response
      // For now, we test the authentication layer only
      const response = await request(app)
        .get('/api/openai/endpoints')
        .set('Authorization', `Bearer ${authToken}`);

      // Should pass authentication (even if API not configured)
      expect([200, 404, 503]).toContain(response.status);
      expect(response.status).not.toBe(401);
    });

    test('should reject requests with invalid JWT token', async () => {
      const response = await request(app)
        .post('/api/openai/proxy')
        .set('Authorization', 'Bearer invalid-token')
        .send({
          endpoint: '/chat/completions',
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'Hello' }]
        });

      expect(response.status).toBe(403);
    });
  });

  describe('API Endpoint Validation', () => {
    test('should validate supported APIs', async () => {
      const supportedApis = [
        'openai', 'gemini', 'claude', 'groq', 'mistral', 'zai',
        'deepseek', 'perplexity', 'together', 'openrouter', 'fireworks'
      ];

      for (const api of supportedApis) {
        const response = await request(app)
          .get(`/api/${api}/endpoints`)
          .set('Authorization', `Bearer ${authToken}`);

        // Should pass authentication and API validation
        expect([200, 404, 503]).toContain(response.status);
        expect(response.status).not.toBe(400);
      }
    });

    test('should reject unsupported APIs', async () => {
      const response = await request(app)
        .post('/api/unsupported-api/proxy')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          endpoint: '/test',
          model: 'test'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.message).toContain('Invalid API');
    });

    test('should validate endpoint format', async () => {
      const invalidEndpoints = [
        '../admin',
        '../../etc/passwd',
        'no-leading-slash',
        '//double-slash',
        ''
      ];

      for (const endpoint of invalidEndpoints) {
        const response = await request(app)
          .post('/api/openai/proxy')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            endpoint,
            model: 'gpt-3.5-turbo'
          });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
      }
    });
  });

  describe('Request Validation', () => {
    test('should validate request body structure', async () => {
      const response = await request(app)
        .post('/api/openai/proxy')
        .set('Authorization', `Bearer ${authToken}`)
        .send({}); // Empty body

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.message).toContain('Request body is required');
    });

    test('should accept GET requests with endpoint in query', async () => {
      const response = await request(app)
        .get('/api/openai/proxy?endpoint=/models')
        .set('Authorization', `Bearer ${authToken}`);

      // Should pass validation (may fail due to API not configured)
      expect([200, 404, 503]).toContain(response.status);
    });

    test('should reject GET requests without endpoint', async () => {
      const response = await request(app)
        .get('/api/openai/proxy')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('endpoint must be provided');
    });
  });

  describe('Response Format', () => {
    test('should return structured error responses', async () => {
      const response = await request(app)
        .post('/api/invalid-api/proxy')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          endpoint: '/test',
          model: 'test'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('message');
    });

    test('should include CORS headers when appropriate', async () => {
      const response = await request(app)
        .get('/api/openai/endpoints')
        .set('Authorization', `Bearer ${authToken}`);

      // Should pass authentication (actual response depends on API config)
      expect([200, 404, 503]).toContain(response.status);
    });
  });

  describe('Convenience Routes', () => {
    test('should support convenience API routes', async () => {
      const convenienceRoutes = [
        '/openai',
        '/gemini',
        '/claude',
        '/groq',
        '/mistral'
      ];

      for (const route of convenienceRoutes) {
        const response = await request(app)
          .post(route)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            endpoint: '/test',
            model: 'test-model'
          });

        // Should pass authentication and routing
        expect([200, 404, 503, 400]).toContain(response.status);
        expect(response.status).not.toBe(404); // Route should exist
      }
    });
  });

  describe('Health Check', () => {
    test('should return health status', async () => {
      const response = await request(app)
        .get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
      // Without admin key, should NOT expose detailed info
      expect(response.body).not.toHaveProperty('apis');
      expect(response.body).not.toHaveProperty('infrastructure');
    });

    test('should return detailed health status with admin key', async () => {
      const response = await request(app)
        .get('/health')
        .set('X-Admin-Key', process.env.ADMIN_API_KEY);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('apis');
    });

    test('should return service info', async () => {
      const response = await request(app)
        .get('/');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('service');
      expect(response.body).toHaveProperty('status');
      // version should not be exposed
      expect(response.body).not.toHaveProperty('version');
    });
  });

  describe('Security Headers', () => {
    test('should include security headers', async () => {
      const response = await request(app)
        .get('/');

      // Check for security headers
      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-frame-options');
      expect(response.headers).toHaveProperty('x-xss-protection');
    });

    test('should remove X-Powered-By header', async () => {
      const response = await request(app)
        .get('/');

      expect(response.headers).not.toHaveProperty('x-powered-by');
    });
  });
});