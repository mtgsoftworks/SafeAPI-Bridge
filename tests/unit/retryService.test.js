const { RetryService, RetryStrategy } = require('../../src/services/retryService');

describe('RetryService', () => {
    test('calculateDelay should use exponential backoff', () => {
        const delay = RetryService.calculateDelay(2, 1000, RetryStrategy.EXPONENTIAL);
        // attempt 2: 1000 * 2^(2-1) = 2000 +/- jitter
        expect(delay).toBeGreaterThanOrEqual(2000);
        expect(delay).toBeLessThan(3000); // jitter factor usually adds some randomness
    });

    test('calculateDelay should use linear backoff', () => {
        const delay = RetryService.calculateDelay(2, 1000, RetryStrategy.LINEAR);
        // attempt 2: 1000 * 2 = 2000
        expect(delay).toBe(2000);
    });

    // Mock for Retry-After functionality testing would go here
    // requiring mocking of the helper functions which is harder in CommonJS without proxyquire/jest.mock
});
