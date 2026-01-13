const { PrismaClient } = require('@prisma/client');
const { DATABASE } = require('../config/constants');

// Lazy-load logger to avoid circular dependency issues
let _logger = null;
const getLogger = () => {
  if (!_logger) {
    try {
      _logger = require('../utils/securityLogger').logger;
    } catch {
      // Fallback to console if logger not available
      _logger = console;
    }
  }
  return _logger;
};

/**
 * Enhanced Prisma Client with optimized connection settings
 * For production stability and better resource management
 */

// Connection pool configuration optimized for different environments
const getPrismaConfig = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  const isPostgres = process.env.DATABASE_URL?.includes('postgresql') || process.env.DATABASE_URL?.includes('postgres');

  const baseConfig = {
    log: isProduction ? ['error', 'warn'] : ['query', 'info', 'warn', 'error'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  };

  // Add connection pooling for PostgreSQL/MySQL
  if (isPostgres) {
    baseConfig.__internal = {
      engine: {
        connectionLimit: DATABASE.CONNECTION_POOL_MAX,
        connectTimeout: DATABASE.QUERY_TIMEOUT_MS,
        idleTimeout: DATABASE.IDLE_TIMEOUT_MS,
      },
    };
  }

  // Add performance optimizations for production
  if (isProduction) {
    baseConfig.__internal = baseConfig.__internal || {};
    baseConfig.__internal.engine = {
      ...baseConfig.__internal.engine,
      binaryTargets: ['native'],
      // Enable connection reuse
      poolMin: DATABASE.CONNECTION_POOL_MIN,
      // Optimize for high throughput
      maxConcurrentQueries: 50,
    };
  }

  return baseConfig;
};

// Create Prisma client instance with optimized configuration
const prisma = new PrismaClient(getPrismaConfig());

/**
 * Enhanced graceful disconnect with timeout
 */
const disconnectPrisma = async () => {
  try {
    // Add timeout to prevent hanging
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database disconnect timeout')), DATABASE.QUERY_TIMEOUT_MS);
    });

    const disconnectPromise = prisma.$disconnect();

    await Promise.race([disconnectPromise, timeoutPromise]);
    getLogger().info('Database disconnected gracefully');
  } catch (error) {
    getLogger().error('Error disconnecting database', { error: error.message });
    // Continue with shutdown even if disconnect fails
  }
};

/**
 * Health check for database connection
 */
const checkDatabaseHealth = async () => {
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const latency = Date.now() - start;

    return {
      status: 'healthy',
      latency: `${latency}ms`,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
};

/**
 * Get database connection metrics
 */
const getConnectionMetrics = () => {
  // This would require monitoring tools in production
  // For now, return basic status
  return {
    clientConnected: !!prisma,
    databaseUrl: process.env.DATABASE_URL ? 'configured' : 'not configured',
    timestamp: new Date().toISOString()
  };
};

// Handle process termination
process.on('beforeExit', disconnectPrisma);
process.on('SIGTERM', disconnectPrisma);
process.on('SIGINT', disconnectPrisma);

module.exports = prisma;
module.exports.checkDatabaseHealth = checkDatabaseHealth;
module.exports.getConnectionMetrics = getConnectionMetrics;
module.exports.disconnectPrisma = disconnectPrisma;
