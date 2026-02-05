const { PERFORMANCE } = require('../config/constants');
const { logger } = require('../utils/securityLogger');

/**
 * Request Queue Service
 * Manages request queuing with priority support and retry mechanism
 * Uses in-memory queue with optional Redis backend via Bull
 */

// Queue configuration
const QUEUE_CONFIG = {
    MAX_CONCURRENT: parseInt(process.env.QUEUE_MAX_CONCURRENT || '10'),
    MAX_QUEUE_SIZE: parseInt(process.env.QUEUE_MAX_SIZE || '1000'),
    DEFAULT_PRIORITY: 5,
    PRIORITY_VIP: 1,
    PRIORITY_NORMAL: 5,
    PRIORITY_LOW: 10,
    JOB_TIMEOUT_MS: parseInt(process.env.QUEUE_JOB_TIMEOUT_MS || '120000'),
    RETRY_ATTEMPTS: parseInt(process.env.QUEUE_RETRY_ATTEMPTS || '3'),
    RETRY_DELAY_MS: parseInt(process.env.QUEUE_RETRY_DELAY_MS || '1000'),
    RETRY_BACKOFF_MULTIPLIER: 2
};

// In-memory queue implementation
class RequestQueue {
    constructor() {
        this.queue = [];
        this.processing = new Map();
        this.stats = {
            total: 0,
            completed: 0,
            failed: 0,
            retried: 0
        };
        this.bullQueue = null;
        this.isRedisAvailable = false;
    }

    /**
     * Initialize Bull queue if Redis is available
     */
    async initialize() {
        if (process.env.REDIS_URL) {
            try {
                const Queue = require('bull');
                this.bullQueue = new Queue('api-requests', process.env.REDIS_URL, {
                    defaultJobOptions: {
                        attempts: QUEUE_CONFIG.RETRY_ATTEMPTS,
                        backoff: {
                            type: 'exponential',
                            delay: QUEUE_CONFIG.RETRY_DELAY_MS
                        },
                        removeOnComplete: 100,
                        removeOnFail: 50,
                        timeout: QUEUE_CONFIG.JOB_TIMEOUT_MS
                    }
                });

                this.bullQueue.on('completed', (job, result) => {
                    this.stats.completed++;
                    logger.info('Queue job completed', { jobId: job.id });
                });

                this.bullQueue.on('failed', (job, err) => {
                    this.stats.failed++;
                    logger.error('Queue job failed', { jobId: job.id, error: err.message });
                });

                this.bullQueue.on('stalled', (job) => {
                    logger.warn('Queue job stalled', { jobId: job.id });
                });

                this.isRedisAvailable = true;
                console.log('✅ Bull Queue initialized with Redis');
                return true;
            } catch (error) {
                console.warn('⚠️  Bull Queue unavailable, using in-memory queue:', error.message);
            }
        }
        return false;
    }

    /**
     * Add a job to the queue
     * @param {Object} jobData - Job data to process
     * @param {Object} options - Queue options
     * @returns {Promise<Object>} Job info
     */
    async add(jobData, options = {}) {
        const priority = options.priority || QUEUE_CONFIG.DEFAULT_PRIORITY;
        const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Check queue size limit
        const currentSize = this.isRedisAvailable
            ? await this.bullQueue.getWaitingCount()
            : this.queue.length;

        if (currentSize >= QUEUE_CONFIG.MAX_QUEUE_SIZE) {
            throw new Error('Queue is full. Please try again later.');
        }

        if (this.isRedisAvailable && this.bullQueue) {
            // Use Bull queue
            const job = await this.bullQueue.add(jobData, {
                priority,
                jobId,
                ...options
            });
            this.stats.total++;
            return { id: job.id, position: await this.bullQueue.getWaitingCount() };
        }

        // Use in-memory queue
        const job = {
            id: jobId,
            data: jobData,
            priority,
            attempts: 0,
            maxAttempts: options.attempts || QUEUE_CONFIG.RETRY_ATTEMPTS,
            createdAt: Date.now(),
            options
        };

        // Insert based on priority (lower number = higher priority)
        const insertIndex = this.queue.findIndex(j => j.priority > priority);
        if (insertIndex === -1) {
            this.queue.push(job);
        } else {
            this.queue.splice(insertIndex, 0, job);
        }

        this.stats.total++;
        return { id: jobId, position: this.queue.length };
    }

    /**
     * Process queue jobs
     * @param {Function} processor - Async function to process each job
     */
    async process(processor) {
        if (this.isRedisAvailable && this.bullQueue) {
            this.bullQueue.process(QUEUE_CONFIG.MAX_CONCURRENT, async (job) => {
                return await processor(job.data);
            });
            return;
        }

        // In-memory queue processing
        this._processMemoryQueue(processor);
    }

    /**
     * Process in-memory queue
     * @private
     */
    async _processMemoryQueue(processor) {
        const processNext = async () => {
            if (this.processing.size >= QUEUE_CONFIG.MAX_CONCURRENT) {
                return;
            }

            const job = this.queue.shift();
            if (!job) {
                return;
            }

            this.processing.set(job.id, job);

            try {
                const result = await processor(job.data);
                this.stats.completed++;
                return result;
            } catch (error) {
                job.attempts++;

                if (job.attempts < job.maxAttempts) {
                    // Retry with exponential backoff
                    const delay = QUEUE_CONFIG.RETRY_DELAY_MS *
                        Math.pow(QUEUE_CONFIG.RETRY_BACKOFF_MULTIPLIER, job.attempts - 1);

                    this.stats.retried++;
                    logger.warn('Retrying job', {
                        jobId: job.id,
                        attempt: job.attempts,
                        delay
                    });

                    setTimeout(() => {
                        this.queue.unshift(job); // Add back to front for priority
                        processNext();
                    }, delay);
                } else {
                    this.stats.failed++;
                    logger.error('Job failed after max attempts', {
                        jobId: job.id,
                        error: error.message
                    });
                    throw error;
                }
            } finally {
                this.processing.delete(job.id);
            }
        };

        // Start processing
        setInterval(() => {
            if (this.queue.length > 0 && this.processing.size < QUEUE_CONFIG.MAX_CONCURRENT) {
                processNext();
            }
        }, 100);
    }

    /**
     * Get queue statistics
     */
    async getStats() {
        if (this.isRedisAvailable && this.bullQueue) {
            const [waiting, active, completed, failed] = await Promise.all([
                this.bullQueue.getWaitingCount(),
                this.bullQueue.getActiveCount(),
                this.bullQueue.getCompletedCount(),
                this.bullQueue.getFailedCount()
            ]);

            return {
                type: 'bull',
                waiting,
                active,
                completed,
                failed,
                ...this.stats
            };
        }

        return {
            type: 'memory',
            waiting: this.queue.length,
            active: this.processing.size,
            ...this.stats
        };
    }

    /**
     * Get job by ID
     */
    async getJob(jobId) {
        if (this.isRedisAvailable && this.bullQueue) {
            return await this.bullQueue.getJob(jobId);
        }

        return this.queue.find(j => j.id === jobId) ||
            this.processing.get(jobId) ||
            null;
    }

    /**
     * Pause queue processing
     */
    async pause() {
        if (this.isRedisAvailable && this.bullQueue) {
            await this.bullQueue.pause();
        }
        logger.info('Queue paused');
    }

    /**
     * Resume queue processing
     */
    async resume() {
        if (this.isRedisAvailable && this.bullQueue) {
            await this.bullQueue.resume();
        }
        logger.info('Queue resumed');
    }

    /**
     * Clean up completed/failed jobs
     */
    async clean(grace = 1000) {
        if (this.isRedisAvailable && this.bullQueue) {
            await this.bullQueue.clean(grace, 'completed');
            await this.bullQueue.clean(grace, 'failed');
        }
        logger.info('Queue cleaned');
    }

    /**
     * Close queue connections
     */
    async close() {
        if (this.isRedisAvailable && this.bullQueue) {
            await this.bullQueue.close();
        }
        logger.info('Queue closed');
    }
}

// Singleton instance
const requestQueue = new RequestQueue();

// Initialize on module load
(async () => {
    await requestQueue.initialize();
})();

module.exports = {
    requestQueue,
    QUEUE_CONFIG,
    RequestQueue
};
