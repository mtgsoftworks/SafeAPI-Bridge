const { PrismaClient } = require('@prisma/client');

/**
 * Prisma Client with optimized connection settings
 * For production stability and better resource management
 */

// Create Prisma client instance with connection pool settings
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],

  // Connection pool configuration (for PostgreSQL/MySQL)
  // For SQLite, these are ignored but included for future migration
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

/**
 * Graceful disconnect
 */
const disconnectPrisma = async () => {
  try {
    await prisma.$disconnect();
    console.log('✅ Database disconnected gracefully');
  } catch (error) {
    console.error('❌ Error disconnecting database:', error.message);
  }
};

// Handle process termination
process.on('beforeExit', disconnectPrisma);
process.on('SIGTERM', disconnectPrisma);
process.on('SIGINT', disconnectPrisma);

module.exports = prisma;
