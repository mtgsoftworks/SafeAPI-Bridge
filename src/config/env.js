require('dotenv').config();

const config = {
  // Server
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

  // JWT
  jwtSecret: process.env.JWT_SECRET || 'default-secret-change-in-production',
  jwtExpiresIn: '7d',

  // OpenAI
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
  },

  // Google Gemini
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    baseUrl: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta'
  },

  // Anthropic Claude
  claude: {
    apiKey: process.env.CLAUDE_API_KEY,
    baseUrl: process.env.CLAUDE_BASE_URL || 'https://api.anthropic.com/v1'
  },

  // Other APIs (optional)
  groq: {
    apiKey: process.env.GROQ_API_KEY,
    baseUrl: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1'
  },

  mistral: {
    apiKey: process.env.MISTRAL_API_KEY,
    baseUrl: process.env.MISTRAL_BASE_URL || 'https://api.mistral.ai/v1'
  },

  // Rate Limiting
  rateLimiting: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 3600000, // 1 hour
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100
  },

  // CORS
  allowedOrigins: process.env.ALLOWED_ORIGINS
    ? (process.env.ALLOWED_ORIGINS === 'none'
        ? []
        : process.env.ALLOWED_ORIGINS
            .split(',')
            .map(o => o.trim())
            .filter(Boolean))
    : (process.env.NODE_ENV === 'production' ? [] : ['http://localhost:3000']),

  // Mobile allowances (no Origin header from native apps)
  allowMobileNoOrigin: process.env.ALLOW_MOBILE_NO_ORIGIN !== 'false'
};

// Validate required config
const validateConfig = () => {
  const requiredVars = ['JWT_SECRET'];
  const missing = requiredVars.filter(key => !process.env[key]);

  if (missing.length > 0 && config.nodeEnv === 'production') {
    // In production, JWT secret must be provided
    throw new Error(`Missing required environment variables in production: ${missing.join(', ')}`);
  }

  // Check if at least one API key is configured
  const hasApiKey = config.openai.apiKey || config.gemini.apiKey || config.claude.apiKey;
  if (!hasApiKey) {
    console.warn('⚠️  Warning: No API keys configured. Please add at least one API key to .env file');
  }
};

validateConfig();

module.exports = config;
