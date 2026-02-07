require('dotenv').config();

// Determine environment first (before config object)
const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

// Validate JWT secret before config initialization
const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (isProduction) {
      throw new Error('JWT_SECRET environment variable is REQUIRED in production');
    }
    console.warn('⚠️  WARNING: Using default JWT secret for development only. Set JWT_SECRET in production!');
    return 'development-secret-change-before-production';
  }
  return secret;
};

const config = {
  // Server
  port: process.env.PORT || 3000,
  nodeEnv,
  isProduction,

  // JWT
  jwtSecret: getJwtSecret(),
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

  // GitHub Models (OpenAI-compatible)
  github: {
    apiKey: process.env.GITHUB_MODELS_API_KEY || process.env.GITHUB_TOKEN,
    // Example base from usage.txt: https://models.github.ai/inference
    baseUrl: process.env.GITHUB_MODELS_BASE_URL || 'https://models.github.ai/inference'
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

  // Provider-specific timeouts (ms)
  // Falls back to UPSTREAM_TIMEOUT_MS or default 60000ms
  providerTimeouts: {
    openai: parseInt(process.env.OPENAI_TIMEOUT_MS) || parseInt(process.env.UPSTREAM_TIMEOUT_MS) || 60000,
    gemini: parseInt(process.env.GEMINI_TIMEOUT_MS) || parseInt(process.env.UPSTREAM_TIMEOUT_MS) || 60000,
    claude: parseInt(process.env.CLAUDE_TIMEOUT_MS) || parseInt(process.env.UPSTREAM_TIMEOUT_MS) || 90000, // Claude can be slower
    groq: parseInt(process.env.GROQ_TIMEOUT_MS) || parseInt(process.env.UPSTREAM_TIMEOUT_MS) || 30000, // Groq is fast
    mistral: parseInt(process.env.MISTRAL_TIMEOUT_MS) || parseInt(process.env.UPSTREAM_TIMEOUT_MS) || 60000,
    deepseek: parseInt(process.env.DEEPSEEK_TIMEOUT_MS) || parseInt(process.env.UPSTREAM_TIMEOUT_MS) || 60000,
    perplexity: parseInt(process.env.PERPLEXITY_TIMEOUT_MS) || parseInt(process.env.UPSTREAM_TIMEOUT_MS) || 60000,
    together: parseInt(process.env.TOGETHER_TIMEOUT_MS) || parseInt(process.env.UPSTREAM_TIMEOUT_MS) || 60000,
    openrouter: parseInt(process.env.OPENROUTER_TIMEOUT_MS) || parseInt(process.env.UPSTREAM_TIMEOUT_MS) || 90000,
    fireworks: parseInt(process.env.FIREWORKS_TIMEOUT_MS) || parseInt(process.env.UPSTREAM_TIMEOUT_MS) || 60000,
    github: parseInt(process.env.GITHUB_TIMEOUT_MS) || parseInt(process.env.UPSTREAM_TIMEOUT_MS) || 60000,
    replicate: parseInt(process.env.REPLICATE_TIMEOUT_MS) || parseInt(process.env.UPSTREAM_TIMEOUT_MS) || 120000, // Image gen slower
    stability: parseInt(process.env.STABILITY_TIMEOUT_MS) || parseInt(process.env.UPSTREAM_TIMEOUT_MS) || 120000,
    fal: parseInt(process.env.FAL_TIMEOUT_MS) || parseInt(process.env.UPSTREAM_TIMEOUT_MS) || 120000,
    elevenlabs: parseInt(process.env.ELEVENLABS_TIMEOUT_MS) || parseInt(process.env.UPSTREAM_TIMEOUT_MS) || 60000,
    zai: parseInt(process.env.ZAI_TIMEOUT_MS) || parseInt(process.env.UPSTREAM_TIMEOUT_MS) || 60000,
    brave: parseInt(process.env.BRAVE_TIMEOUT_MS) || parseInt(process.env.UPSTREAM_TIMEOUT_MS) || 30000,
    deepl: parseInt(process.env.DEEPL_TIMEOUT_MS) || parseInt(process.env.UPSTREAM_TIMEOUT_MS) || 30000,
    openmeteo: parseInt(process.env.OPENMETEO_TIMEOUT_MS) || parseInt(process.env.UPSTREAM_TIMEOUT_MS) || 15000
  },

  // Provider-specific Rate Limits (requests per window)
  // Default window is 1 minute (60000ms)
  providerRatelimits: {
    openai: { max: parseInt(process.env.RATE_LIMIT_OPENAI_MAX) || 500, windowMs: 60000 },
    gemini: { max: parseInt(process.env.RATE_LIMIT_GEMINI_MAX) || 60, windowMs: 60000 },
    claude: { max: parseInt(process.env.RATE_LIMIT_CLAUDE_MAX) || 50, windowMs: 60000 },
    groq: { max: parseInt(process.env.RATE_LIMIT_GROQ_MAX) || 100, windowMs: 60000 },
    // Default for others
    default: { max: parseInt(process.env.RATE_LIMIT_DEFAULT_MAX) || 100, windowMs: 60000 }
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

  if (missing.length > 0) {
    if (isProduction) {
      throw new Error(`CRITICAL: Missing required environment variables in production: ${missing.join(', ')}`);
    }
    console.warn(`⚠️  WARNING: Missing optional environment variables: ${missing.join(', ')}`);
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
    config.github.apiKey ||
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
