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
