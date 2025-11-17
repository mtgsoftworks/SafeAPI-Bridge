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

  // Other LLM APIs (optional)
  groq: {
    apiKey: process.env.GROQ_API_KEY,
    baseUrl: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1'
  },

  mistral: {
    apiKey: process.env.MISTRAL_API_KEY,
    baseUrl: process.env.MISTRAL_BASE_URL || 'https://api.mistral.ai/v1'
  },

  // Z.ai GLM (OpenAI-compatible chat completions)
  zai: {
    apiKey: process.env.ZAI_API_KEY,
    // Example GLM-4.6 endpoint:
    // https://api.z.ai/api/paas/v4/chat/completions
    baseUrl: process.env.ZAI_BASE_URL || 'https://api.z.ai/api/paas/v4'
  },

  // Additional LLM providers
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
  },

  perplexity: {
    apiKey: process.env.PERPLEXITY_API_KEY,
    baseUrl: process.env.PERPLEXITY_BASE_URL || 'https://api.perplexity.ai'
  },

  together: {
    apiKey: process.env.TOGETHER_API_KEY,
    baseUrl: process.env.TOGETHER_BASE_URL || 'https://api.together.xyz/v1'
  },

  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY,
    baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'
  },

  fireworks: {
    apiKey: process.env.FIREWORKS_API_KEY,
    baseUrl: process.env.FIREWORKS_BASE_URL || 'https://api.fireworks.ai/inference/v1'
  },

  // Image / video providers
  replicate: {
    apiKey: process.env.REPLICATE_API_KEY,
    baseUrl: process.env.REPLICATE_BASE_URL || 'https://api.replicate.com/v1'
  },

  stability: {
    apiKey: process.env.STABILITY_API_KEY,
    baseUrl: process.env.STABILITY_BASE_URL || 'https://api.stability.ai'
  },

  fal: {
    apiKey: process.env.FAL_API_KEY,
    baseUrl: process.env.FAL_BASE_URL || 'https://fal.ai/api'
  },

  // Audio
  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY,
    baseUrl: process.env.ELEVENLABS_BASE_URL || 'https://api.elevenlabs.io/v1'
  },

  // Other APIs
  brave: {
    apiKey: process.env.BRAVE_API_KEY,
    baseUrl: process.env.BRAVE_BASE_URL || 'https://api.search.brave.com/res/v1'
  },

  deepl: {
    apiKey: process.env.DEEPL_API_KEY,
    baseUrl: process.env.DEEPL_BASE_URL || 'https://api-free.deepl.com/v2'
  },

  openmeteo: {
    apiKey: process.env.OPENMETEO_API_KEY,
    baseUrl: process.env.OPENMETEO_BASE_URL || 'https://api.open-meteo.com/v1'
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
  const hasApiKey =
    config.openai.apiKey ||
    config.gemini.apiKey ||
    config.claude.apiKey ||
    config.groq.apiKey ||
    config.mistral.apiKey ||
    config.zai.apiKey ||
    config.deepseek.apiKey ||
    config.perplexity.apiKey ||
    config.together.apiKey ||
    config.openrouter.apiKey ||
    config.fireworks.apiKey ||
    config.replicate.apiKey ||
    config.stability.apiKey ||
    config.fal.apiKey ||
    config.elevenlabs.apiKey ||
    config.brave.apiKey ||
    config.deepl.apiKey ||
    config.openmeteo.apiKey;
  if (!hasApiKey) {
    console.warn('⚠️  Warning: No API keys configured. Please add at least one API key to .env file');
  }
};

validateConfig();

module.exports = config;
