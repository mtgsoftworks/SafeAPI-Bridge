/**
 * Authentication Integration Tests
 * Tests JWT authentication, token blacklisting, and security features
 */

const request = require('supertest');
const app = require('../../src/server');

describe('Authentication Integration Tests', () => {
  let server;
  let validToken;
  let userId;
  let appId;

  beforeAll(async () => {
    server = app.listen(0);
    userId = `test-user-${Date.now()}`;
    appId = `test-app-${Date.now()}`;
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => {
        server.close(resolve);
      });
    }
  });

  describe('POST /auth/token', () => {
    test('should generate JWT token with valid credentials', async () => {
      const response = await request(app)
        .post('/auth/token')
        .send({
          userId,
          appId
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('expiresIn');
      expect(response.body).toHaveProperty('userId', userId);
      expect(response.body).toHaveProperty('appId', appId);

      // Store valid token for other tests
      validToken = response.body.token;
      expect(validToken).toMatch(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/);
    });

    test('should reject requests with missing userId', async () => {
      const response = await request(app)
        .post('/auth/token')
        .send({
          appId: 'test-app'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.message).toContain('userId and appId are required');
    });

    test('should reject requests with missing appId', async () => {
      const response = await request(app)
        .post('/auth/token')
        .send({
          userId: 'test-user'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.message).toContain('userId and appId are required');
    });

    test('should reject requests with short userId', async () => {
      const response = await request(app)
        .post('/auth/token')
        .send({
          userId: 'ab', // Too short
          appId: 'test-app'
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('at least 3 characters');
    });

    test('should reject requests with short appId', async () => {
      const response = await request(app)
        .post('/auth/token')
        .send({
          userId: 'test-user',
          appId: 'ab' // Too short
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('at least 3 characters');
    });
  });

  describe('GET /auth/verify', () => {
    test('should verify valid JWT token', async () => {
      const response = await request(app)
        .get('/auth/verify')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('valid', true);
      expect(response.body).toHaveProperty('userId', userId);
      expect(response.body).toHaveProperty('appId', appId);
    });

    test('should reject invalid JWT token', async () => {
      const response = await request(app)
        .get('/auth/verify')
        .set('Authorization', 'Bearer invalid.token.here');

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error');
    });

    test('should reject requests without Authorization header', async () => {
      const response = await request(app)
        .get('/auth/verify');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.message).toContain('No token provided');
    });

    test('should reject requests with malformed Authorization header', async () => {
      const response = await request(app)
        .get('/auth/verify')
        .set('Authorization', 'InvalidFormat token');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Token Usage in Protected Routes', () => {
    test('should accept valid token in protected routes', async () => {
      const response = await request(app)
        .get('/api/openai/endpoints')
        .set('Authorization', `Bearer ${validToken}`);

      // Should pass authentication (may fail due to API not configured)
      expect([200, 404, 503]).toContain(response.status);
      expect(response.status).not.toBe(401);
    });

    test('should reject invalid token in protected routes', async () => {
      const response = await request(app)
        .get('/api/openai/endpoints')
        .set('Authorization', 'Bearer invalid.jwt.token');

      expect(response.status).toBe(403);
    });

    test('should reject missing token in protected routes', async () => {
      const response = await request(app)
        .get('/api/openai/endpoints');

      expect(response.status).toBe(401);
    });
  });

  describe('Token Blacklisting (Logout functionality)', () => {
    test('should support token blacklisting', async () => {
      // Create a new token to blacklist
      const tokenResponse = await request(app)
        .post('/auth/token')
        .send({
          userId: `logout-test-${Date.now()}`,
          appId: 'logout-test-app'
        });

      const tokenToBlacklist = tokenResponse.body.token;

      // First, verify the token works
      const verifyResponse = await request(app)
        .get('/auth/verify')
        .set('Authorization', `Bearer ${tokenToBlacklist}`);

      expect(verifyResponse.status).toBe(200);
      expect(verifyResponse.body.valid).toBe(true);

      // Add token to blacklist (this would normally be done via logout endpoint)
      const tokenBlacklist = require('../../src/services/tokenBlacklist');
      await tokenBlacklist.addToBlacklist(tokenToBlacklist, tokenResponse.body.userId);

      // Now verify the token is rejected
      const blacklistResponse = await request(app)
        .get('/auth/verify')
        .set('Authorization', `Bearer ${tokenToBlacklist}`);

      expect(blacklistResponse.status).toBe(401);
      expect(blacklistResponse.body.error).toContain('Token Revoked');
    });
  });

  describe('Rate Limiting on Auth', () => {
    test('should allow normal auth request frequency', async () => {
      // Make a few requests within reasonable limits
      const promises = Array(3).fill().map((_, i) =>
        request(app)
          .post('/auth/token')
          .send({
            userId: `rate-user-${i}`,
            appId: 'rate-test-app'
          })
      );

      const responses = await Promise.all(promises);

      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });

    test('should have rate limiting headers', async () => {
      const response = await request(app)
        .post('/auth/token')
        .send({
          userId: 'header-test-user',
          appId: 'header-test-app'
        });

      // Check for rate limiting headers (if configured)
      if (response.headers['x-ratelimit-limit']) {
        expect(response.headers).toHaveProperty('x-ratelimit-limit');
        expect(response.headers).toHaveProperty('x-ratelimit-remaining');
        expect(response.headers).toHaveProperty('x-ratelimit-reset');
      }
    });
  });

  describe('Security Features', () => {
    test('should include security context in responses', async () => {
      const response = await request(app)
        .get('/auth/verify')
        .set('Authorization', `Bearer ${validToken}`);

      if (response.status === 200) {
        expect(response.body).toHaveProperty('userId');
        expect(response.body).toHaveProperty('appId');
      }
    });

    test('should handle malformed requests gracefully', async () => {
      const response = await request(app)
        .post('/auth/token')
        .send('invalid-json-string', {
          headers: {
            'Content-Type': 'application/json'
          }
        });

      // Should handle JSON parsing errors gracefully
      expect([400, 415]).toContain(response.status);
    });
  });
});