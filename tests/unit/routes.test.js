/**
 * Routes Unit Tests
 * Tests for route configuration and middleware chains
 */

describe('Route Configuration', () => {
  describe('Auth Routes', () => {
    let authRoutes;

    beforeEach(() => {
      jest.resetModules();
      // Mock dependencies
      jest.mock('../../src/middleware/auth', () => ({
        generateToken: jest.fn(() => 'mock-token'),
        authenticateToken: jest.fn((req, res, next) => next())
      }));
      jest.mock('../../src/utils/validator', () => ({
        validateAuthRequest: jest.fn((req, res, next) => next())
      }));
      jest.mock('../../src/middleware/rateLimiter', () => ({
        authLimiter: jest.fn((req, res, next) => next())
      }));
      jest.mock('../../src/models/User', () => ({
        findOrCreate: jest.fn().mockResolvedValue({
          userId: 'test-user',
          appId: 'test-app',
          dailyQuota: 100,
          monthlyQuota: 3000,
          requestsToday: 0,
          requestsMonth: 0,
          createdAt: new Date()
        })
      }));
      jest.mock('../../src/services/webhook', () => ({
        trigger: jest.fn().mockResolvedValue(undefined)
      }));

      authRoutes = require('../../src/routes/auth');
    });

    it('should export express router', () => {
      expect(authRoutes).toBeDefined();
      expect(authRoutes.stack).toBeDefined();
      expect(Array.isArray(authRoutes.stack)).toBe(true);
    });

    it('should have POST /token route', () => {
      const tokenRoute = authRoutes.stack.find(
        layer => layer.route && layer.route.path === '/token' && layer.route.methods.post
      );
      expect(tokenRoute).toBeDefined();
    });

    it('should have GET /verify route', () => {
      const verifyRoute = authRoutes.stack.find(
        layer => layer.route && layer.route.path === '/verify' && layer.route.methods.get
      );
      expect(verifyRoute).toBeDefined();
    });

    it('should have POST /logout route', () => {
      const logoutRoute = authRoutes.stack.find(
        layer => layer.route && layer.route.path === '/logout' && layer.route.methods.post
      );
      expect(logoutRoute).toBeDefined();
    });

    it('should have GET /token-info route', () => {
      const tokenInfoRoute = authRoutes.stack.find(
        layer => layer.route && layer.route.path === '/token-info' && layer.route.methods.get
      );
      expect(tokenInfoRoute).toBeDefined();
    });
  });

  describe('Proxy Routes', () => {
    let proxyRoutes;

    beforeEach(() => {
      jest.resetModules();
      // Mock all dependencies
      jest.mock('../../src/middleware/auth', () => ({
        authenticateToken: jest.fn((req, res, next) => next())
      }));
      jest.mock('../../src/utils/validator', () => ({
        validateProxyRequest: jest.fn((req, res, next) => next())
      }));
      jest.mock('../../src/controllers/proxy', () => ({
        proxyRequest: jest.fn((req, res) => res.json({ success: true })),
        getAvailableEndpoints: jest.fn((req, res) => res.json({ endpoints: [] }))
      }));
      jest.mock('../../src/utils/errorHandler', () => ({
        asyncHandler: jest.fn(fn => fn)
      }));
      jest.mock('../../src/middleware/quotaCheck', () => jest.fn((req, res, next) => next()));
      jest.mock('../../src/middleware/ipCheck', () => jest.fn((req, res, next) => next()));
      jest.mock('../../src/middleware/splitKey', () => ({
        validateSplitKey: jest.fn((req, res, next) => next()),
        reconstructApiKey: jest.fn((req, res, next) => next()),
        addSplitKeySecurityHeaders: jest.fn((req, res, next) => next())
      }));

      proxyRoutes = require('../../src/routes/proxy');
    });

    it('should export express router', () => {
      expect(proxyRoutes).toBeDefined();
      expect(proxyRoutes.stack).toBeDefined();
    });

    it('should have GET /:api/endpoints route', () => {
      const endpointsRoute = proxyRoutes.stack.find(
        layer => layer.route && 
                 layer.route.path === '/:api/endpoints' && 
                 layer.route.methods.get
      );
      expect(endpointsRoute).toBeDefined();
    });

    it('should have POST /:api/proxy route', () => {
      const proxyRoute = proxyRoutes.stack.find(
        layer => layer.route && 
                 layer.route.path === '/:api/proxy' && 
                 layer.route.methods.post
      );
      expect(proxyRoute).toBeDefined();
    });

    it('should have GET /:api/proxy route', () => {
      const proxyRoute = proxyRoutes.stack.find(
        layer => layer.route && 
                 layer.route.path === '/:api/proxy' && 
                 layer.route.methods.get
      );
      expect(proxyRoute).toBeDefined();
    });

    it('should have convenience routes for supported APIs', () => {
      const supportedApis = [
        'openai', 'gemini', 'claude', 'groq', 'mistral', 'zai', 'deepseek',
        'perplexity', 'together', 'openrouter', 'fireworks', 'github', 'replicate',
        'stability', 'fal', 'elevenlabs', 'brave', 'deepl', 'openmeteo'
      ];

      supportedApis.forEach(api => {
        const route = proxyRoutes.stack.find(
          layer => layer.route && 
                   layer.route.path === `/${api}` && 
                   layer.route.methods.post
        );
        expect(route).toBeDefined();
      });
    });
  });

  describe('Analytics Routes', () => {
    let analyticsRoutes;

    beforeEach(() => {
      jest.resetModules();
      jest.mock('../../src/middleware/auth', () => ({
        authenticateToken: jest.fn((req, res, next) => next())
      }));
      jest.mock('../../src/services/analytics', () => ({
        getOverview: jest.fn().mockResolvedValue({}),
        getUserAnalytics: jest.fn().mockResolvedValue({}),
        getCostBreakdown: jest.fn().mockResolvedValue({}),
        getErrorStats: jest.fn().mockResolvedValue({})
      }));

      analyticsRoutes = require('../../src/routes/analytics');
    });

    it('should export express router', () => {
      expect(analyticsRoutes).toBeDefined();
      expect(analyticsRoutes.stack).toBeDefined();
    });

    it('should have GET /overview route', () => {
      const route = analyticsRoutes.stack.find(
        layer => layer.route && layer.route.path === '/overview'
      );
      expect(route).toBeDefined();
    });

    it('should have GET /user/:userId route', () => {
      const route = analyticsRoutes.stack.find(
        layer => layer.route && layer.route.path === '/user/:userId'
      );
      expect(route).toBeDefined();
    });

    it('should have GET /costs route', () => {
      const route = analyticsRoutes.stack.find(
        layer => layer.route && layer.route.path === '/costs'
      );
      expect(route).toBeDefined();
    });

    it('should have GET /errors route', () => {
      const route = analyticsRoutes.stack.find(
        layer => layer.route && layer.route.path === '/errors'
      );
      expect(route).toBeDefined();
    });

    it('should have GET /my-stats route', () => {
      const route = analyticsRoutes.stack.find(
        layer => layer.route && layer.route.path === '/my-stats'
      );
      expect(route).toBeDefined();
    });
  });

  describe('Split Key Routes', () => {
    let splitKeyRoutes;

    beforeEach(() => {
      jest.resetModules();
      jest.mock('../../src/middleware/auth', () => ({
        authenticateToken: jest.fn((req, res, next) => next())
      }));
      jest.mock('../../src/services/splitKey', () => ({
        splitApiKey: jest.fn().mockResolvedValue({}),
        getSplitKeyInfo: jest.fn().mockResolvedValue({}),
        listSplitKeys: jest.fn().mockResolvedValue([]),
        deactivateSplitKey: jest.fn().mockResolvedValue({})
      }));
      jest.mock('../../src/middleware/splitKey', () => ({
        validateSplitKey: jest.fn((req, res, next) => next()),
        reconstructApiKey: jest.fn((req, res, next) => next()),
        addSplitKeySecurityHeaders: jest.fn((req, res, next) => next())
      }));
      jest.mock('../../src/utils/validator', () => ({
        validateSplitKeyRequest: jest.fn((req, res, next) => next())
      }));

      splitKeyRoutes = require('../../src/routes/splitKey');
    });

    it('should export express router', () => {
      expect(splitKeyRoutes).toBeDefined();
      expect(splitKeyRoutes.stack).toBeDefined();
    });

    it('should have POST /split route', () => {
      const route = splitKeyRoutes.stack.find(
        layer => layer.route && layer.route.path === '/split'
      );
      expect(route).toBeDefined();
    });

    it('should have GET / route for listing keys', () => {
      const route = splitKeyRoutes.stack.find(
        layer => layer.route && 
                 layer.route.path === '/' && 
                 layer.route.methods.get
      );
      expect(route).toBeDefined();
    });

    it('should have GET /:keyId route', () => {
      const route = splitKeyRoutes.stack.find(
        layer => layer.route && layer.route.path === '/:keyId' && layer.route.methods.get
      );
      expect(route).toBeDefined();
    });

    it('should have DELETE /:keyId route', () => {
      const route = splitKeyRoutes.stack.find(
        layer => layer.route && layer.route.path === '/:keyId' && layer.route.methods.delete
      );
      expect(route).toBeDefined();
    });

    it('should have POST /validate route', () => {
      const route = splitKeyRoutes.stack.find(
        layer => layer.route && layer.route.path === '/validate'
      );
      expect(route).toBeDefined();
    });
  });
});
