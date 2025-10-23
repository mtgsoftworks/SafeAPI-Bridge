const express = require('express');
const helmet = require('helmet');
const config = require('./config/env');

// Middleware
const corsConfig = require('./middleware/corsConfig');
const logger = require('./middleware/logger');
const { limiter } = require('./middleware/rateLimiter');
const { errorMiddleware, notFoundHandler } = require('./utils/errorHandler');

// Routes
const authRoutes = require('./routes/auth');
const proxyRoutes = require('./routes/proxy');
const adminRoutes = require('./routes/admin');
const analyticsRoutes = require('./routes/analytics');
const { healthCheck } = require('./controllers/proxy');

// Initialize Express app
const app = express();

// Trust proxy (important for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// Remove X-Powered-By header
app.disable('x-powered-by');

// Security middleware
app.use(helmet());

// CORS
app.use(corsConfig);

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
app.use(logger);

// Rate limiting (global)
app.use(limiter);

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
app.use('/admin', adminRoutes);
app.use('/analytics', analyticsRoutes);

// 404 handler
app.use(notFoundHandler);

// Error handling middleware (must be last)
app.use(errorMiddleware);

// Start server
const PORT = config.port;
app.listen(PORT, () => {
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
  console.log('  POST /api/:api/proxy - Proxy to AI API');
  console.log('  GET  /api/:api/endpoints - Get allowed endpoints');
  console.log('  GET  /analytics/* - Usage analytics');
  console.log('  * /admin/* - Admin panel (requires X-Admin-Key)');
  console.log('\n🤖 Supported APIs:');
  console.log(`  - OpenAI: ${config.openai.apiKey ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`  - Gemini: ${config.gemini.apiKey ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`  - Claude: ${config.claude.apiKey ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`  - Groq: ${config.groq.apiKey ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`  - Mistral: ${config.mistral.apiKey ? '✅ Configured' : '❌ Not configured'}`);
  console.log('\n⚙️  Configuration:');
  console.log(`  - Rate Limit: ${config.rateLimiting.maxRequests} requests per ${config.rateLimiting.windowMs / 1000 / 60} minutes`);
  console.log(`  - JWT Expiry: ${config.jwtExpiresIn}`);
  console.log('='.repeat(50) + '\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('⚠️  SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n⚠️  SIGINT received. Shutting down gracefully...');
  process.exit(0);
});

module.exports = app;
