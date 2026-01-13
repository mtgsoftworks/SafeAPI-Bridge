/**
 * Database Client Unit Tests
 * Tests for src/db/client.js
 */

// Mock PrismaClient before requiring the module
jest.mock('@prisma/client', () => {
  const mockPrismaClient = jest.fn().mockImplementation(() => ({
    $queryRaw: jest.fn(),
    $disconnect: jest.fn().mockResolvedValue(undefined)
  }));
  return { PrismaClient: mockPrismaClient };
});

jest.mock('../../src/config/constants', () => ({
  DATABASE: {
    CONNECTION_POOL_MIN: 2,
    CONNECTION_POOL_MAX: 10,
    QUERY_TIMEOUT_MS: 5000,
    IDLE_TIMEOUT_MS: 60000
  }
}));

jest.mock('../../src/utils/securityLogger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

describe('Database Client', () => {
  let dbClient;
  let originalEnv;

  beforeEach(() => {
    jest.resetModules();
    originalEnv = { ...process.env };
    process.env.DATABASE_URL = 'file:./test.db';
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('Module Export', () => {
    it('should export prisma client instance', () => {
      dbClient = require('../../src/db/client');
      expect(dbClient).toBeDefined();
    });

    it('should export checkDatabaseHealth function', () => {
      dbClient = require('../../src/db/client');
      expect(dbClient.checkDatabaseHealth).toBeDefined();
      expect(typeof dbClient.checkDatabaseHealth).toBe('function');
    });

    it('should export getConnectionMetrics function', () => {
      dbClient = require('../../src/db/client');
      expect(dbClient.getConnectionMetrics).toBeDefined();
      expect(typeof dbClient.getConnectionMetrics).toBe('function');
    });

    it('should export disconnectPrisma function', () => {
      dbClient = require('../../src/db/client');
      expect(dbClient.disconnectPrisma).toBeDefined();
      expect(typeof dbClient.disconnectPrisma).toBe('function');
    });
  });

  describe('checkDatabaseHealth', () => {
    it('should return healthy status when query succeeds', async () => {
      dbClient = require('../../src/db/client');
      dbClient.$queryRaw = jest.fn().mockResolvedValue([{ 1: 1 }]);

      const result = await dbClient.checkDatabaseHealth();

      expect(result.status).toBe('healthy');
      expect(result.latency).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });

    it('should return unhealthy status when query fails', async () => {
      dbClient = require('../../src/db/client');
      dbClient.$queryRaw = jest.fn().mockRejectedValue(new Error('Connection failed'));

      const result = await dbClient.checkDatabaseHealth();

      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('Connection failed');
      expect(result.timestamp).toBeDefined();
    });

    it('should measure latency correctly', async () => {
      dbClient = require('../../src/db/client');
      dbClient.$queryRaw = jest.fn().mockImplementation(() => {
        return new Promise(resolve => setTimeout(() => resolve([{ 1: 1 }]), 10));
      });

      const result = await dbClient.checkDatabaseHealth();

      expect(result.status).toBe('healthy');
      expect(result.latency).toMatch(/\d+ms/);
    });
  });

  describe('getConnectionMetrics', () => {
    it('should return connection status', () => {
      dbClient = require('../../src/db/client');

      const metrics = dbClient.getConnectionMetrics();

      expect(metrics.clientConnected).toBe(true);
      expect(metrics.timestamp).toBeDefined();
    });

    it('should indicate database URL configuration status', () => {
      dbClient = require('../../src/db/client');

      const metrics = dbClient.getConnectionMetrics();

      expect(metrics.databaseUrl).toBe('configured');
    });

    it('should indicate when database URL is not configured', () => {
      delete process.env.DATABASE_URL;
      jest.resetModules();

      // Re-mock before requiring
      jest.mock('@prisma/client', () => {
        const mockPrismaClient = jest.fn().mockImplementation(() => ({
          $queryRaw: jest.fn(),
          $disconnect: jest.fn().mockResolvedValue(undefined)
        }));
        return { PrismaClient: mockPrismaClient };
      });

      dbClient = require('../../src/db/client');
      const metrics = dbClient.getConnectionMetrics();

      expect(metrics.databaseUrl).toBe('not configured');
    });
  });

  describe('disconnectPrisma', () => {
    it('should disconnect successfully', async () => {
      dbClient = require('../../src/db/client');
      dbClient.$disconnect = jest.fn().mockResolvedValue(undefined);

      await expect(dbClient.disconnectPrisma()).resolves.not.toThrow();
    });

    it('should handle disconnect errors gracefully', async () => {
      dbClient = require('../../src/db/client');
      dbClient.$disconnect = jest.fn().mockRejectedValue(new Error('Disconnect failed'));

      await expect(dbClient.disconnectPrisma()).resolves.not.toThrow();
    });

    it('should handle disconnect timeout', async () => {
      dbClient = require('../../src/db/client');
      dbClient.$disconnect = jest.fn().mockImplementation(() => {
        return new Promise((resolve) => setTimeout(resolve, 10000));
      });

      // This should not hang - timeout should trigger
      const startTime = Date.now();
      await dbClient.disconnectPrisma();
      const elapsed = Date.now() - startTime;

      // Should complete within timeout (5000ms) + buffer
      expect(elapsed).toBeLessThan(6000);
    }, 10000);
  });

  describe('Configuration', () => {
    it('should use development logging in non-production', () => {
      process.env.NODE_ENV = 'development';
      jest.resetModules();

      const { PrismaClient } = require('@prisma/client');
      require('../../src/db/client');

      expect(PrismaClient).toHaveBeenCalled();
    });

    it('should configure for PostgreSQL when DATABASE_URL contains postgresql', () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
      process.env.NODE_ENV = 'production';
      jest.resetModules();

      const { PrismaClient } = require('@prisma/client');
      require('../../src/db/client');

      expect(PrismaClient).toHaveBeenCalled();
    });
  });
});
