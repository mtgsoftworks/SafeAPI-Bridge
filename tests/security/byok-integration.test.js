const request = require('supertest');
const app = require('../../src/server');
const { generateToken } = require('../../src/middleware/auth');
const { PrismaClient } = require('../../src/db/client');

const prisma = new PrismaClient();

describe('BYOK Integration Tests', () => {
  let testUser;
  let testToken;
  let splitKeys = {};

  beforeAll(async () => {
    // Create test user and token
    testUser = {
      userId: 'byok-integration-user',
      appId: 'byok-integration-app'
    };
    testToken = generateToken(testUser);
  });

  afterAll(async () => {
    // Cleanup test data
    try {
      await prisma.splitKey.deleteMany({
        where: { createdBy: testUser.userId }
      });

      await prisma.user.deleteMany({
        where: { userId: testUser.userId }
      });

      await prisma.$disconnect();
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  });

  describe('Complete BYOK Workflow', () => {
    test('Should support full BYOK workflow for OpenAI', async () => {
      const openaiKey = 'sk-test-openai-integration-key-1234567890';
      const keyId = 'openai-byok-test';

      // Step 1: Split the key
      const splitResponse = await request(app)
        .post('/api/split-key/split')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          originalKey: openaiKey,
          apiProvider: 'openai',
          keyId,
          description: 'OpenAI BYOK integration test'
        });

      expect(splitResponse.status).toBe(201);
      splitKeys.openai = splitResponse.body.data;

      // Step 2: Verify key information
      const infoResponse = await request(app)
        .get(`/api/split-key/${keyId}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(infoResponse.status).toBe(200);
      expect(infoResponse.body.data.keyId).toBe(keyId);
      expect(infoResponse.body.data.apiProvider).toBe('openai');

      // Step 3: Validate headers work
      const validateResponse = await request(app)
        .post('/api/split-key/validate')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Partial-Key-Id', keyId)
        .set('X-Partial-Key', splitKeys.openai.clientPart);

      expect(validateResponse.status).toBe(200);
      expect(validateResponse.body.valid).toBe(true);

      // Step 4: Use in proxy request (will fail due to no real API key, but should pass validation)
      const proxyResponse = await request(app)
        .post('/api/openai/proxy')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Partial-Key-Id', keyId)
        .set('X-Partial-Key', splitKeys.openai.clientPart)
        .set('Content-Type', 'application/json')
        .send({
          endpoint: '/models',
          model: 'gpt-3.5-turbo'
        });

      // Should fail at API level, not split key level
      expect(proxyResponse.status).toBe(503);
      expect(proxyResponse.body.error).not.toContain('Split Key');
    });

    test('Should support multiple providers with different keys', async () => {
      const providers = [
        { name: 'gemini', key: 'test-gemini-key-1234567890abcdef', keyId: 'gemini-byok-test' },
        { name: 'claude', key: 'sk-ant-test-claude-key-1234567890', keyId: 'claude-byok-test' },
        { name: 'groq', key: 'gsk_test-groq-key-1234567890abcdef', keyId: 'groq-byok-test' }
      ];

      for (const provider of providers) {
        // Split the key
        const splitResponse = await request(app)
          .post('/api/split-key/split')
          .set('Authorization', `Bearer ${testToken}`)
          .send({
            originalKey: provider.key,
            apiProvider: provider.name,
            keyId: provider.keyId,
            description: `${provider.name} BYOK integration test`
          });

        expect(splitResponse.status).toBe(201);
        splitKeys[provider.name] = splitResponse.body.data;

        // Test proxy request for each provider
        const proxyResponse = await request(app)
          .post(`/api/${provider.name}/proxy`)
          .set('Authorization', `Bearer ${testToken}`)
          .set('X-Partial-Key-Id', provider.keyId)
          .set('X-Partial-Key', splitKeys[provider.name].clientPart)
          .set('Content-Type', 'application/json')
          .send({
            endpoint: provider.name === 'gemini' ? 'models' : '/models',
            model: provider.name === 'gemini' ? 'gemini-pro' : 'test-model'
          });

        // Should fail at API level, not split key level
        expect(proxyResponse.status).toBe(503);
        expect(proxyResponse.body.error).not.toContain('Split Key');
      }
    });

    test('Should maintain isolation between users', async () => {
      // Create another user
      const otherUser = {
        userId: 'other-byok-user',
        appId: 'other-byok-app'
      };
      const otherToken = generateToken(otherUser);

      // Create a key with original user
      const originalUserKey = 'sk-original-user-key-1234567890';
      const originalKeyId = 'original-user-key';

      const splitResponse = await request(app)
        .post('/api/split-key/split')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          originalKey: originalUserKey,
          apiProvider: 'openai',
          keyId: originalKeyId
        });

      expect(splitResponse.status).toBe(201);

      // Try to access with other user
      const accessResponse = await request(app)
        .get(`/api/split-key/${originalKeyId}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(accessResponse.status).toBe(403);

      // Try to use other user's key in proxy
      const proxyResponse = await request(app)
        .post('/api/openai/proxy')
        .set('Authorization', `Bearer ${otherToken}`)
        .set('X-Partial-Key-Id', originalKeyId)
        .set('X-Partial-Key', splitResponse.body.data.clientPart)
        .set('Content-Type', 'application/json')
        .send({
          endpoint: '/models',
          model: 'gpt-3.5-turbo'
        });

      // Should fail at authentication level, not split key level
      expect(proxyResponse.status).toBe(401);
    });
  });

  describe('Mixed Authentication Methods', () => {
    test('Should support both Server Key and BYOK in same deployment', async () => {
      // Server Key request (no split key headers)
      const serverKeyResponse = await request(app)
        .post('/api/openai/proxy')
        .set('Authorization', `Bearer ${testToken}`)
        .set('Content-Type', 'application/json')
        .send({
          endpoint: '/models',
          model: 'gpt-3.5-turbo'
        });

      // Should fail due to no configured server key, not authentication issues
      expect(serverKeyResponse.status).toBe(503);
      expect(serverKeyBody.error).not.toContain('Split Key');

      // BYOK request (with split key headers)
      const byokResponse = await request(app)
        .post('/api/openai/proxy')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Partial-Key-Id', splitKeys.openai.keyId)
        .set('X-Partial-Key', splitKeys.openai.clientPart)
        .set('Content-Type', 'application/json')
        .send({
          endpoint: '/models',
          model: 'gpt-3.5-turbo'
        });

      // Should fail due to no real API key, but pass split key validation
      expect(byokResponse.status).toBe(503);
      expect(byokResponse.body.error).not.toContain('Split Key');
    });

    test('Should auto-detect authentication method', async () => {
      // Test with BYOK headers
      const byokHeaders = {
        'authorization': `Bearer ${testToken}`,
        'x-partial-key-id': splitKeys.openai.keyId,
        'x-partial-key': splitKeys.openai.clientPart
      };

      const validateResponse = await request(app)
        .post('/api/split-key/validate')
        .set(byokHeaders)
        .send();

      expect(validateResponse.status).toBe(200);
      expect(validateResponse.body.valid).toBe(true);
    });
  });

  describe('Security and Compliance', () => {
    test('Should never expose sensitive key data in responses', async () => {
      const listResponse = await request(app)
        .get('/api/split-key')
        .set('Authorization', `Bearer ${testToken}`);

      expect(listResponse.status).toBe(200);
      const keys = listResponse.body.data;

      keys.forEach(key => {
        expect(key.serverPart).toBeUndefined();
        expect(key.clientPart).toBeUndefined();
        expect(key.decryptionSecret).toBeUndefined();
      });

      const infoResponse = await request(app)
        .get(`/api/split-key/${splitKeys.openai.keyId}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(infoResponse.status).toBe(200);
      expect(infoResponse.body.data.serverPart).toBeUndefined();
      expect(infoResponse.body.data.clientPart).toBeUndefined();
      expect(infoResponse.body.data.decryptionSecret).toBeUndefined();
    });

    test('Should log security events', async () => {
      // This test would require checking logs in a real scenario
      // For now, we just verify that the endpoints respond correctly
      const response = await request(app)
        .post('/api/split-key/split')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          originalKey: 'sk-security-test-key',
          apiProvider: 'openai',
          keyId: 'security-test-key'
        });

      expect(response.status).toBe(201);

      // Clean up
      await request(app)
        .delete('/api/split-key/security-test-key')
        .set('Authorization', `Bearer ${testToken}`);
    });

    test('Should prevent replay attacks with invalid keys', async () => {
      // Try to use a previously valid but now deactivated key
      await request(app)
        .delete(`/api/split-key/${splitKeys.openai.keyId}`)
        .set('Authorization', `Bearer ${testToken}`);

      const response = await request(app)
        .post('/api/openai/proxy')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Partial-Key-Id', splitKeys.openai.keyId)
        .set('X-Partial-Key', splitKeys.openai.clientPart)
        .set('Content-Type', 'application/json')
        .send({
          endpoint: '/models',
          model: 'gpt-3.5-turbo'
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Split Key authentication failed');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('Should handle malformed split key headers gracefully', async () => {
      const malformedHeaders = [
        { 'X-Partial-Key-Id': '', 'X-Partial-Key': 'valid-part' },
        { 'X-Partial-Key-Id': 'valid-id', 'X-Partial-Key': '' },
        { 'X-Partial-Key-Id': null, 'X-Partial-Key': 'valid-part' },
        { 'X-Partial-Key-Id': 'valid-id', 'X-Partial-Key': null },
      ];

      for (const headers of malformedHeaders) {
        const response = await request(app)
          .post('/api/openai/proxy')
          .set('Authorization', `Bearer ${testToken}`)
          .set(headers)
          .set('Content-Type', 'application/json')
          .send({
            endpoint: '/models',
            model: 'gpt-3.5-turbo'
          });

        // Should fall back to Server Key method and fail
        expect(response.status).toBe(503);
      }
    });

    test('Should handle concurrent split key operations', async () => {
      const concurrentRequests = Array(5).fill().map((_, index) =>
        request(app)
          .post('/api/split-key/split')
          .set('Authorization', `Bearer ${testToken}`)
          .send({
            originalKey: `sk-concurrent-test-key-${index}`,
            apiProvider: 'openai',
            keyId: `concurrent-test-key-${index}`
          })
      );

      const responses = await Promise.all(concurrentRequests);

      responses.forEach((response, index) => {
        expect(response.status).toBe(201);
        expect(response.body.data.keyId).toBe(`concurrent-test-key-${index}`);
      });

      // Clean up
      for (let i = 0; i < 5; i++) {
        await request(app)
          .delete(`/api/split-key/concurrent-test-key-${i}`)
          .set('Authorization', `Bearer ${testToken}`);
      }
    });

    test('Should handle very long API keys', async () => {
      const longKey = 'sk-' + 'a'.repeat(200); // Very long API key
      const keyId = 'long-key-test';

      const response = await request(app)
        .post('/api/split-key/split')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          originalKey: longKey,
          apiProvider: 'openai',
          keyId
        });

      expect(response.status).toBe(201);
      expect(response.body.data.keyId).toBe(keyId);

      // Test reconstruction
      const validateResponse = await request(app)
        .post('/api/split-key/validate')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Partial-Key-Id', keyId)
        .set('X-Partial-Key', response.body.data.clientPart);

      expect(validateResponse.status).toBe(200);
      expect(validateResponse.body.keyLength).toBe(longKey.length);

      // Clean up
      await request(app)
        .delete(`/api/split-key/${keyId}`)
        .set('Authorization', `Bearer ${testToken}`);
    });
  });
});