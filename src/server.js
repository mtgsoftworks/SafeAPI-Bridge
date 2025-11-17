const express = require('express');
const helmet = require('helmet');
const config = require('./config/env');

// Middleware
const corsConfig = require('./middleware/corsConfig');
const logger = require('./middleware/logger');
const { limiter } = require('./middleware/rateLimiter');
const { errorMiddleware, notFoundHandler } = require('./utils/errorHandler');
const { securityMonitor } = require('./middleware/securityMonitor');
const httpsEnforcement = require('./middleware/httpsEnforcement');
const requestTimeout = require('./middleware/requestTimeout');

// Routes
const authRoutes = require('./routes/auth');
const proxyRoutes = require('./routes/proxy');
const adminRoutes = require('./routes/admin');
const analyticsRoutes = require('./routes/analytics');
const splitKeyRoutes = require('./routes/splitKey');
const { healthCheck } = require('./controllers/proxy');

// Initialize Express app
const app = express();

// Trust proxy (important for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// Remove X-Powered-By header
app.disable('x-powered-by');

// Security middleware with HSTS
app.use(helmet({
  hsts: {
    maxAge: 31536000, // 1 year in seconds
    includeSubDomains: true,
    preload: true
  },
  contentSecurityPolicy: false // Allow external API calls
}));

// HTTPS enforcement (production only)
app.use(httpsEnforcement);

// CORS
app.use(corsConfig);

// Body parser with reduced limit for security
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Request timeout protection
app.use(requestTimeout);

// Logging
app.use(logger);

// Security monitoring (detects suspicious patterns)
app.use(securityMonitor);

// Rate limiting applied only to API routes (exclude '/' and '/health')
app.use('/api', limiter);

// Health check endpoint (no auth required)
app.get('/', (req, res) => {
  res.json({
    service: 'SafeAPI-Bridge',
    status: 'running',
    version: '1.0.0',
    message: 'Server is healthy. Use /health for detailed status.'
  });
});

app.get('/health', healthCheck);

// Routes
app.use('/auth', authRoutes);
app.use('/api', proxyRoutes);
app.use('/api/split-key', splitKeyRoutes);
app.use('/admin', adminRoutes);
app.use('/analytics', analyticsRoutes);

// 404 handler
app.use(notFoundHandler);

// Error handling middleware (must be last)
app.use(errorMiddleware);

// Start server with keep-alive configuration
const PORT = config.port;
const server = app.listen(PORT, () => {
  console.log('\n' + '='.repeat(50));
  console.log('🚀 SafeAPI-Bridge Started');
  console.log('='.repeat(50));
  console.log(`📡 Server running on port: ${PORT}`);
  console.log(`🌍 Environment: ${config.nodeEnv}`);
  console.log(`🔗 Base URL: http://localhost:${PORT}`);
  console.log('='.repeat(50));
  console.log('\n📋 Available Endpoints:');
  console.log('  GET  /           - Service info');
  console.log('  GET  /health     - Health check');
  console.log('  POST /auth/token - Generate JWT token (auto-creates user)');
  console.log('  GET  /auth/verify - Verify JWT token');
  console.log('  POST /api/:api/proxy - Proxy to AI API (supports both Server Key & BYOK)');
  console.log('  GET  /api/:api/endpoints - Get allowed endpoints');
  console.log('  POST /api/split-key/split - Split API key for BYOK usage');
  console.log('  GET  /api/split-key - List split keys');
  console.log('  GET  /api/split-key/:keyId - Get split key info');
  console.log('  DELETE /api/split-key/:keyId - Deactivate split key');
  console.log('  POST /api/split-key/validate - Validate split key headers');
  console.log('  GET  /analytics/* - Usage analytics');
  console.log('  * /admin/* - Admin panel (requires X-Admin-Key)');
  console.log('\n🔐 Authentication Methods:');
  console.log('  • Server Key: Use API keys from server .env file');
  console.log('  • BYOK Split Key: Users bring their own split API keys');
  console.log('\n🤖 Supported APIs:');
  console.log(`  - OpenAI: ${config.openai.apiKey ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`  - Gemini: ${config.gemini.apiKey ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`  - Claude: ${config.claude.apiKey ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`  - Groq: ${config.groq.apiKey ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`  - Mistral: ${config.mistral.apiKey ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`  - Z.ai (GLM): ${config.zai.apiKey ? '✅ Configured' : '❌ Not configured'}`);
  console.log('\n⚙️  Configuration:');
  console.log(`  - Rate Limit: ${config.rateLimiting.maxRequests} requests per ${config.rateLimiting.windowMs / 1000 / 60} minutes`);
  console.log(`  - JWT Expiry: ${config.jwtExpiresIn}`);
  console.log(`  - Request Timeout: ${process.env.REQUEST_TIMEOUT_MS || 30000}ms`);
  console.log(`  - Body Size Limit: 2MB`);
  console.log('='.repeat(50) + '\n');
});

// Configure HTTP keep-alive for better connection reuse (tuned for Render)
server.keepAliveTimeout = 60000; // 60 seconds
server.headersTimeout = 65000; // Slightly higher than keepAliveTimeout

// Memory monitoring (log every 5 minutes in production)
if (config.nodeEnv === 'production' && process.env.LIGHT_MODE !== 'true') {
  const memoryMonitor = setInterval(() => {
    const usage = process.memoryUsage();
    console.log('📊 Memory Usage:', {
      rss: `${Math.round(usage.rss / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
      external: `${Math.round(usage.external / 1024 / 1024)}MB`
    });
  }, 5 * 60 * 1000); // Every 5 minutes

  // Clear interval on shutdown
  process.on('beforeExit', () => clearInterval(memoryMonitor));
}

/**
 * Graceful shutdown handler
 * Ensures clean shutdown of all resources
 */
let isShuttingDown = false;

const gracefulShutdown = async (signal) => {
  if (isShuttingDown) {
    console.log('⚠️  Shutdown already in progress...');
    return;
  }

  isShuttingDown = true;
  console.log(`\n⚠️  ${signal} received. Starting graceful shutdown...`);

  // Stop accepting new connections
  server.close(async () => {
    console.log('✅ Server stopped accepting new connections');

    try {
      // Close database connections
      const prisma = require('./db/client');
      await prisma.$disconnect();
      console.log('✅ Database connections closed');

      // No Redis connections to close (removed)

      console.log('✅ Graceful shutdown complete');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  });

  // Force shutdown after 15 seconds if graceful shutdown fails
  setTimeout(() => {
    console.error('❌ Graceful shutdown timeout. Forcing exit...');
    process.exit(1);
  }, 15000);
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

/**
 * Uncaught exception handler
 * Logs error and attempts graceful shutdown
 */
process.on('uncaughtException', (error) => {
  console.error('❌ UNCAUGHT EXCEPTION:', error);
  console.error('Stack:', error.stack);

  const { logger } = require('./utils/securityLogger');
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack,
    type: 'uncaughtException'
  });

  // Attempt graceful shutdown
  gracefulShutdown('uncaughtException');
});

/**
 * Unhandled promise rejection handler
 * Logs error and attempts graceful shutdown
 */
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ UNHANDLED REJECTION at:', promise, 'reason:', reason);

  const { logger } = require('./utils/securityLogger');
  logger.error('Unhandled Promise Rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
    type: 'unhandledRejection'
  });

  // Attempt graceful shutdown
  gracefulShutdown('unhandledRejection');
});

module.exports = app;
