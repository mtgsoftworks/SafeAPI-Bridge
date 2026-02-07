/**
 * Metrics Service
 * Prometheus-compatible metrics for monitoring
 */

// Metrics storage
const metrics = {
    // Request counters
    requests: {
        total: 0,
        success: 0,
        failed: 0,
        byProvider: {},
        byStatusCode: {}
    },

    // Response times (in ms)
    responseTimes: {
        total: [],
        byProvider: {}
    },

    // Queue metrics
    queue: {
        added: 0,
        completed: 0,
        failed: 0,
        retried: 0
    },

    // Rate limiting
    rateLimits: {
        exceeded: 0,
        byIp: {}
    },

    // Circuit breaker
    circuitBreaker: {
        opened: 0,
        closed: 0,
        byProvider: {}
    },

    // System
    startTime: Date.now(),
    lastReset: Date.now()
};

// Keep only last N response times to avoid memory issues
const MAX_RESPONSE_TIMES = 1000;

/**
 * Record a request
 */
function recordRequest(provider, statusCode, responseTimeMs, success) {
    metrics.requests.total++;

    if (success) {
        metrics.requests.success++;
    } else {
        metrics.requests.failed++;
    }

    // By provider
    if (!metrics.requests.byProvider[provider]) {
        metrics.requests.byProvider[provider] = { total: 0, success: 0, failed: 0 };
    }
    metrics.requests.byProvider[provider].total++;
    if (success) {
        metrics.requests.byProvider[provider].success++;
    } else {
        metrics.requests.byProvider[provider].failed++;
    }

    // By status code
    const statusGroup = `${Math.floor(statusCode / 100)}xx`;
    metrics.requests.byStatusCode[statusGroup] = (metrics.requests.byStatusCode[statusGroup] || 0) + 1;

    // Response time
    if (responseTimeMs) {
        metrics.responseTimes.total.push(responseTimeMs);
        if (metrics.responseTimes.total.length > MAX_RESPONSE_TIMES) {
            metrics.responseTimes.total.shift();
        }

        if (!metrics.responseTimes.byProvider[provider]) {
            metrics.responseTimes.byProvider[provider] = [];
        }
        metrics.responseTimes.byProvider[provider].push(responseTimeMs);
        if (metrics.responseTimes.byProvider[provider].length > MAX_RESPONSE_TIMES) {
            metrics.responseTimes.byProvider[provider].shift();
        }
    }
}

/**
 * Record queue event
 */
function recordQueueEvent(event) {
    if (metrics.queue[event] !== undefined) {
        metrics.queue[event]++;
    }
}

/**
 * Record rate limit exceeded
 */
function recordRateLimitExceeded(ip) {
    metrics.rateLimits.exceeded++;
    metrics.rateLimits.byIp[ip] = (metrics.rateLimits.byIp[ip] || 0) + 1;
}

/**
 * Record circuit breaker event
 */
function recordCircuitBreakerEvent(provider, isOpen) {
    if (isOpen) {
        metrics.circuitBreaker.opened++;
    } else {
        metrics.circuitBreaker.closed++;
    }

    if (!metrics.circuitBreaker.byProvider[provider]) {
        metrics.circuitBreaker.byProvider[provider] = { opened: 0, closed: 0 };
    }
    if (isOpen) {
        metrics.circuitBreaker.byProvider[provider].opened++;
    } else {
        metrics.circuitBreaker.byProvider[provider].closed++;
    }
}

/**
 * Calculate percentile
 */
function percentile(arr, p) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
}

/**
 * Get metrics in Prometheus format
 */
function getPrometheusMetrics() {
    const lines = [];
    const uptime = (Date.now() - metrics.startTime) / 1000;

    // Help and type declarations
    lines.push('# HELP safeapi_uptime_seconds Server uptime in seconds');
    lines.push('# TYPE safeapi_uptime_seconds gauge');
    lines.push(`safeapi_uptime_seconds ${uptime.toFixed(2)}`);

    lines.push('# HELP safeapi_requests_total Total number of requests');
    lines.push('# TYPE safeapi_requests_total counter');
    lines.push(`safeapi_requests_total ${metrics.requests.total}`);

    lines.push('# HELP safeapi_requests_success_total Successful requests');
    lines.push('# TYPE safeapi_requests_success_total counter');
    lines.push(`safeapi_requests_success_total ${metrics.requests.success}`);

    lines.push('# HELP safeapi_requests_failed_total Failed requests');
    lines.push('# TYPE safeapi_requests_failed_total counter');
    lines.push(`safeapi_requests_failed_total ${metrics.requests.failed}`);

    // By provider
    lines.push('# HELP safeapi_requests_by_provider_total Requests by provider');
    lines.push('# TYPE safeapi_requests_by_provider_total counter');
    for (const [provider, data] of Object.entries(metrics.requests.byProvider)) {
        lines.push(`safeapi_requests_by_provider_total{provider="${provider}",status="success"} ${data.success}`);
        lines.push(`safeapi_requests_by_provider_total{provider="${provider}",status="failed"} ${data.failed}`);
    }

    // By status code
    lines.push('# HELP safeapi_requests_by_status_total Requests by HTTP status group');
    lines.push('# TYPE safeapi_requests_by_status_total counter');
    for (const [status, count] of Object.entries(metrics.requests.byStatusCode)) {
        lines.push(`safeapi_requests_by_status_total{status="${status}"} ${count}`);
    }

    // Response times
    if (metrics.responseTimes.total.length > 0) {
        lines.push('# HELP safeapi_response_time_ms Response time in milliseconds');
        lines.push('# TYPE safeapi_response_time_ms summary');
        lines.push(`safeapi_response_time_ms{quantile="0.5"} ${percentile(metrics.responseTimes.total, 50)}`);
        lines.push(`safeapi_response_time_ms{quantile="0.9"} ${percentile(metrics.responseTimes.total, 90)}`);
        lines.push(`safeapi_response_time_ms{quantile="0.99"} ${percentile(metrics.responseTimes.total, 99)}`);
    }

    // Queue metrics
    lines.push('# HELP safeapi_queue_events_total Queue events');
    lines.push('# TYPE safeapi_queue_events_total counter');
    lines.push(`safeapi_queue_events_total{event="added"} ${metrics.queue.added}`);
    lines.push(`safeapi_queue_events_total{event="completed"} ${metrics.queue.completed}`);
    lines.push(`safeapi_queue_events_total{event="failed"} ${metrics.queue.failed}`);
    lines.push(`safeapi_queue_events_total{event="retried"} ${metrics.queue.retried}`);

    // Rate limits
    lines.push('# HELP safeapi_rate_limits_exceeded_total Rate limit exceeded count');
    lines.push('# TYPE safeapi_rate_limits_exceeded_total counter');
    lines.push(`safeapi_rate_limits_exceeded_total ${metrics.rateLimits.exceeded}`);

    // Circuit breaker
    lines.push('# HELP safeapi_circuit_breaker_events_total Circuit breaker events');
    lines.push('# TYPE safeapi_circuit_breaker_events_total counter');
    lines.push(`safeapi_circuit_breaker_events_total{event="opened"} ${metrics.circuitBreaker.opened}`);
    lines.push(`safeapi_circuit_breaker_events_total{event="closed"} ${metrics.circuitBreaker.closed}`);

    // Memory usage
    const mem = process.memoryUsage();
    lines.push('# HELP safeapi_memory_bytes Memory usage in bytes');
    lines.push('# TYPE safeapi_memory_bytes gauge');
    lines.push(`safeapi_memory_bytes{type="rss"} ${mem.rss}`);
    lines.push(`safeapi_memory_bytes{type="heap_used"} ${mem.heapUsed}`);
    lines.push(`safeapi_memory_bytes{type="heap_total"} ${mem.heapTotal}`);

    return lines.join('\n');
}

/**
 * Get metrics as JSON
 */
function getJsonMetrics() {
    const uptime = (Date.now() - metrics.startTime) / 1000;
    const mem = process.memoryUsage();

    return {
        uptime: `${uptime.toFixed(2)}s`,
        requests: metrics.requests,
        responseTimes: {
            count: metrics.responseTimes.total.length,
            p50: percentile(metrics.responseTimes.total, 50),
            p90: percentile(metrics.responseTimes.total, 90),
            p99: percentile(metrics.responseTimes.total, 99)
        },
        queue: metrics.queue,
        rateLimits: {
            exceeded: metrics.rateLimits.exceeded
        },
        circuitBreaker: metrics.circuitBreaker,
        memory: {
            rss: `${Math.round(mem.rss / 1024 / 1024)}MB`,
            heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)}MB`,
            heapTotal: `${Math.round(mem.heapTotal / 1024 / 1024)}MB`
        }
    };
}

/**
 * Reset metrics (for testing)
 */
function resetMetrics() {
    metrics.requests = { total: 0, success: 0, failed: 0, byProvider: {}, byStatusCode: {} };
    metrics.responseTimes = { total: [], byProvider: {} };
    metrics.queue = { added: 0, completed: 0, failed: 0, retried: 0 };
    metrics.rateLimits = { exceeded: 0, byIp: {} };
    metrics.circuitBreaker = { opened: 0, closed: 0, byProvider: {} };
    metrics.lastReset = Date.now();
}

module.exports = {
    recordRequest,
    recordQueueEvent,
    recordRateLimitExceeded,
    recordCircuitBreakerEvent,
    getPrometheusMetrics,
    getJsonMetrics,
    resetMetrics
};
