/**
 * Unit Tests for Usage Tracking Service
 */

// Mock dependencies
jest.mock('../../src/models/Usage', () => ({
  log: jest.fn()
}));

jest.mock('../../src/models/User', () => ({
  incrementRequests: jest.fn(),
  findByUserId: jest.fn()
}));

jest.mock('../../src/services/webhook', () => ({
  trigger: jest.fn()
}));

jest.mock('../../src/db/client', () => ({
  user: {
    update: jest.fn()
  }
}));

jest.mock('../../src/utils/securityLogger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

jest.mock('../../src/config/constants', () => ({
  USAGE: {
    COST_ESTIMATION_MULTIPLIERS: {
      openai: 0.002,
      gemini: 0.001,
      claude: 0.003,
      default: 0.001
    },
    USAGE_THRESHOLD_PERCENTAGE: 0.8
  }
}));

const UsageTrackingService = require('../../src/services/usage');
const UsageModel = require('../../src/models/Usage');
const UserModel = require('../../src/models/User');
const webhookService = require('../../src/services/webhook');
const prisma = require('../../src/db/client');

describe('UsageTrackingService', () => {
  const mockReq = {
    ip: '127.0.0.1',
    connection: { remoteAddress: '127.0.0.1' },
    headers: { 'user-agent': 'TestAgent/1.0' }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.LIGHT_MODE;
  });

  describe('trackRequest', () => {
    it('should track request in normal mode', async () => {
      UsageModel.log.mockResolvedValue({});
      UserModel.incrementRequests.mockResolvedValue({});
      prisma.user.update.mockResolvedValue({});
      UserModel.findByUserId.mockResolvedValue({
        userId: 'user-123',
        dailyQuota: 1000,
        monthlyQuota: 30000,
        requestsToday: 100,
        requestsMonth: 1000
      });

      const result = await UsageTrackingService.trackRequest({
        userId: 'user-123',
        api: 'openai',
        endpoint: '/chat/completions',
        method: 'POST',
        statusCode: 200,
        success: true,
        responseTime: 150,
        req: mockReq,
        responseData: { usage: { total_tokens: 100 } }
      });

      expect(UsageModel.log).toHaveBeenCalled();
      expect(UserModel.incrementRequests).toHaveBeenCalledWith('user-123');
      expect(result.tokensUsed).toBe(100);
      expect(result.estimatedCost).toBeCloseTo(0.0002, 4);
    });

    it('should skip detailed tracking in light mode', async () => {
      process.env.LIGHT_MODE = 'true';
      UserModel.incrementRequests.mockResolvedValue({});

      const result = await UsageTrackingService.trackRequest({
        userId: 'user-123',
        api: 'openai',
        endpoint: '/chat/completions',
        method: 'POST',
        statusCode: 200,
        success: true,
        responseTime: 150,
        req: mockReq
      });

      expect(UsageModel.log).not.toHaveBeenCalled();
      expect(UserModel.incrementRequests).toHaveBeenCalled();
      expect(result.tokensUsed).toBe(0);
      expect(result.estimatedCost).toBe(0);
    });

    it('should always increment request counter', async () => {
      UserModel.incrementRequests.mockResolvedValue({});
      process.env.LIGHT_MODE = 'true';

      await UsageTrackingService.trackRequest({
        userId: 'user-123',
        api: 'openai',
        endpoint: '/chat/completions',
        method: 'POST',
        statusCode: 200,
        success: true,
        responseTime: 150,
        req: mockReq
      });

      expect(UserModel.incrementRequests).toHaveBeenCalledWith('user-123');
    });
  });

  describe('estimateCost', () => {
    it('should estimate cost for OpenAI response', () => {
      const responseData = {
        usage: { total_tokens: 1000 }
      };

      const result = UsageTrackingService.estimateCost('openai', responseData);

      expect(result.tokensUsed).toBe(1000);
      expect(result.estimatedCost).toBeCloseTo(0.002, 4);
    });

    it('should estimate cost for Gemini response', () => {
      const responseData = {
        usageMetadata: { totalTokenCount: 500 }
      };

      const result = UsageTrackingService.estimateCost('gemini', responseData);

      expect(result.tokensUsed).toBe(500);
      expect(result.estimatedCost).toBeCloseTo(0.0005, 5);
    });

    it('should estimate cost for Claude response', () => {
      const responseData = {
        usage: { input_tokens: 200, output_tokens: 300 }
      };

      const result = UsageTrackingService.estimateCost('claude', responseData);

      expect(result.tokensUsed).toBe(500);
      expect(result.estimatedCost).toBeCloseTo(0.0015, 5);
    });

    it('should estimate cost for Groq and other OpenAI-like providers', () => {
      const responseData = {
        usage: { total_tokens: 1000 }
      };

      const result = UsageTrackingService.estimateCost('groq', responseData);

      expect(result.tokensUsed).toBe(1000);
      expect(result.estimatedCost).toBeCloseTo(0.001, 4);
    });

    it('should return zero for null response', () => {
      const result = UsageTrackingService.estimateCost('openai', null);

      expect(result.tokensUsed).toBe(0);
      expect(result.estimatedCost).toBe(0);
    });

    it('should return zero for response without usage data', () => {
      const result = UsageTrackingService.estimateCost('openai', { data: 'some data' });

      expect(result.tokensUsed).toBe(0);
      expect(result.estimatedCost).toBe(0);
    });

    it('should handle missing token counts gracefully', () => {
      const responseData = { usage: {} };

      const result = UsageTrackingService.estimateCost('openai', responseData);

      expect(result.tokensUsed).toBe(0);
      expect(result.estimatedCost).toBe(0);
    });
  });

  describe('updateUserCost', () => {
    it('should update user total cost', async () => {
      prisma.user.update.mockResolvedValue({});

      await UsageTrackingService.updateUserCost('user-123', 0.05);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        data: {
          totalCost: { increment: 0.05 }
        }
      });
    });

    it('should handle update errors gracefully', async () => {
      prisma.user.update.mockRejectedValue(new Error('DB error'));

      // Should not throw
      await UsageTrackingService.updateUserCost('user-123', 0.05);
    });
  });

  describe('checkUsageThresholds', () => {
    it('should trigger daily usage webhook at threshold', async () => {
      UserModel.findByUserId.mockResolvedValue({
        userId: 'user-123',
        dailyQuota: 100,
        monthlyQuota: 3000,
        requestsToday: 80, // Exactly at 80% threshold
        requestsMonth: 100
      });

      await UsageTrackingService.checkUsageThresholds('user-123');

      expect(webhookService.trigger).toHaveBeenCalledWith('usage.high',
        expect.objectContaining({
          userId: 'user-123',
          type: 'daily',
          usage: 80,
          quota: 100
        })
      );
    });

    it('should trigger monthly usage webhook at threshold', async () => {
      UserModel.findByUserId.mockResolvedValue({
        userId: 'user-123',
        dailyQuota: 1000,
        monthlyQuota: 1000,
        requestsToday: 50,
        requestsMonth: 800 // Exactly at 80% threshold
      });

      await UsageTrackingService.checkUsageThresholds('user-123');

      expect(webhookService.trigger).toHaveBeenCalledWith('usage.high',
        expect.objectContaining({
          userId: 'user-123',
          type: 'monthly',
          usage: 800,
          quota: 1000
        })
      );
    });

    it('should not trigger webhook below threshold', async () => {
      UserModel.findByUserId.mockResolvedValue({
        userId: 'user-123',
        dailyQuota: 100,
        monthlyQuota: 3000,
        requestsToday: 50, // Below 80%
        requestsMonth: 100 // Below 80%
      });

      await UsageTrackingService.checkUsageThresholds('user-123');

      expect(webhookService.trigger).not.toHaveBeenCalled();
    });

    it('should handle threshold check errors gracefully', async () => {
      UserModel.findByUserId.mockRejectedValue(new Error('DB error'));

      // Should not throw
      await UsageTrackingService.checkUsageThresholds('user-123');
    });
  });
});
