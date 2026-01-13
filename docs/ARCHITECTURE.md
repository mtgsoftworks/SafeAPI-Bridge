# SafeAPI-Bridge Architecture

## Overview

SafeAPI-Bridge is a secure API proxy server designed to protect AI API keys from client-side exposure. It sits between your client applications (mobile, web, backend) and AI providers, ensuring API keys never leave the server.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT APPLICATIONS                            │
├─────────────────┬─────────────────┬─────────────────┬──────────────────────┤
│   Android App   │    iOS App      │   Web Frontend  │   Backend Service    │
│   (Kotlin/Java) │    (Swift)      │   (React/Vue)   │   (Node/Python)      │
└────────┬────────┴────────┬────────┴────────┬────────┴──────────┬───────────┘
         │                 │                 │                   │
         │    JWT Token + Request Body + Optional BYOK Headers   │
         └─────────────────┴─────────────────┴───────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SAFEAPI-BRIDGE SERVER                              │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                        MIDDLEWARE PIPELINE                            │  │
│  │                                                                       │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │  │
│  │  │  Request ID │→ │ Compression │→ │   Helmet    │→ │    HTTPS    │  │  │
│  │  │  Middleware │  │  (gzip/br)  │  │  (Security) │  │ Enforcement │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │  │
│  │         │                                                     │       │  │
│  │         ▼                                                     ▼       │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │  │
│  │  │    CORS     │→ │ Body Parser │→ │  Timeout    │→ │  Sanitizer  │  │  │
│  │  │   Config    │  │  (JSON/URL) │  │  Handler    │  │   (XSS)     │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │  │
│  │         │                                                     │       │  │
│  │         ▼                                                     ▼       │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │  │
│  │  │   Logger    │→ │  Security   │→ │    Rate     │→ │  IP Check   │  │  │
│  │  │  (Morgan)   │  │   Monitor   │  │   Limiter   │  │ (Whitelist) │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │  │
│  │         │                                                     │       │  │
│  │         ▼                                                     ▼       │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │  │
│  │  │  JWT Auth   │→ │ Quota Check │→ │ Split Key   │→ │  Validator  │  │  │
│  │  │ Middleware  │  │ (Daily/Mo)  │  │  (BYOK)     │  │  (Request)  │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│                                    ▼                                        │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                           ROUTE HANDLERS                              │  │
│  │                                                                       │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │  │
│  │  │  /auth   │  │   /api   │  │  /admin  │  │/analytics│  │/split-  │ │  │
│  │  │  routes  │  │  proxy   │  │  routes  │  │  routes  │  │  key    │ │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│                                    ▼                                        │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                            SERVICES                                   │  │
│  │                                                                       │  │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐          │  │
│  │  │ KeyResolution  │  │ ApiForwarding  │  │  SplitKey      │          │  │
│  │  │    Service     │  │    Service     │  │   Service      │          │  │
│  │  └────────────────┘  └────────────────┘  └────────────────┘          │  │
│  │                                                                       │  │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐          │  │
│  │  │ UsageTracking  │  │   Analytics    │  │   Webhook      │          │  │
│  │  │    Service     │  │    Service     │  │   Service      │          │  │
│  │  └────────────────┘  └────────────────┘  └────────────────┘          │  │
│  │                                                                       │  │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐          │  │
│  │  │ TokenBlacklist │  │   AuditLog     │  │    Cache       │          │  │
│  │  │    Service     │  │    Service     │  │   Service      │          │  │
│  │  └────────────────┘  └────────────────┘  └────────────────┘          │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│                                    ▼                                        │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         DATA LAYER                                    │  │
│  │                                                                       │  │
│  │  ┌────────────────────────────────────────────────────────────────┐  │  │
│  │  │                      PRISMA ORM                                │  │  │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │  │  │
│  │  │  │   User   │ │ ApiUsage │ │ SplitKey │ │  IpRule  │          │  │  │
│  │  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │  │  │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐                       │  │  │
│  │  │  │ Webhook  │ │  Admin   │ │ AuditLog │                       │  │  │
│  │  │  └──────────┘ └──────────┘ └──────────┘                       │  │  │
│  │  └────────────────────────────────────────────────────────────────┘  │  │
│  │                              │                                        │  │
│  │                              ▼                                        │  │
│  │  ┌──────────────────────────────────────────────────────────────┐    │  │
│  │  │  SQLite (dev) / PostgreSQL (prod)                            │    │  │
│  │  └──────────────────────────────────────────────────────────────┘    │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EXTERNAL AI PROVIDERS                               │
├────────────┬────────────┬────────────┬────────────┬────────────┬───────────┤
│   OpenAI   │   Gemini   │   Claude   │    Groq    │  Mistral   │    ...    │
│            │  (Google)  │ (Anthropic)│            │            │ (15 more) │
└────────────┴────────────┴────────────┴────────────┴────────────┴───────────┘
```

## Directory Structure

```
SafeAPI-Bridge/
├── src/
│   ├── server.js              # Application entry point
│   ├── config/
│   │   ├── apis.js            # API endpoints whitelist & headers
│   │   ├── constants.js       # Application constants
│   │   ├── env.js             # Environment configuration
│   │   └── securityPatterns.js # Security detection patterns
│   ├── controllers/
│   │   └── proxy.js           # Main proxy controller
│   ├── db/
│   │   └── client.js          # Prisma client with connection pooling
│   ├── middleware/
│   │   ├── adminAuth.js       # Admin authentication
│   │   ├── auth.js            # JWT authentication
│   │   ├── compression.js     # Response compression
│   │   ├── corsConfig.js      # CORS configuration
│   │   ├── httpsEnforcement.js # HTTPS redirect
│   │   ├── inputSanitizer.js  # XSS/injection prevention
│   │   ├── ipCheck.js         # IP whitelist/blacklist
│   │   ├── logger.js          # Request logging
│   │   ├── quotaCheck.js      # User quota enforcement
│   │   ├── rateLimiter.js     # Rate limiting
│   │   ├── requestId.js       # Request correlation
│   │   ├── requestTimeout.js  # Request timeout handler
│   │   ├── securityMonitor.js # Threat detection
│   │   └── splitKey.js        # BYOK split-key handling
│   ├── models/
│   │   ├── IpRule.js          # IP rule model
│   │   ├── Usage.js           # Usage model
│   │   └── User.js            # User model
│   ├── routes/
│   │   ├── admin.js           # Admin API routes
│   │   ├── analytics.js       # Analytics routes
│   │   ├── auth.js            # Authentication routes
│   │   ├── proxy.js           # Proxy routes
│   │   └── splitKey.js        # Split-key management routes
│   ├── services/
│   │   ├── analytics.js       # Analytics service
│   │   ├── apiForwarding.js   # API forwarding logic
│   │   ├── auditLog.js        # Audit logging service
│   │   ├── cacheService.js    # In-memory caching
│   │   ├── keyResolution.js   # API key resolution
│   │   ├── splitKey.js        # Split-key cryptography
│   │   ├── tokenBlacklist.js  # JWT blacklist service
│   │   ├── usage.js           # Usage tracking service
│   │   └── webhook.js         # Webhook delivery service
│   └── utils/
│       ├── crypto.js          # Cryptographic utilities
│       ├── errorHandler.js    # Error handling
│       ├── errorTypes.js      # Custom error classes
│       ├── lruCache.js        # LRU cache implementation
│       ├── responseFormatter.js # Response formatting
│       ├── securityLogger.js  # Security event logging
│       ├── urlValidator.js    # URL validation
│       └── validator.js       # Request validation
├── prisma/
│   ├── schema.prisma          # Database schema
│   └── migrations/            # Database migrations
├── tests/
│   ├── unit/                  # Unit tests
│   ├── integration/           # Integration tests
│   ├── security/              # Security tests
│   └── setup.js               # Test configuration
├── docs/                      # Documentation
├── scripts/                   # Utility scripts
└── logs/                      # Application logs
```

## Data Models

### User
Stores application users with quota management.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| userId | String | Unique user identifier |
| appId | String | Application identifier |
| apiKey | String | Generated API key |
| dailyQuota | Int | Daily request limit (default: 100) |
| monthlyQuota | Int | Monthly request limit (default: 3000) |
| requestsToday | Int | Today's request count |
| requestsMonth | Int | This month's request count |
| totalCost | Float | Accumulated API cost |
| active | Boolean | User status |

### SplitKey
BYOK split-key storage for secure key management.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| keyId | String | Public key identifier |
| apiProvider | String | Target API (openai, gemini, etc.) |
| serverPart | String | Encrypted server portion |
| clientPart | String | Client portion hash |
| decryptionSecret | String | Decryption secret |
| algorithm | String | Encryption algorithm (AES-256-GCM) |
| keyVersion | Int | Key rotation version |
| usageCount | Int | Usage counter |
| createdBy | String | Creator user ID |

### ApiUsage
Request tracking and analytics.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| userId | String | User reference |
| api | String | API provider |
| endpoint | String | Called endpoint |
| statusCode | Int | Response status |
| tokensUsed | Int | Token count |
| estimatedCost | Float | Estimated cost |
| responseTime | Int | Response time (ms) |
| ipAddress | String | Client IP |

### IpRule
IP whitelist/blacklist rules.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| ipAddress | String | IP address or CIDR |
| type | String | 'whitelist' or 'blacklist' |
| reason | String | Rule reason |
| active | Boolean | Rule status |

## Request Flow

### Server Key Method

```
1. Client → POST /auth/token { userId, appId }
   └── Server creates/retrieves user, returns JWT

2. Client → POST /api/openai/proxy
   Headers: Authorization: Bearer <JWT>
   Body: { endpoint: "/chat/completions", model: "gpt-4", messages: [...] }
   
   └── Middleware Pipeline:
       ├── requestId: Add correlation ID
       ├── compression: Prepare response compression
       ├── helmet: Add security headers
       ├── cors: Validate origin
       ├── bodyParser: Parse JSON body
       ├── inputSanitizer: Sanitize inputs
       ├── logger: Log request
       ├── securityMonitor: Check for threats
       ├── rateLimiter: Check rate limits
       ├── ipCheck: Verify IP allowed
       ├── authenticateToken: Verify JWT
       ├── quotaCheck: Verify quota available
       └── proxyRequest: Forward to OpenAI

3. Server → OpenAI API
   Headers: Authorization: Bearer <SERVER_API_KEY>
   
4. OpenAI → Server → Client
   └── Response forwarded, usage tracked
```

### BYOK Split-Key Method

```
1. Client → POST /api/split-key/split
   Headers: Authorization: Bearer <JWT>
   Body: { originalKey: "sk-...", apiProvider: "openai" }
   
   └── Server:
       ├── Encrypts key with AES-256-GCM
       ├── Splits into serverPart + clientPart
       ├── Stores serverPart + decryptionSecret in DB
       └── Returns keyId + clientPart to client

2. Client → POST /api/openai/proxy
   Headers:
     Authorization: Bearer <JWT>
     X-Partial-Key-Id: <keyId>
     X-Partial-Key: <clientPart>
   Body: { endpoint: "/chat/completions", ... }
   
   └── Middleware:
       ├── validateSplitKey: Validate BYOK headers
       ├── reconstructApiKey: Reconstruct original key in memory
       └── proxyRequest: Forward with reconstructed key
```

## Security Layers

1. **Transport Security**: HTTPS enforcement, HSTS
2. **Authentication**: JWT tokens with blacklist support
3. **Authorization**: IP whitelist/blacklist, quota limits
4. **Input Validation**: Request sanitization, endpoint whitelist
5. **Rate Limiting**: Per-IP and per-user limits
6. **Monitoring**: Security event logging, threat detection
7. **Key Protection**: Server-side keys or BYOK split-key encryption

## Supported AI Providers

| Provider | Base URL | Auth Method |
|----------|----------|-------------|
| OpenAI | api.openai.com/v1 | Bearer token |
| Gemini | generativelanguage.googleapis.com/v1beta | Query param |
| Claude | api.anthropic.com/v1 | x-api-key header |
| Groq | api.groq.com/openai/v1 | Bearer token |
| Mistral | api.mistral.ai/v1 | Bearer token |
| DeepSeek | api.deepseek.com | Bearer token |
| Perplexity | api.perplexity.ai | Bearer token |
| Together | api.together.xyz/v1 | Bearer token |
| OpenRouter | openrouter.ai/api/v1 | Bearer token |
| Fireworks | api.fireworks.ai/inference/v1 | Bearer token |
| GitHub Models | models.github.ai/inference | Bearer token |
| Replicate | api.replicate.com/v1 | Token header |
| Stability | api.stability.ai | Bearer token |
| Fal.ai | fal.ai/api | Bearer token |
| ElevenLabs | api.elevenlabs.io/v1 | xi-api-key header |
| Brave Search | api.search.brave.com/res/v1 | Subscription token |
| DeepL | api-free.deepl.com/v2 | DeepL-Auth-Key |
| Open-Meteo | api.open-meteo.com/v1 | No auth required |
