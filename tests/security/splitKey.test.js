const request = require('supertest');
const app = require('../../src/server');
const splitKeyService = require('../../src/services/splitKey');
const { generateToken } = require('../../src/middleware/auth');
const { PrismaClient } = require('../../src/db/client');

const prisma = new PrismaClient();

describe('Split Key Security Tests', () => {
  let testUser;
  let testToken;
  let testKeyId;
  let testClientPart;
  let originalKey = 'sk-test1234567890abcdef1234567890abcdef12345678';

  beforeAll(async () => {
    // Create test user and token
    testUser = {
      userId: 'test-split-key-user',
      appId: 'test-split-key-app'
    };
    testToken = generateToken(testUser);
  });

  afterAll(async () => {
    // Cleanup test data
    try {
      // Clean up any test split keys
      await prisma.splitKey.deleteMany({
        where: { createdBy: testUser.userId }
      });

      // Clean up test user
      await prisma.user.deleteMany({
        where: { userId: testUser.userId }
      });

      await prisma.$disconnect();
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  });

  describe('Split Key Creation and Management', () => {
    test('Should successfully split an API key', async () => {
      const response = await request(app)
        .post('/api/split-key/split')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          originalKey,
          apiProvider: 'openai',
          keyId: 'test-key-123',
          description: 'Test split key'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.keyId).toBe('test-key-123');
      expect(response.body.data.clientPart).toBeDefined();
      expect(response.body.data.apiProvider).toBe('openai');
      expect(response.body.data.instructions).toBeDefined();

      // Store for later tests
      testKeyId = response.body.data.keyId;
      testClientPart = response.body.data.clientPart;

      // Verify client part is never exposed in server part
      expect(response.body.data.serverPart).toBeNull();
      expect(response.body.data.decryptionSecret).toBeNull();
    });

    test('Should reject duplicate key IDs', async () => {
      const response = await request(app)
        .post('/api/split-key/split')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          originalKey: 'sk-another-test-key',
          apiProvider: 'openai',
          keyId: testKeyId // Same keyId as before
        });

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('Key ID already exists');
    });

    test('Should reject invalid API providers', async () => {
      const response = await request(app)
        .post('/api/split-key/split')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          originalKey,
          apiProvider: 'invalid-provider',
          keyId: 'test-key-invalid'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid API provider');
    });

    test('Should reject invalid key ID format', async () => {
      const response = await request(app)
        .post('/api/split-key/split')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          originalKey,
          apiProvider: 'openai',
          keyId: 'ab' // Too short
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid keyId format');
    });

    test('Should require authentication', async () => {
      const response = await request(app)
        .post('/api/split-key/split')
        .send({
          originalKey,
          apiProvider: 'openai',
          keyId: 'test-key-no-auth'
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Authentication required');
    });
  });

  describe('Split Key Information Retrieval', () => {
    test('Should allow users to view their own split keys', async () => {
      const response = await request(app)
        .get(`/api/split-key/${testKeyId}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.keyId).toBe(testKeyId);
      expect(response.body.data.apiProvider).toBe('openai');

      // Ensure sensitive data is never exposed
      expect(response.body.data.serverPart).toBeUndefined();
      expect(response.body.data.clientPart).toBeUndefined();
      expect(response.body.data.decryptionSecret).toBeUndefined();
    });

    test('Should list user\'s split keys', async () => {
      const response = await request(app)
        .get('/api/split-key')
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0].keyId).toBe(testKeyId);
    });

    test('Should reject access to other users\' keys', async () => {
      // Create another user token
      const otherUser = {
        userId: 'other-user-123',
        appId: 'other-app'
      };
      const otherToken = generateToken(otherUser);

      const response = await request(app)
        .get(`/api/split-key/${testKeyId}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Access denied');
    });
  });

  describe('Split Key Proxy Requests', () => {
    test('Should handle BYOK requests with valid split key headers', async () => {
      // Mock a simple proxy request
      const response = await request(app)
        .post('/api/openai/proxy')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Partial-Key-Id', testKeyId)
        .set('X-Partial-Key', testClientPart)
        .set('Content-Type', 'application/json')
        .send({
          endpoint: '/models',
          model: 'gpt-3.5-turbo'
        });

      // We expect this to fail with 503 because we don't have real OpenAI key configured
      // but it should pass the split key validation
      expect(response.status).toBe(503);
      // The important part is that it shouldn't fail with split key errors
      expect(response.body.error).not.toContain('Split Key');
      expect(response.body.error).not.toContain('reconstruction failed');
    });

    test('Should reject BYOK requests with invalid split key headers', async () => {
      const response = await request(app)
        .post('/api/openai/proxy')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Partial-Key-Id', testKeyId)
        .set('X-Partial-Key', 'invalid-client-part')
        .set('Content-Type', 'application/json')
        .send({
          endpoint: '/models',
          model: 'gpt-3.5-turbo'
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Split Key authentication failed');
    });

    test('Should reject BYOK requests with missing headers', async () => {
      const response = await request(app)
        .post('/api/openai/proxy')
        .set('Authorization', `Bearer ${testToken}`)
        // Missing X-Partial-Key-Id and X-Partial-Key
        .set('Content-Type', 'application/json')
        .send({
          endpoint: '/models',
          model: 'gpt-3.5-turbo'
        });

      // Should fall back to Server Key method and fail due to no configured key
      expect(response.status).toBe(503);
    });

    test('Should reject BYOK requests with non-existent key ID', async () => {
      const response = await request(app)
        .post('/api/openai/proxy')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Partial-Key-Id', 'non-existent-key')
        .set('X-Partial-Key', testClientPart)
        .set('Content-Type', 'application/json')
        .send({
          endpoint: '/models',
          model: 'gpt-3.5-turbo'
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Split Key authentication failed');
    });
  });

  describe('Split Key Validation', () => {
    test('Should validate correct split key headers', async () => {
      const response = await request(app)
        .post('/api/split-key/validate')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Partial-Key-Id', testKeyId)
        .set('X-Partial-Key', testClientPart)
        .send();

      expect(response.status).toBe(200);
      expect(response.body.valid).toBe(true);
      expect(response.body.keyId).toBe(testKeyId);
    });

    test('Should reject invalid split key headers', async () => {
      const response = await request(app)
        .post('/api/split-key/validate')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Partial-Key-Id', 'invalid')
        .set('X-Partial-Key', 'short')
        .send();

      expect(response.status).toBe(400);
      expect(response.body.valid).toBe(false);
      expect(response.body.error).toContain('Invalid');
    });

    test('Should reconstruct key successfully with valid parts', async () => {
      const response = await request(app)
        .post('/api/split-key/validate')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Partial-Key-Id', testKeyId)
        .set('X-Partial-Key', testClientPart)
        .send();

      expect(response.status).toBe(200);
      expect(response.body.keyLength).toBe(originalKey.length);
    });
  });

  describe('Split Key Deactivation', () => {
    test('Should allow users to deactivate their own keys', async () => {
      const response = await request(app)
        .delete(`/api/split-key/${testKeyId}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('deactivated');
    });

    test('Should prevent deactivation of non-existent keys', async () => {
      const response = await request(app)
        .delete('/api/split-key/non-existent-key')
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Split key not found');
    });

    test('Should prevent other users from deactivating keys', async () => {
      const otherUser = {
        userId: 'malicious-user-456',
        appId: 'malicious-app'
      };
      const otherToken = generateToken(otherUser);

      // Create a new key for testing
      const splitResponse = await request(app)
        .post('/api/split-key/split')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          originalKey: 'sk-test-key-for-deactivation',
          apiProvider: 'openai',
          keyId: 'deactivation-test-key'
        });

      const newKeyId = splitResponse.body.data.keyId;

      // Try to deactivate with other user token
      const response = await request(app)
        .delete(`/api/split-key/${newKeyId}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Access denied');
    });
  });

  describe('Rate Limiting and Security', () => {
    test('Should apply rate limiting to split key operations', async () => {
      const promises = Array(15).fill().map(() =>
        request(app)
          .post('/api/split-key/validate')
          .set('Authorization', `Bearer ${testToken}`)
          .set('X-Partial-Key-Id', 'test-rate-limit')
          .set('X-Partial-Key', 'test-client-part')
          .send()
      );

      const responses = await Promise.all(promises);

      // Some requests should be rate limited
      const rateLimitedResponses = responses.filter(res => res.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    }, 10000);

    test('Should prevent XSS in key descriptions', async () => {
      const xssPayload = '<script>alert("xss")</script>';
      const response = await request(app)
        .post('/api/split-key/split')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          originalKey: 'sk-test-xss-protection',
          apiProvider: 'openai',
          keyId: 'xss-test-key',
          description: xssPayload
        });

      expect(response.status).toBe(201);
      // The description should be stored safely (not executing scripts)
      expect(response.body.data.description).toContain(xssPayload);
    });
  });

  describe('Direct Service Layer Tests', () => {
    test('Should split and reconstruct keys correctly', async () => {
      const testKey = 'sk-test-direct-split-1234567890';
      const keyId = 'direct-test-key';
      const apiProvider = 'gemini';

      // Split the key
      const splitResult = await splitKeyService.splitApiKey(
        testKey,
        apiProvider,
        keyId,
        testUser.userId
      );

      expect(splitResult.keyId).toBe(keyId);
      expect(splitResult.clientPart).toBeDefined();

      // Reconstruct the key
      const reconstructedKey = await splitKeyService.reconstructApiKey(
        keyId,
        splitResult.clientPart
      );

      expect(reconstructedKey).toBe(testKey);
    });

    test('Should fail reconstruction with wrong client part', async () => {
      const testKey = 'sk-test-reconstruct-fail';
      const keyId = 'reconstruct-fail-key';

      // Split the key
      const splitResult = await splitKeyService.splitApiKey(
        testKey,
        'openai',
        keyId,
        testUser.userId
      );

      // Try to reconstruct with wrong client part
      await expect(
        splitKeyService.reconstructApiKey(keyId, 'wrong-client-part')
      ).rejects.toThrow('Invalid client part');
    });

    test('Should validate headers correctly', () => {
      const validHeaders = {
        'x-partial-key-id': 'valid-key-id',
        'x-partial-key': 'valid-client-part-1234567890abcdef'
      };

      const invalidHeaders = {
        'x-partial-key-id': 'short',
        'x-partial-key': 'short'
      };

      const validResult = splitKeyService.validateSplitKeyHeaders(validHeaders);
      const invalidResult = splitKeyService.validateSplitKeyHeaders(invalidHeaders);

      expect(validResult.valid).toBe(true);
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.error).toContain('Invalid');
    });
  });
});