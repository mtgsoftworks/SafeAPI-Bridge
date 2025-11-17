// Allowed endpoints configuration for each API
// This whitelist ensures only specific endpoints can be accessed through the proxy

const allowedEndpoints = {
  openai: [
    '/chat/completions',
    '/completions',
    '/embeddings',
    '/models'
  ],

  gemini: [
    '/models',
    // Legacy models
    '/models/gemini-pro:generateContent',
    '/models/gemini-pro-vision:generateContent',
    '/models/gemini-1.5-pro:generateContent',
    '/models/gemini-1.5-flash:generateContent',
    // Latest models (2025)
    '/models/gemini-2.5-flash:generateContent',
    '/models/gemini-2.5-pro:generateContent',
    '/models/gemini-2.5-flash-lite:generateContent',
    '/models/gemini-2.0-flash:generateContent',
    '/models/gemini-2.0-flash-001:generateContent',
    '/models/gemini-2.0-flash-lite:generateContent',
    '/models/gemini-2.0-flash-lite-001:generateContent',
    // Embeddings
    '/models/embedding-001',
    '/models/text-embedding-004'
  ],

  claude: [
    '/messages',
    '/models'
  ],

  groq: [
    '/chat/completions',
    '/models'
  ],

  mistral: [
    '/chat/completions',
    '/embeddings',
    '/models'
  ],

  zai: [
    '/chat/completions',
    '/models'
  ],

  deepseek: [
    '/chat/completions',
    '/completions',
    '/embeddings',
    '/models'
  ],

  perplexity: [
    '/chat/completions',
    '/completions',
    '/models'
  ],

  together: [
    '/chat/completions',
    '/completions',
    '/embeddings',
    '/models'
  ],

  openrouter: [
    '/chat/completions',
    '/completions',
    '/embeddings',
    '/models'
  ],

  fireworks: [
    '/chat/completions',
    '/embeddings',
    '/models'
  ],

  github: [
    '/v1/chat/completions',
    '/v1/completions',
    '/v1/embeddings',
    '/v1/models'
  ],

  replicate: [
    '/predictions',
    '/deployments',
    '/models'
  ],

  stability: [
    '/v1/generation',
    '/v1/user',
    '/v1beta/generation'
  ],

  fal: [
    '/v1',
    '/run'
  ],

  elevenlabs: [
    '/text-to-speech',
    '/voices',
    '/models',
    '/speech-to-speech',
    '/history'
  ],

  brave: [
    '/web/search'
  ],

  deepl: [
    '/translate',
    '/glossary',
    '/usage'
  ],

  openmeteo: [
    '/forecast'
  ]
};

// API-specific headers configuration
const apiHeaders = {
  openai: (apiKey) => ({
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  }),

  gemini: (apiKey) => ({
    'Content-Type': 'application/json'
    // Note: Gemini uses API key as query parameter, not header
  }),

  claude: (apiKey) => ({
    'x-api-key': apiKey,
    'anthropic-version': '2025-06-01', // Updated for Claude 4 models (2025)
    'Content-Type': 'application/json'
  }),

  groq: (apiKey) => ({
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  }),

  mistral: (apiKey) => ({
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  }),

  zai: (apiKey) => ({
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  }),

  deepseek: (apiKey) => ({
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  }),

  perplexity: (apiKey) => ({
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  }),

  together: (apiKey) => ({
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  }),

  openrouter: (apiKey) => ({
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  }),

  fireworks: (apiKey) => ({
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  }),

  github: (apiKey) => ({
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  }),

  replicate: (apiKey) => ({
    'Authorization': `Token ${apiKey}`,
    'Content-Type': 'application/json'
  }),

  stability: (apiKey) => ({
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  }),

  fal: (apiKey) => ({
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  }),

  elevenlabs: (apiKey) => ({
    'xi-api-key': apiKey,
    'Content-Type': 'application/json'
  }),

  brave: (apiKey) => ({
    'X-Subscription-Token': apiKey,
    'Content-Type': 'application/json'
  }),

  deepl: (apiKey) => ({
    'Authorization': `DeepL-Auth-Key ${apiKey}`,
    'Content-Type': 'application/json'
  }),

  openmeteo: () => ({
    // Open-Meteo does not require an API key
    'Content-Type': 'application/json'
  })
};

// Check if endpoint is allowed for specific API
const isEndpointAllowed = (api, endpoint) => {
  if (!allowedEndpoints[api]) {
    return false;
  }

  // Exact match or startsWith match
  return allowedEndpoints[api].some(allowed =>
    endpoint === allowed || endpoint.startsWith(allowed)
  );
};

module.exports = {
  allowedEndpoints,
  apiHeaders,
  isEndpointAllowed
};
