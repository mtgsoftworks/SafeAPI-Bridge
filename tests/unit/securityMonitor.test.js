/**
 * Unit Tests for Security Monitor Middleware
 */

// Mock dependencies
jest.mock('../../src/utils/securityLogger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  },
  logSuspiciousActivity: jest.fn(),
  logSecurityEvent: jest.fn()
}));

jest.mock('../../src/config/constants', () => ({
  SECURITY: {
    FAILED_AUTH_THRESHOLD: 5,
    FAILED_AUTH_WINDOW: 15 * 60 * 1000, // 15 minutes
    FAILED_AUTH_WINDOW_MS: 15 * 60 * 1000,
    MAX_CONTENT_LENGTH_BYTES: 10 * 1024 * 1024, // 10MB
    SUSPICIOUS_ACTIVITY_THRESHOLD: 10,
    SUSPICIOUS_ACTIVITY_WINDOW_MS: 10 * 60 * 1000,
    LRU_CACHE_MAX_ENTRIES: 10000,
    SUSPICIOUS_CACHE_MAX_ENTRIES: 5000
  }
}));

jest.mock('../../src/config/securityPatterns', () => ({
  containsMaliciousPattern: jest.fn(),
  checkPatternType: jest.fn()
}));

const { securityMonitor, trackFailedAuth, isLockedOut } = require('../../src/middleware/securityMonitor');
const { logSuspiciousActivity } = require('../../src/utils/securityLogger');
const { containsMaliciousPattern, checkPatternType } = require('../../src/config/securityPatterns');

describe('Security Monitor Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    containsMaliciousPattern.mockReturnValue(false);
    checkPatternType.mockReturnValue(false);
  });

  describe('trackFailedAuth', () => {
    it('should track first failed attempt and return count 1', () => {
      const ip = '192.168.1.100';
      const count = trackFailedAuth(ip);

      expect(count).toBe(1);
    });

    it('should increment count for subsequent attempts', () => {
      const ip = '192.168.1.101';

      trackFailedAuth(ip);
      trackFailedAuth(ip);
      const count = trackFailedAuth(ip);

      expect(count).toBe(3);
    });

    it('should log suspicious activity at threshold', () => {
      const ip = '192.168.1.102';

      // Attempt 5 times to reach threshold
      for (let i = 0; i < 5; i++) {
        trackFailedAuth(ip);
      }

      expect(logSuspiciousActivity).toHaveBeenCalledWith(
        'BRUTE_FORCE_ATTEMPT',
        expect.objectContaining({
          ip,
          attempts: 5,
          action: expect.stringContaining('failed authentication')
        })
      );
    });

    it('should not log suspicious activity below threshold', () => {
      const ip = '192.168.1.103';

      // Only 4 attempts (below threshold of 5)
      for (let i = 0; i < 4; i++) {
        trackFailedAuth(ip);
      }

      expect(logSuspiciousActivity).not.toHaveBeenCalled();
    });
  });

  describe('isLockedOut', () => {
    it('should return false for unknown IP', () => {
      expect(isLockedOut('10.0.0.1')).toBe(false);
    });

    it('should return false below threshold', () => {
      const ip = '10.0.0.2';

      // 4 attempts (below threshold)
      for (let i = 0; i < 4; i++) {
        trackFailedAuth(ip);
      }

      expect(isLockedOut(ip)).toBe(false);
    });

    it('should return true at threshold', () => {
      const ip = '10.0.0.3';

      // 5 attempts (at threshold)
      for (let i = 0; i < 5; i++) {
        trackFailedAuth(ip);
      }

      expect(isLockedOut(ip)).toBe(true);
    });
  });

  describe('securityMonitor middleware', () => {
    let mockReq, mockRes, mockNext;

    beforeEach(() => {
      mockReq = {
        method: 'GET',
        path: '/api/test',
        query: {},
        headers: {
          'user-agent': 'Mozilla/5.0'
        },
        ip: '127.0.0.1'
      };

      mockRes = {
        statusCode: 200,
        on: jest.fn((event, callback) => {
          if (event === 'finish') {
            // Store callback for later invocation
            mockRes._finishCallback = callback;
          }
        })
      };

      mockNext = jest.fn();
    });

    it('should call next immediately', () => {
      securityMonitor(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should register finish event listener', () => {
      securityMonitor(mockReq, mockRes, mockNext);

      expect(mockRes.on).toHaveBeenCalledWith('finish', expect.any(Function));
    });

    it('should not flag missing user agent without scanner signals', () => {
      mockReq.headers['user-agent'] = '';
      mockReq.path = '/api/sensitive';

      securityMonitor(mockReq, mockRes, mockNext);
      mockRes._finishCallback(); // Simulate response finish

      expect(logSuspiciousActivity).not.toHaveBeenCalledWith(
        'MISSING_USER_AGENT',
        expect.anything()
      );
    });

    it('should detect missing user agent on scanner probe routes', () => {
      mockReq.headers['user-agent'] = '';
      mockReq.path = '/wp-blog.php';

      securityMonitor(mockReq, mockRes, mockNext);
      mockRes._finishCallback();

      expect(logSuspiciousActivity).toHaveBeenCalledWith(
        'MISSING_USER_AGENT',
        expect.objectContaining({
          path: '/wp-blog.php',
          reasons: expect.arrayContaining(['WORDPRESS_PROBE'])
        })
      );
    });

    it('should not flag missing user agent on health endpoint', () => {
      mockReq.headers['user-agent'] = '';
      mockReq.path = '/health';

      securityMonitor(mockReq, mockRes, mockNext);
      mockRes._finishCallback();

      expect(logSuspiciousActivity).not.toHaveBeenCalledWith(
        'MISSING_USER_AGENT',
        expect.anything()
      );
    });

    it('should detect injection attempts in query parameters', () => {
      mockReq.query = { id: "1' OR '1'='1" };
      containsMaliciousPattern.mockReturnValue(true);
      checkPatternType.mockImplementation((input, type) => type === 'SQL_INJECTION');

      securityMonitor(mockReq, mockRes, mockNext);
      mockRes._finishCallback();

      expect(logSuspiciousActivity).toHaveBeenCalledWith(
        'INJECTION_ATTEMPT',
        expect.objectContaining({
          detectedTypes: expect.arrayContaining(['SQL_INJECTION'])
        })
      );
    });

    it('should detect path traversal attempts', () => {
      mockReq.path = '/api/../../../etc/passwd';
      checkPatternType.mockImplementation((input, type) => type === 'PATH_TRAVERSAL');

      securityMonitor(mockReq, mockRes, mockNext);
      mockRes._finishCallback();

      expect(logSuspiciousActivity).toHaveBeenCalledWith(
        'PATH_TRAVERSAL_ATTEMPT',
        expect.objectContaining({
          path: '/api/../../../etc/passwd',
          severity: 'HIGH'
        })
      );
    });

    it('should detect large payloads', () => {
      mockReq.headers['content-length'] = '20000000'; // 20MB

      securityMonitor(mockReq, mockRes, mockNext);
      mockRes._finishCallback();

      expect(logSuspiciousActivity).toHaveBeenCalledWith(
        'LARGE_PAYLOAD',
        expect.objectContaining({
          contentLength: 20000000,
          warning: 'Potential DoS attempt'
        })
      );
    });

    it('should detect suspicious user agents', () => {
      mockReq.headers['user-agent'] = 'python-requests/2.28.0';
      mockReq.path = '/api/data';

      // Simulate multiple requests
      for (let i = 0; i < 10; i++) {
        securityMonitor(mockReq, mockRes, mockNext);
        mockRes._finishCallback();
      }

      expect(logSuspiciousActivity).toHaveBeenCalledWith(
        'SUSPICIOUS_AUTOMATED_ACTIVITY',
        expect.objectContaining({
          userAgent: 'python-requests/2.28.0'
        })
      );
    });
  });
});
