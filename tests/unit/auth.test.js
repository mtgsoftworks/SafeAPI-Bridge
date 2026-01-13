/**
 * Unit Tests for Auth Middleware
 */

// Mock dependencies
jest.mock('jsonwebtoken');
jest.mock('../../src/config/env', () => ({
  jwtSecret: 'test-secret',
  jwtExpiresIn: '1h'
}));

jest.mock('../../src/services/tokenBlacklist', () => ({
  isBlacklisted: jest.fn()
}));

jest.mock('../../src/utils/securityLogger', () => ({
  logFailedAuth: jest.fn(),
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

const jwt = require('jsonwebtoken');
const { authenticateToken, generateToken, verifyToken } = require('../../src/middleware/auth');
const tokenBlacklist = require('../../src/services/tokenBlacklist');
const { logFailedAuth } = require('../../src/utils/securityLogger');

describe('Auth Middleware', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    jest.clearAllMocks();

    mockReq = {
      headers: {},
      ip: '127.0.0.1'
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    mockNext = jest.fn();
  });

  describe('authenticateToken', () => {
    it('should return 401 when no token provided', async () => {
      await authenticateToken(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Authentication required',
          message: 'No token provided'
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
      expect(logFailedAuth).toHaveBeenCalledWith('jwt', 'no-token', expect.any(String), expect.any(String));
    });

    it('should return 401 when token is blacklisted', async () => {
      mockReq.headers['authorization'] = 'Bearer valid-token';
      tokenBlacklist.isBlacklisted.mockResolvedValue(true);

      await authenticateToken(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Token Revoked',
          message: expect.stringContaining('logged out')
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 403 when token verification fails', async () => {
      mockReq.headers['authorization'] = 'Bearer invalid-token';
      tokenBlacklist.isBlacklisted.mockResolvedValue(false);
      jwt.verify.mockImplementation((token, secret, callback) => {
        callback(new Error('Invalid token'), null);
      });

      await authenticateToken(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid token',
          message: 'Token verification failed'
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should call next and attach user for valid token', async () => {
      const mockUser = { userId: 'user-123', appId: 'app-456' };
      mockReq.headers['authorization'] = 'Bearer valid-token';
      tokenBlacklist.isBlacklisted.mockResolvedValue(false);
      jwt.verify.mockImplementation((token, secret, callback) => {
        callback(null, mockUser);
      });

      await authenticateToken(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.user).toEqual(mockUser);
      expect(mockReq.token).toBe('valid-token');
      expect(mockReq.authMethod).toBe('SERVER_KEY');
    });

    it('should detect BYOK auth method from headers', async () => {
      const mockUser = { userId: 'user-123', appId: 'app-456' };
      mockReq.headers['authorization'] = 'Bearer valid-token';
      mockReq.headers['x-partial-key-id'] = 'key-123';
      mockReq.headers['x-partial-key'] = 'client-part-hex';
      tokenBlacklist.isBlacklisted.mockResolvedValue(false);
      jwt.verify.mockImplementation((token, secret, callback) => {
        callback(null, mockUser);
      });

      await authenticateToken(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.authMethod).toBe('BYOK_SPLIT_KEY');
    });

    it('should use SERVER_KEY when only partial BYOK headers present', async () => {
      const mockUser = { userId: 'user-123', appId: 'app-456' };
      mockReq.headers['authorization'] = 'Bearer valid-token';
      mockReq.headers['x-partial-key-id'] = 'key-123'; // Missing x-partial-key
      tokenBlacklist.isBlacklisted.mockResolvedValue(false);
      jwt.verify.mockImplementation((token, secret, callback) => {
        callback(null, mockUser);
      });

      await authenticateToken(mockReq, mockRes, mockNext);

      expect(mockReq.authMethod).toBe('SERVER_KEY');
    });
  });

  describe('generateToken', () => {
    it('should generate JWT token with payload', () => {
      const payload = { userId: 'user-123', appId: 'app-456' };
      jwt.sign.mockReturnValue('generated-token');

      const token = generateToken(payload);

      expect(jwt.sign).toHaveBeenCalledWith(payload, 'test-secret', { expiresIn: '1h' });
      expect(token).toBe('generated-token');
    });
  });

  describe('verifyToken', () => {
    it('should return decoded payload for valid token', () => {
      const mockPayload = { userId: 'user-123' };
      jwt.verify.mockReturnValue(mockPayload);

      const result = verifyToken('valid-token');

      expect(result).toEqual(mockPayload);
    });

    it('should return null for invalid token', () => {
      jwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const result = verifyToken('invalid-token');

      expect(result).toBeNull();
    });
  });
});
