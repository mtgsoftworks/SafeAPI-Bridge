/**
 * Unit Tests for Error Types
 */

const {
  AppError,
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  InvalidEndpointError,
  InvalidApiError,
  RateLimitError,
  QuotaExceededError,
  NotFoundError,
  ServiceUnavailableError,
  ConfigurationError,
  SecurityError,
  ExternalApiError,
  NetworkTimeoutError,
  DatabaseError,
  SplitKeyError,
  InvalidSplitKeyError,
  createError,
  isOperationalError
} = require('../../src/utils/errorTypes');

describe('Error Types', () => {
  describe('AppError (Base)', () => {
    it('should create error with all properties', () => {
      const error = new AppError('Test error', 500, 'TEST_ERROR', { key: 'value' });

      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('TEST_ERROR');
      expect(error.details).toEqual({ key: 'value' });
      expect(error.isOperational).toBe(true);
      expect(error.name).toBe('AppError');
    });

    it('should capture stack trace', () => {
      const error = new AppError('Test', 500, 'TEST');
      expect(error.stack).toBeDefined();
    });
  });

  describe('AuthenticationError', () => {
    it('should have correct status code and code', () => {
      const error = new AuthenticationError('Invalid token');

      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('AUTHENTICATION_ERROR');
      expect(error.message).toBe('Invalid token');
    });
  });

  describe('AuthorizationError', () => {
    it('should have correct status code and code', () => {
      const error = new AuthorizationError('Access denied');

      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('AUTHORIZATION_ERROR');
    });
  });

  describe('ValidationError', () => {
    it('should include field in details', () => {
      const error = new ValidationError('Invalid input', 'email');

      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.details.field).toBe('email');
    });

    it('should merge additional details', () => {
      const error = new ValidationError('Too short', 'password', { minLength: 8 });

      expect(error.details.field).toBe('password');
      expect(error.details.minLength).toBe(8);
    });
  });

  describe('InvalidEndpointError', () => {
    it('should include endpoint and api in details', () => {
      const error = new InvalidEndpointError('/invalid', 'openai');

      expect(error.message).toContain('/invalid');
      expect(error.details.endpoint).toBe('/invalid');
      expect(error.details.api).toBe('openai');
    });
  });

  describe('InvalidApiError', () => {
    it('should include api and valid APIs in details', () => {
      const validApis = ['openai', 'claude'];
      const error = new InvalidApiError('invalid-api', validApis);

      expect(error.message).toContain('invalid-api');
      expect(error.details.api).toBe('invalid-api');
      expect(error.details.validApis).toEqual(validApis);
    });
  });

  describe('RateLimitError', () => {
    it('should have 429 status and include reset time', () => {
      const resetTime = new Date();
      const error = new RateLimitError('Too many requests', resetTime);

      expect(error.statusCode).toBe(429);
      expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(error.details.resetTime).toBe(resetTime);
    });
  });

  describe('QuotaExceededError', () => {
    it('should include quota details', () => {
      const error = new QuotaExceededError('daily', 100, 50);

      expect(error.statusCode).toBe(429);
      expect(error.code).toBe('QUOTA_EXCEEDED');
      expect(error.details.quotaType).toBe('daily');
      expect(error.details.usage).toBe(100);
      expect(error.details.limit).toBe(50);
    });
  });

  describe('NotFoundError', () => {
    it('should have 404 status', () => {
      const error = new NotFoundError('User', '123');

      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
      expect(error.message).toContain('User');
      expect(error.message).toContain('123');
    });

    it('should work without identifier', () => {
      const error = new NotFoundError('Resource');
      expect(error.message).toBe('Resource not found');
    });
  });

  describe('ServiceUnavailableError', () => {
    it('should have 503 status', () => {
      const error = new ServiceUnavailableError('OpenAI');

      expect(error.statusCode).toBe(503);
      expect(error.code).toBe('SERVICE_UNAVAILABLE');
      expect(error.details.service).toBe('OpenAI');
    });
  });

  describe('ExternalApiError', () => {
    it('should have 502 status and include api details', () => {
      const error = new ExternalApiError('openai', 'Rate limit exceeded', 429);

      expect(error.statusCode).toBe(502);
      expect(error.code).toBe('EXTERNAL_API_ERROR');
      expect(error.details.api).toBe('openai');
      expect(error.details.statusCode).toBe(429);
    });
  });

  describe('NetworkTimeoutError', () => {
    it('should have 504 status and timeout info', () => {
      const error = new NetworkTimeoutError('OpenAI', 30000);

      expect(error.statusCode).toBe(504);
      expect(error.code).toBe('NETWORK_TIMEOUT');
      expect(error.details.service).toBe('OpenAI');
      expect(error.details.timeout).toBe(30000);
    });
  });

  describe('DatabaseError', () => {
    it('should have 500 status', () => {
      const error = new DatabaseError('Connection failed', 'connect');

      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('DATABASE_ERROR');
      expect(error.details.operation).toBe('connect');
    });
  });

  describe('SplitKeyError', () => {
    it('should have 401 status', () => {
      const error = new SplitKeyError('Invalid key', 'key-123');

      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('SPLIT_KEY_ERROR');
      expect(error.details.keyId).toBe('key-123');
    });
  });

  describe('createError factory', () => {
    it('should create correct error types', () => {
      const authError = createError('authentication', 'Invalid token');
      expect(authError).toBeInstanceOf(AuthenticationError);

      const validationError = createError('validation', 'Invalid input');
      expect(validationError).toBeInstanceOf(ValidationError);
    });

    it('should throw for unknown error type', () => {
      expect(() => createError('unknown', 'test')).toThrow('Unknown error type');
    });
  });

  describe('isOperationalError', () => {
    it('should return true for AppError instances', () => {
      const error = new ValidationError('test');
      expect(isOperationalError(error)).toBe(true);
    });

    it('should return false for regular Error', () => {
      const error = new Error('Regular error');
      expect(isOperationalError(error)).toBe(false);
    });

    it('should return false for non-operational AppError', () => {
      const error = new AppError('test', 500, 'TEST');
      error.isOperational = false;
      expect(isOperationalError(error)).toBe(false);
    });
  });
});
