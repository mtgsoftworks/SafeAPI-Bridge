# SafeAPI-Bridge

**Secure API Gateway for AI Providers** – Protect your API keys, manage quotas, and monitor usage across OpenAI, Gemini, Claude, and 15+ AI providers.

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org)
[![License](https://img.shields.io/badge/License-MIT-blue)](LICENSE)

---

## 🚀 Features

- **Multi-Provider Support** – OpenAI, Gemini, Claude, Groq, Mistral, Cohere, and more.
- **Split Key (BYOK)** – Secure "Bring Your Own Key" architecture that keeps API keys safe.
- **Rate Limiting** – Global and per-provider request limits.
- **Retry & Circuit Breaker** – Automatic retries with exponential backoff and fault tolerance.
- **Usage Tracking** – Per-user quotas, token counting, and cost estimation.
- **Prometheus Metrics** – Production-grade observability.
- **Admin Dashboard** – Real-time monitoring and management.

---

## 📦 Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL (Railway, Supabase, etc.)
- Redis (optional, for Bull queue)

### Installation

```bash
# Clone
git clone https://github.com/your-org/SafeAPI-Bridge.git
cd SafeAPI-Bridge

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Setup database
npx prisma generate
npx prisma migrate deploy

# Start server
npm start
```

---

## ⚙️ Configuration

All configuration is done via environment variables (`.env` file):

### Core Settings

```ini
# Server
PORT=3003
NODE_ENV=production

# Database (PostgreSQL)
DATABASE_URL=postgresql://user:password@host:5432/dbname

# Authentication
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=24h
ADMIN_API_KEY=your-admin-key
```

### API Provider Keys (Optional – Server Key Mode)

```ini
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AIza...
CLAUDE_API_KEY=sk-ant-...
GROQ_API_KEY=gsk_...
```

### Rate Limiting

```ini
# Global
RATE_LIMIT_WINDOW_MS=3600000
RATE_LIMIT_MAX_REQUESTS=100

# Per-Provider (requests per minute)
RATE_LIMIT_OPENAI_MAX=500
RATE_LIMIT_GEMINI_MAX=1000
RATE_LIMIT_CLAUDE_MAX=50
```

### Timeouts

```ini
OPENAI_TIMEOUT_MS=60000
GEMINI_TIMEOUT_MS=30000
CLAUDE_TIMEOUT_MS=90000
```

---

## 🔐 Authentication Methods

### 1. Server Key Mode

The server uses API keys stored in `.env`. Users authenticate with JWT tokens.

```bash
# Get JWT token
curl -X POST http://localhost:3003/auth/token \
  -H "Content-Type: application/json" \
  -d '{"userId": "user123", "appId": "myApp"}'

# Use token for API requests
curl -X POST http://localhost:3003/api/openai/proxy \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"endpoint": "/chat/completions", "model": "gpt-4", "messages": [...]}'
```

### 2. Split Key (BYOK) Mode

Users bring their own API keys, which are split and stored securely.

```bash
# Split your API key
curl -X POST http://localhost:3003/api/split-key/split \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -d '{"originalKey": "sk-...", "apiProvider": "openai"}'

# Response: { keyId: "abc123", clientPart: "xyz789" }

# Use split key for requests
curl -X POST http://localhost:3003/api/openai/proxy \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "X-Partial-Key-Id: abc123" \
  -H "X-Partial-Key: xyz789" \
  -d '{"endpoint": "/chat/completions", ...}'
```

---

## 📡 API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/token` | Generate JWT token |
| GET | `/auth/verify` | Verify JWT token |
| GET | `/auth/token-info` | Get token details |

### Proxy

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/:provider/proxy` | Forward request to AI provider |
| GET | `/api/:provider/endpoints` | List allowed endpoints |

### Split Key (BYOK)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/split-key/split` | Create split key |
| GET | `/api/split-key` | List user's split keys |
| DELETE | `/api/split-key/:keyId` | Deactivate split key |

### Admin (Requires `X-Admin-Key` header)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/users` | List all users |
| GET | `/admin/metrics` | System metrics (JSON) |
| GET | `/admin/metrics/prometheus` | Prometheus format |
| PUT | `/admin/log-level` | Change log level |
| GET | `/admin/provider-timeouts` | View timeout config |

### Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/analytics/my-stats` | Current user's stats |
| GET | `/analytics/usage` | Detailed usage data |

---

## 🛠️ Supported Providers

| Provider | Status | Streaming |
|----------|--------|-----------|
| OpenAI | ✅ | ✅ |
| Google Gemini | ✅ | ✅ |
| Anthropic Claude | ✅ | ✅ |
| Groq | ✅ | ✅ |
| Mistral | ✅ | ✅ |
| Cohere | ✅ | ✅ |
| Perplexity | ✅ | ✅ |
| Together AI | ✅ | ✅ |
| OpenRouter | ✅ | ✅ |
| DeepSeek | ✅ | ✅ |
| xAI (Grok) | ✅ | ✅ |
| Fireworks | ✅ | ✅ |
| Replicate | ✅ | ❌ |

---

## 🚂 Deploy to Railway

```bash
# 1. Push to GitHub
git push origin main

# 2. Create Railway project
# 3. Add PostgreSQL addon
# 4. Set environment variables in Railway dashboard
# 5. Set build command:
npx prisma generate && npx prisma migrate deploy && npm start
```

---

## 🧪 Testing

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run with coverage
npm test -- --coverage
```

---

## 📊 Monitoring

### Health Check

```
GET /health
```

### Prometheus Metrics

```
GET /admin/metrics/prometheus
```

Metrics include:

- Request counts (by provider, status)
- Response times (p50, p95, p99)
- Rate limit events
- Circuit breaker status
- Memory usage

---

## 📁 Project Structure

```
SafeAPI-Bridge/
├── src/
│   ├── config/         # Configuration (env, apis, constants)
│   ├── controllers/    # Request handlers
│   ├── middleware/     # Auth, rate limiting, security
│   ├── models/         # Database models (Prisma wrappers)
│   ├── routes/         # API routes
│   ├── services/       # Business logic
│   ├── utils/          # Helpers
│   └── server.js       # Entry point
├── prisma/
│   └── schema.prisma   # Database schema
├── tests/              # Test suites
└── scripts/            # Utility scripts
```

---

## 📄 License

MIT License – see [LICENSE](LICENSE) for details.

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing`)
5. Open a Pull Request
