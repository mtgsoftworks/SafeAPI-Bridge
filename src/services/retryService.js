const { logger } = require('../utils/securityLogger');

/**
 * Retry Service
 * Provides robust retry mechanisms with configurable strategies
 */

// Retry configuration
const RETRY_CONFIG = {
    DEFAULT_MAX_ATTEMPTS: parseInt(process.env.RETRY_MAX_ATTEMPTS || '3'),
    DEFAULT_DELAY_MS: parseInt(process.env.RETRY_DELAY_MS || '1000'),
    MAX_DELAY_MS: parseInt(process.env.RETRY_MAX_DELAY_MS || '30000'),
    BACKOFF_MULTIPLIER: parseFloat(process.env.RETRY_BACKOFF_MULTIPLIER || '2'),
    JITTER_FACTOR: 0.1 // Add 10% random jitter
};

/**
 * Retry strategies
 */
const RetryStrategy = {
    EXPONENTIAL: 'exponential',
    LINEAR: 'linear',
    FIXED: 'fixed',
    FIBONACCI: 'fibonacci'
};

/**
 * Retryable error codes
 */
const RETRYABLE_STATUS_CODES = [
    408, // Request Timeout
    429, // Too Many Requests
    500, // Internal Server Error
    502, // Bad Gateway
    503, // Service Unavailable
    504  // Gateway Timeout
];

/**
 * Retryable error messages
 */
const RETRYABLE_ERROR_PATTERNS = [
    /ECONNRESET/i,
    /ETIMEDOUT/i,
    /ECONNREFUSED/i,
    /ENOTFOUND/i,
    /socket hang up/i,
    /network error/i,
    /timeout/i,
    /rate limit/i,
    /overloaded/i,
    /capacity/i
];

class RetryService {
    /**
     * Execute a function with retry logic
     * @param {Function} fn - Async function to execute
     * @param {Object} options - Retry options
     * @returns {Promise<any>} Result of the function
     */
    static async execute(fn, options = {}) {
        const {
            maxAttempts = RETRY_CONFIG.DEFAULT_MAX_ATTEMPTS,
            delayMs = RETRY_CONFIG.DEFAULT_DELAY_MS,
            strategy = RetryStrategy.EXPONENTIAL,
            shouldRetry = this.defaultShouldRetry,
            onRetry = null,
            context = {}
        } = options;

        let lastError;
        let attempt = 0;

        while (attempt < maxAttempts) {
            attempt++;

            try {
                const result = await fn(attempt);

                // Log successful retry
                if (attempt > 1) {
                    logger.info('Retry succeeded', {
                        attempt,
                        totalAttempts: attempt,
                        context
                    });
                }

                return result;
            } catch (error) {
                lastError = error;

                // Check if we should retry
                if (attempt >= maxAttempts || !shouldRetry(error, attempt)) {
                    logger.error('Retry exhausted or non-retryable error', {
                        attempt,
                        maxAttempts,
                        error: error.message,
                        context
                    });
                    throw error;
                }

                // Calculate delay
                const delay = this.calculateDelay(attempt, delayMs, strategy);

                // Log retry attempt
                logger.warn('Retrying after error', {
                    attempt,
                    maxAttempts,
                    delay,
                    error: error.message,
                    context
                });

                // Call onRetry callback if provided
                if (onRetry) {
                    await onRetry(error, attempt, delay);
                }

                // Wait before retry
                await this.sleep(delay);
            }
        }

        throw lastError;
    }

    /**
     * Calculate delay based on strategy
     * @private
     */
    static calculateDelay(attempt, baseDelay, strategy) {
        let delay;

        switch (strategy) {
            case RetryStrategy.EXPONENTIAL:
                delay = baseDelay * Math.pow(RETRY_CONFIG.BACKOFF_MULTIPLIER, attempt - 1);
                break;

            case RetryStrategy.LINEAR:
                delay = baseDelay * attempt;
                break;

            case RetryStrategy.FIXED:
                delay = baseDelay;
                break;

            case RetryStrategy.FIBONACCI:
                delay = baseDelay * this.fibonacci(attempt);
                break;

            default:
                delay = baseDelay;
        }

        // Apply jitter
        const jitter = delay * RETRY_CONFIG.JITTER_FACTOR * (Math.random() - 0.5);
        delay = Math.floor(delay + jitter);

        // Cap at max delay
        return Math.min(delay, RETRY_CONFIG.MAX_DELAY_MS);
    }

    /**
     * Fibonacci sequence helper
     * @private
     */
    static fibonacci(n) {
        if (n <= 1) return 1;
        let a = 1, b = 1;
        for (let i = 2; i < n; i++) {
            [a, b] = [b, a + b];
        }
        return b;
    }

    /**
     * Default retry decision logic
     * @param {Error} error - The error that occurred
     * @param {number} attempt - Current attempt number
     * @returns {boolean} Whether to retry
     */
    static defaultShouldRetry(error, attempt) {
        // Check status code
        if (error.response?.status) {
            if (RETRYABLE_STATUS_CODES.includes(error.response.status)) {
                return true;
            }
            // Don't retry client errors (4xx except 408, 429)
            if (error.response.status >= 400 && error.response.status < 500) {
                return false;
            }
        }

        // Check error message patterns
        const errorMessage = error.message || '';
        for (const pattern of RETRYABLE_ERROR_PATTERNS) {
            if (pattern.test(errorMessage)) {
                return true;
            }
        }

        // Check if it's a network error
        if (error.code && ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND'].includes(error.code)) {
            return true;
        }

        return false;
    }

    /**
     * Sleep helper
     * @private
     */
    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Create a retry wrapper for a function
     * @param {Function} fn - Function to wrap
     * @param {Object} options - Retry options
     * @returns {Function} Wrapped function with retry
     */
    static wrap(fn, options = {}) {
        return async (...args) => {
            return this.execute(() => fn(...args), options);
        };
    }

    /**
     * Execute with circuit breaker pattern
     * @param {Function} fn - Async function to execute
     * @param {Object} options - Options including circuit breaker settings
     */
    static async executeWithCircuitBreaker(fn, options = {}) {
        const {
            failureThreshold = 5,
            resetTimeout = 30000,
            circuitState = { failures: 0, lastFailure: 0, isOpen: false }
        } = options;

        // Check if circuit is open
        if (circuitState.isOpen) {
            const timeSinceLastFailure = Date.now() - circuitState.lastFailure;
            if (timeSinceLastFailure < resetTimeout) {
                throw new Error('Circuit breaker is open. Service temporarily unavailable.');
            }
            // Reset circuit (half-open state)
            circuitState.isOpen = false;
            circuitState.failures = 0;
        }

        try {
            const result = await this.execute(fn, options);
            // Reset failures on success
            circuitState.failures = 0;
            return result;
        } catch (error) {
            circuitState.failures++;
            circuitState.lastFailure = Date.now();

            if (circuitState.failures >= failureThreshold) {
                circuitState.isOpen = true;
                logger.error('Circuit breaker opened', {
                    failures: circuitState.failures,
                    threshold: failureThreshold
                });
            }

            throw error;
        }
    }
}

module.exports = {
    RetryService,
    RetryStrategy,
    RETRY_CONFIG,
    RETRYABLE_STATUS_CODES,
    RETRYABLE_ERROR_PATTERNS
};
