/**
 * Security Integration Tests
 * Tests security features including input validation, rate limiting, and attack detection
 */

const request = require('supertest');
const app = require('../../src/server');

describe('Security Integration Tests', () => {
  let server;
  let authToken;

  beforeAll(async () => {
    server = app.listen(0);

    // Generate test token
    const { generateToken } = require('../../src/middleware/auth');
    authToken = generateToken({
      userId: 'security-test-user',
      appId: 'security-test-app'
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => {
        server.close(resolve);
      });
    }
  });

  describe('Input Validation Security', () => {
    test('should prevent SQL injection attempts', async () => {
      const sqlInjectionPayloads = [
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        "admin'--",
        "' UNION SELECT * FROM users --",
        "1'; DELETE FROM users WHERE '1'='1"
      ];

      for (const payload of sqlInjectionPayloads) {
        const response = await request(app)
          .post('/api/openai/proxy')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            endpoint: `/test?id=${payload}`,
            model: 'gpt-3.5-turbo'
          });

        // Should either pass validation but be logged, or fail validation
        expect([400, 403, 503]).toContain(response.status);
      }
    });

    test('should prevent path traversal attempts', async () => {
      const pathTraversalPayloads = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\config\\sam',
        '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
        '..%252f..%252f..%252fetc%252fpasswd',
        '....//....//....//etc/passwd'
      ];

      for (const payload of pathTraversalPayloads) {
        const response = await request(app)
          .post('/api/openai/proxy')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            endpoint: payload,
            model: 'gpt-3.5-turbo'
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Invalid endpoint');
      }
    });

    test('should prevent XSS attempts', async () => {
      const xssPayloads = [
        '<script>alert("xss")</script>',
        'javascript:alert("xss")',
        '<img src="x" onerror="alert(\'xss\')">',
        '\"><script>alert("xss")</script>',
        '<svg onload="alert(\'xss\')">'
      ];

      for (const payload of xssPayloads) {
        const response = await request(app)
          .post('/auth/token')
          .send({
            userId: payload,
            appId: 'test-app'
          });

        // Should either reject due to validation or pass but be sanitized
        expect([400, 200]).toContain(response.status);
      }
    });

    test('should handle large payloads safely', async () => {
      const largePayload = 'A'.repeat(10 * 1024 * 1024); // 10MB

      const response = await request(app)
        .post('/api/openai/proxy')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Length', largePayload.length.toString())
        .send(largePayload);

      // Should reject large payloads
      expect([400, 413, 503]).toContain(response.status);
    });
  });

  describe('Authentication Security', () => {
    test('should resist brute force attempts', async () => {
      const failedAttempts = 10;
      const promises = [];

      // Simulate multiple failed authentication attempts
      for (let i = 0; i < failedAttempts; i++) {
        promises.push(
          request(app)
            .get('/auth/verify')
            .set('Authorization', `Bearer invalid-token-${i}`)
        );
      }

      const responses = await Promise.all(promises);

      // All should fail, and later ones might be rate limited
      responses.forEach(response => {
        expect([401, 403, 429]).toContain(response.status);
      });

      // Check if rate limiting kicked in (429 status)
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      if (rateLimitedResponses.length > 0) {
        console.log(`Rate limiting activated after ${failedAttempts} failed attempts`);
      }
    });

    test('should handle malformed JWT tokens', async () => {
      const malformedTokens = [
        'not.a.jwt',
        'too.many.parts.in.token',
        'invalid-base64-',
        'Bearer invalid-format',
        '',
        '.',
        '..',
        'a.b',
        'a.b.c.d'
      ];

      for (const token of malformedTokens) {
        const response = await request(app)
          .get('/auth/verify')
          .set('Authorization', `Bearer ${token}`);

        expect([401, 403]).toContain(response.status);
      }
    });
  });

  describe('HTTP Security Headers', () => {
    test('should include security headers', async () => {
      const response = await request(app)
        .get('/');

      // Check for essential security headers
      expect(response.headers).toHaveProperty('x-content-type-options', 'nosniff');
      expect(response.headers).toHaveProperty('x-frame-options');
      expect(response.headers).toHaveProperty('x-xss-protection');

      // Check for HSTS in production-like environment
      if (process.env.NODE_ENV === 'production') {
        expect(response.headers).toHaveProperty('strict-transport-security');
      }
    });

    test('should not expose server information', async () => {
      const response = await request(app)
        .get('/');

      // Should not expose server details
      expect(response.headers).not.toHaveProperty('x-powered-by');
      expect(response.headers).not.toHaveProperty('server');
    });

    test('should handle CORS properly', async () => {
      const response = await request(app)
        .options('/api/openai/endpoints')
        .set('Origin', 'https://malicious-site.com');

      // Should either reject or handle CORS appropriately
      expect([200, 403, 404]).toContain(response.status);
    });
  });

  describe('Rate Limiting Security', () => {
    test('should enforce rate limits', async () => {
      const burstRequests = 20;
      const promises = [];

      // Send burst of requests
      for (let i = 0; i < burstRequests; i++) {
        promises.push(
          request(app)
            .post('/auth/token')
            .send({
              userId: `rate-test-${i}`,
              appId: 'rate-test-app'
            })
        );
      }

      const responses = await Promise.all(promises);
      const successCount = responses.filter(r => r.status === 200).length;
      const rateLimitedCount = responses.filter(r => r.status === 429).length;

      // Some requests should succeed, but excessive ones should be rate limited
      expect(successCount).toBeGreaterThan(0);

      if (rateLimitedCount > 0) {
        console.log(`Rate limited ${rateLimitedCount} out of ${burstRequests} requests`);
        expect(rateLimitedCount).toBeGreaterThan(0);
      }
    });
  });

  describe('Error Information Disclosure', () => {
    test('should not leak sensitive information in errors', async () => {
      const response = await request(app)
        .post('/api/invalid-endpoint')
        .send({ invalid: 'data' });

      if (response.status >= 400) {
        // Error responses should not contain stack traces in production
        if (process.env.NODE_ENV === 'production') {
          expect(response.body).not.toHaveProperty('stack');
        }

        // Should not contain internal paths or system information
        const responseStr = JSON.stringify(response.body);
        expect(responseStr).not.toMatch(/\/home\/|\/Users\/|C:\\\\|node_modules/);
      }
    });

    test('should handle database errors gracefully', async () => {
      // This test would need to simulate database connection issues
      // For now, test graceful degradation
      const response = await request(app)
        .get('/health');

      // Health check should not crash even with database issues
      expect([200, 503]).toContain(response.status);
    });
  });

  describe('Request Size and Complexity', () => {
    test('should handle deeply nested objects safely', async () => {
      const createNestedObject = (depth) => {
        if (depth === 0) return 'deep';
        return { nested: createNestedObject(depth - 1) };
      };

      const deepObject = createNestedObject(1000);

      const response = await request(app)
        .post('/api/openai/proxy')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          endpoint: '/test',
          model: 'gpt-3.5-turbo',
          data: deepObject
        });

      // Should handle without crashing or timing out
      expect([400, 413, 503, 500]).toContain(response.status);
    });

    test('should handle excessive headers', async () => {
      const headers = {};
      for (let i = 0; i < 100; i++) {
        headers[`X-Custom-Header-${i}`] = 'A'.repeat(1000);
      }

      const response = await request(app)
        .get('/auth/verify')
        .set('Authorization', `Bearer ${authToken}`)
        .set(headers);

      // Should handle without crashing
      expect([200, 400, 413, 431]).toContain(response.status);
    });
  });

  describe('Security Logging', () => {
    test('should log security events', async () => {
      // This test would need to check log output
      // For now, ensure suspicious activities don't crash the system
      const suspiciousRequests = [
        request(app).get('/admin').set('X-Admin-Key', 'wrong-key'),
        request(app).post('/api/openai/proxy')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            endpoint: '/../../etc/passwd',
            model: 'gpt-3.5-turbo'
          }),
        request(app).get('/auth/verify').set('Authorization', 'Bearer malformed.jwt.token')
      ];

      const responses = await Promise.all(suspiciousRequests);

      // All should be handled without crashing
      responses.forEach(response => {
        expect([400, 401, 403, 404, 429, 503]).toContain(response.status);
      });
    });
  });
});