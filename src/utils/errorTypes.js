/**
 * Centralized Error Types
 * Standardized error definitions for consistent error handling across the application
 */

class AppError extends Error {
  constructor(message, statusCode, code, details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Authentication Errors
class AuthenticationError extends AppError {
  constructor(message, details = {}) {
    super(message, 401, 'AUTHENTICATION_ERROR', details);
  }
}

class AuthorizationError extends AppError {
  constructor(message, details = {}) {
    super(message, 403, 'AUTHORIZATION_ERROR', details);
  }
}

// Validation Errors
class ValidationError extends AppError {
  constructor(message, field = null, details = {}) {
    super(message, 400, 'VALIDATION_ERROR', { field, ...details });
  }
}

class InvalidEndpointError extends ValidationError {
  constructor(endpoint, api) {
    super(`Invalid endpoint: ${endpoint}`, 'endpoint', { endpoint, api });
  }
}

class InvalidApiError extends ValidationError {
  constructor(api, validApis) {
    super(`Invalid API: ${api}`, 'api', { api, validApis });
  }
}

// Rate Limiting Errors
class RateLimitError extends AppError {
  constructor(message, resetTime = null) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED', { resetTime });
  }
}

class QuotaExceededError extends AppError {
  constructor(quotaType, usage, limit) {
    super(`${quotaType} quota exceeded. Usage: ${usage}, Limit: ${limit}`, 429, 'QUOTA_EXCEEDED', { quotaType, usage, limit });
  }
}

// Resource Errors
class NotFoundError extends AppError {
  constructor(resource, identifier = null) {
    super(`${resource} not found${identifier ? `: ${identifier}` : ''}`, 404, 'NOT_FOUND', { resource, identifier });
  }
}

class ServiceUnavailableError extends AppError {
  constructor(service, details = {}) {
    super(`${service} is currently unavailable`, 503, 'SERVICE_UNAVAILABLE', { service, ...details });
  }
}

// Configuration Errors
class ConfigurationError extends AppError {
  constructor(message, configKey = null) {
    super(message, 500, 'CONFIGURATION_ERROR', { configKey });
  }
}

// Security Errors
class SecurityError extends AppError {
  constructor(message, securityLevel = 'medium') {
    super(message, 403, 'SECURITY_VIOLATION', { securityLevel });
  }
}

class SuspiciousActivityError extends SecurityError {
  constructor(activityType, details = {}) {
    super(`Suspicious activity detected: ${activityType}`, 'high', { activityType, ...details });
  }
}

// Network/API Errors
class ExternalApiError extends AppError {
  constructor(api, message, statusCode, details = {}) {
    super(`${api} API Error: ${message}`, 502, 'EXTERNAL_API_ERROR', { api, statusCode, ...details });
  }
}

class NetworkTimeoutError extends AppError {
  constructor(service, timeout) {
    super(`Request to ${service} timed out after ${timeout}ms`, 504, 'NETWORK_TIMEOUT', { service, timeout });
  }
}

// Database Errors
class DatabaseError extends AppError {
  constructor(message, operation = null) {
    super(`Database error: ${message}`, 500, 'DATABASE_ERROR', { operation });
  }
}

// Split Key (BYOK) Errors
class SplitKeyError extends AppError {
  constructor(message, keyId = null) {
    super(message, 401, 'SPLIT_KEY_ERROR', { keyId });
  }
}

class InvalidSplitKeyError extends SplitKeyError {
  constructor(keyId) {
    super(`Invalid or inactive split key: ${keyId}`, keyId);
  }
}

// Utility Functions
const createError = (type, message, ...args) => {
  const errorMap = {
    authentication: AuthenticationError,
    authorization: AuthorizationError,
    validation: ValidationError,
    rateLimit: RateLimitError,
    quotaExceeded: QuotaExceededError,
    notFound: NotFoundError,
    serviceUnavailable: ServiceUnavailableError,
    configuration: ConfigurationError,
    security: SecurityError,
    suspiciousActivity: SuspiciousActivityError,
    externalApi: ExternalApiError,
    networkTimeout: NetworkTimeoutError,
    database: DatabaseError,
    splitKey: SplitKeyError
  };

  const ErrorClass = errorMap[type];
  if (!ErrorClass) {
    throw new Error(`Unknown error type: ${type}`);
  }

  return new ErrorClass(message, ...args);
};

const isOperationalError = (error) => {
  return error instanceof AppError && error.isOperational;
};

module.exports = {
  // Base error class
  AppError,

  // Specific error classes
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
  SuspiciousActivityError,
  ExternalApiError,
  NetworkTimeoutError,
  DatabaseError,
  SplitKeyError,
  InvalidSplitKeyError,

  // Utility functions
  createError,
  isOperationalError
};