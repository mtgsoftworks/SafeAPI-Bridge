/**
 * Performance and Load Tests
 * Tests system performance under various load conditions
 */

const request = require('supertest');

// Conditional imports to prevent test suite failures
let app, generateToken;
try {
  app = require('../../src/server');
  generateToken = require('../../src/middleware/auth').generateToken;
} catch (error) {
  console.warn('Performance test setup failed:', error.message);
}

describe('Performance Tests', () => {
  let server;
  let authToken;
  const concurrentRequests = 50;
  const testDuration = 5000; // 5 seconds

  beforeAll(async () => {
    if (!app) return;
    server = app.listen(0);
    authToken = generateToken({
      userId: 'perf-test-user',
      appId: 'perf-test-app'
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => {
        server.close(resolve);
      });
    }
  });

  describe('Authentication Performance', () => {
    test('should handle concurrent token generation', async () => {
      const startTime = Date.now();

      const promises = Array(concurrentRequests).fill().map((_, i) =>
        request(app)
          .post('/auth/token')
          .send({
            userId: `perf-user-${i}`,
            appId: 'perf-test-app'
          })
      );

      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('token');
      });

      // Performance assertions
      expect(totalTime).toBeLessThan(2000); // Should complete within 2 seconds
      console.log(`Generated ${concurrentRequests} tokens in ${totalTime}ms`);
    });

    test('should handle concurrent token verification', async () => {
      const promises = Array(concurrentRequests).fill().map(() =>
        request(app)
          .get('/auth/verify')
          .set('Authorization', `Bearer ${authToken}`)
      );

      const startTime = Date.now();
      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Performance assertions
      expect(totalTime).toBeLessThan(1500); // Should complete within 1.5 seconds
      console.log(`Verified ${concurrentRequests} tokens in ${totalTime}ms`);
    });
  });

  describe('Proxy Route Performance', () => {
    test('should handle concurrent endpoint requests', async () => {
      const promises = Array(concurrentRequests).fill().map(() =>
        request(app)
          .get('/api/openai/endpoints')
          .set('Authorization', `Bearer ${authToken}`)
      );

      const startTime = Date.now();
      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // All requests should pass authentication (may fail due to API config)
      responses.forEach(response => {
        expect([200, 404, 503]).toContain(response.status);
      });

      // Performance assertions
      expect(totalTime).toBeLessThan(3000); // Should complete within 3 seconds
      console.log(`Processed ${concurrentRequests} endpoint requests in ${totalTime}ms`);
    });
  });

  describe('Memory Usage', () => {
    test('should maintain stable memory usage under load', async () => {
      const initialMemory = process.memoryUsage();

      // Generate load
      for (let i = 0; i < 5; i++) {
        const promises = Array(20).fill().map((_, index) =>
          request(app)
            .post('/auth/token')
            .send({
              userId: `memory-user-${i}-${index}`,
              appId: 'memory-test-app'
            })
        );
        await Promise.all(promises);
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage();
      const heapIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const heapIncreaseMB = heapIncrease / 1024 / 1024;

      // Memory should not increase dramatically
      expect(heapIncreaseMB).toBeLessThan(50); // Less than 50MB increase
      console.log(`Memory increase: ${heapIncreaseMB.toFixed(2)}MB`);
    });
  });

  describe('Response Time Consistency', () => {
    test('should maintain consistent response times', async () => {
      const responseTimes = [];
      const sampleSize = 30;

      for (let i = 0; i < sampleSize; i++) {
        const startTime = process.hrtime.bigint();

        await request(app)
          .get('/auth/verify')
          .set('Authorization', `Bearer ${authToken}`);

        const endTime = process.hrtime.bigint();
        const responseTime = Number(endTime - startTime) / 1000000; // Convert to milliseconds
        responseTimes.push(responseTime);
      }

      const averageTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const maxTime = Math.max(...responseTimes);
      const minTime = Math.min(...responseTimes);

      // Performance assertions
      expect(averageTime).toBeLessThan(100); // Average under 100ms
      expect(maxTime).toBeLessThan(500); // Max under 500ms

      console.log(`Response times - Avg: ${averageTime.toFixed(2)}ms, Min: ${minTime.toFixed(2)}ms, Max: ${maxTime.toFixed(2)}ms`);
    });
  });

  describe('Health Check Performance', () => {
    test('should respond quickly to health checks', async () => {
      const promises = Array(concurrentRequests).fill().map(() =>
        request(app).get('/health')
      );

      const startTime = Date.now();
      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // All health checks should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Health checks should be very fast
      expect(totalTime).toBeLessThan(1000); // Should complete within 1 second
      console.log(`Processed ${concurrentRequests} health checks in ${totalTime}ms`);
    });
  });

  describe('Error Handling Performance', () => {
    test('should handle invalid requests efficiently', async () => {
      const promises = Array(concurrentRequests).fill().map((_, i) =>
        request(app)
          .get(`/auth/verify`)
          .set('Authorization', `Bearer invalid-token-${i}`)
      );

      const startTime = Date.now();
      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // All requests should be rejected efficiently
      responses.forEach(response => {
        expect(response.status).toBe(403);
      });

      // Error handling should be fast
      expect(totalTime).toBeLessThan(2000); // Should complete within 2 seconds
      console.log(`Rejected ${concurrentRequests} invalid tokens in ${totalTime}ms`);
    });
  });

  describe('Concurrent Mixed Workload', () => {
    test('should handle mixed concurrent requests', async () => {
      const promises = [];

      // Mix of different request types
      for (let i = 0; i < concurrentRequests; i++) {
        switch (i % 4) {
          case 0:
            // Health check
            promises.push(request(app).get('/health'));
            break;
          case 1:
            // Token generation
            promises.push(
              request(app)
                .post('/auth/token')
                .send({
                  userId: `mixed-user-${i}`,
                  appId: 'mixed-test-app'
                })
            );
            break;
          case 2:
            // Token verification
            promises.push(
              request(app)
                .get('/auth/verify')
                .set('Authorization', `Bearer ${authToken}`)
            );
            break;
          case 3:
            // API endpoint check
            promises.push(
              request(app)
                .get('/api/openai/endpoints')
                .set('Authorization', `Bearer ${authToken}`)
            );
            break;
        }
      }

      const startTime = Date.now();
      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Most requests should succeed or fail appropriately
      const successCount = responses.filter(r => r.status === 200).length;
      const authSuccessCount = responses.filter(r =>
        [200, 404, 503].includes(r.status)
      ).length;

      expect(successCount + authSuccessCount).toBeGreaterThan(concurrentRequests * 0.8);

      // Mixed workload should complete in reasonable time
      expect(totalTime).toBeLessThan(5000); // Should complete within 5 seconds
      console.log(`Processed ${concurrentRequests} mixed requests in ${totalTime}ms`);
    });
  });
});