<div align="center">

# SafeAPI-Bridge

**Secure API proxy server for protecting AI API keys with BYOK (Bring Your Own Key) support**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-v18+-green.svg)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-4.x-blue.svg)](https://expressjs.com/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

*Never expose your AI API keys in mobile or web applications again, now with split-key BYOK support.*

[Documentation](./docs/) • [API Reference](./docs/API_REFERENCE.md) • [Security Guide](./docs/SECURITY.md) • [Deployment](./docs/DEPLOYMENT.md)

</div>

---

## Table of Contents

- [Why SafeAPI-Bridge?](#why-safeapi-bridge)
- [Features](#features)
- [Supported AI Providers](#supported-ai-providers)
- [Quick Start](#quick-start)
- [API Usage](#api-usage)
- [BYOK Split-Key](#byok-split-key)
- [Architecture](#architecture)
- [Security](#security)
- [Configuration](#configuration)
- [Documentation](#documentation)
- [Testing](#testing)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

---

## Why SafeAPI-Bridge?

SafeAPI-Bridge is a secure proxy server that sits between your client applications (Android, iOS, Web, backend services) and AI providers. It prevents API keys from being shipped in client binaries or front-end code, while providing a simple, unified API surface.

### Authentication Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| **Server Key** | AI API keys stored only in server `.env` | Simple integration, full control |
| **BYOK Split-Key** | User keys split with AES-256-GCM encryption | Multi-tenant SaaS, enterprise customers |

### Typical Use Cases

- 📱 Mobile apps published to app stores
- 🌐 Web apps where code is visible to browsers
- 🏢 Multi-tenant SaaS with customer-owned keys
- 🔒 Backend services requiring key isolation

---

## Features

### Core Features

- **Dual Authentication**: Server-managed keys or BYOK split-key
- **19 AI Providers**: OpenAI, Gemini (3.x), Claude (5), Groq, Mistral, and more
- **Request Proxying**: Transparent forwarding with key injection
- **Streaming Support**: Full support for SSE streaming responses
- **Request Queue**: Bull queue with Redis (optional) or in-memory fallback
- **Retry Mechanism**: Exponential backoff with circuit breaker pattern
- **Priority Queue**: VIP users get priority processing

### Security Features

- **JWT Authentication**: Secure token-based auth with blacklist support
- **IP Rules**: Whitelist/blacklist with CIDR support
- **Rate Limiting**: Global and per-endpoint limits
- **Quota Management**: Daily/monthly per-user quotas
- **Input Sanitization**: XSS, SQL injection, command injection protection
- **Endpoint Whitelist**: Only allowed API paths can be proxied
- **HTTPS Enforcement**: Automatic redirect in production
- **Security Monitoring**: Real-time threat detection
- **Circuit Breaker**: Automatic failover when APIs are unavailable

### Analytics & Admin

- **Usage Tracking**: Per-request logging with token counts and costs
- **Admin APIs**: User management, IP rules, webhooks
- **Audit Logging**: All admin actions tracked
- **Webhook Notifications**: Real-time event notifications
- **Queue Statistics**: Monitor queue depth and processing stats

---

## Supported AI Providers

| Provider | Status | Endpoints |
|----------|--------|-----------|
| OpenAI | ✅ | Chat, Completions, Embeddings, Models |
| Google Gemini | ✅ | Generate Content, Embeddings |
| Anthropic Claude | ✅ | Messages, Models |
| Groq | ✅ | Chat Completions, Models |
| Mistral | ✅ | Chat, Embeddings, Models |
| DeepSeek | ✅ | Chat, Completions, Embeddings |
| Perplexity | ✅ | Chat, Completions |
| Together AI | ✅ | Chat, Completions, Embeddings |
| OpenRouter | ✅ | Chat, Completions, Embeddings |
| Fireworks AI | ✅ | Chat, Embeddings |
| GitHub Models | ✅ | Chat, Completions, Embeddings |
| Replicate | ✅ | Predictions, Deployments |
| Stability AI | ✅ | Image Generation |
| Fal.ai | ✅ | Various AI Models |
| ElevenLabs | ✅ | Text-to-Speech, Voices |
| Brave Search | ✅ | Web Search |
| DeepL | ✅ | Translation |
| Open-Meteo | ✅ | Weather Forecast |
| Z.ai (GLM) | ✅ | Chat Completions |

---

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- At least one AI provider API key

### Installation

```bash
# Clone repository
git clone https://github.com/yourusername/safeapi-bridge.git
cd safeapi-bridge

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API keys and settings

# Setup database
npm run prisma:generate
npm run prisma:migrate

# Start development server
npm run dev
```

Server runs at `http://localhost:3000`

### Verify Installation

```bash
# Check health
curl http://localhost:3000/health

# Get JWT token
curl -X POST http://localhost:3000/auth/token \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-user", "appId": "my-app"}'
```

---

## API Usage

### 1. Authenticate

```bash
curl -X POST http://localhost:3000/auth/token \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "appId": "my-mobile-app"
  }'
```

**Response:**

```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": "7 days",
  "user": {
    "userId": "user123",
    "dailyQuota": 100,
    "monthlyQuota": 3000
  }
}
```

### 2. Proxy Request (OpenAI Example)

```bash
curl -X POST http://localhost:3000/api/openai/proxy \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "endpoint": "/chat/completions",
    "model": "gpt-4",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'
```

### 3. Proxy Request (Gemini Example)

```bash
curl -X POST http://localhost:3000/api/gemini/proxy \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "endpoint": "/models/gemini-2.5-flash:generateContent",
    "contents": [
      {"parts": [{"text": "Explain quantum computing"}]}
    ]
  }'
```

---

## BYOK Split-Key

SafeAPI-Bridge implements secure split-key BYOK (Bring Your Own Key):

### How It Works

1. **Split**: User's API key is encrypted with AES-256-GCM and split
2. **Store**: Server keeps encrypted portion; client gets `keyId` + `clientPart`
3. **Use**: Client sends both parts; key reconstructed only in memory
4. **Track**: Per-key usage tracking and rotation support

### Create Split Key

```bash
curl -X POST http://localhost:3000/api/split-key/split \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "originalKey": "sk-your-openai-key",
    "apiProvider": "openai",
    "description": "Production key"
  }'
```

### Use Split Key

```bash
curl -X POST http://localhost:3000/api/openai/proxy \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "X-Partial-Key-Id: YOUR_KEY_ID" \
  -H "X-Partial-Key: YOUR_CLIENT_PART" \
  -H "Content-Type: application/json" \
  -d '{
    "endpoint": "/chat/completions",
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

See [BYOK_INTEGRATION_GUIDE.md](./BYOK_INTEGRATION_GUIDE.md) for detailed integration guide.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT APPLICATIONS                      │
│         (Mobile Apps, Web Apps, Backend Services)           │
└─────────────────────────────┬───────────────────────────────┘
                              │ JWT + Request
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     SAFEAPI-BRIDGE                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Middleware: CORS → Auth → Rate Limit → IP Check →   │   │
│  │             Quota → Split-Key → Sanitization        │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Services: KeyResolution → ApiForwarding → Usage     │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Database: Users, SplitKeys, ApiUsage, IpRules       │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────┬───────────────────────────────┘
                              │ API Key injected
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   AI PROVIDERS                              │
│  OpenAI │ Gemini │ Claude │ Groq │ Mistral │ ... (19 total)│
└─────────────────────────────────────────────────────────────┘
```

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for detailed architecture documentation.

---

## Security

SafeAPI-Bridge implements defense in depth:

| Layer | Protection |
|-------|------------|
| Transport | HTTPS, HSTS, TLS 1.2+ |
| Authentication | JWT with blacklist, token expiration |
| Authorization | IP rules, endpoint whitelist, quotas |
| Input | XSS, SQL injection, command injection detection |
| Rate Limiting | Per-IP and per-user limits |
| Monitoring | Security event logging, threat detection |
| Key Protection | Server-side keys or AES-256-GCM split-key |

See [docs/SECURITY.md](./docs/SECURITY.md) for the complete security guide.

---

## Configuration

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `JWT_SECRET` | Secret for JWT signing (64+ chars recommended) |
| `DATABASE_URL` | Database connection string |
| `ADMIN_API_KEY` | Admin API access key |

### Optional Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `NODE_ENV` | development | Environment mode |
| `RATE_LIMIT_MAX_REQUESTS` | 100 | Requests per window |
| `RATE_LIMIT_WINDOW_MS` | 3600000 | Rate limit window (1 hour) |
| `ALLOWED_ORIGINS` | * | CORS allowed origins |
| `REQUEST_TIMEOUT_MS` | 30000 | Request timeout |

See [.env.example](./.env.example) for all configuration options.

---

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](./docs/ARCHITECTURE.md) | System design and data models |
| [API Reference](./docs/API_REFERENCE.md) | Complete API documentation |
| [Security Guide](./docs/SECURITY.md) | Security features and best practices |
| [Deployment Guide](./docs/DEPLOYMENT.md) | Production deployment instructions |
| [BYOK Integration](./BYOK_INTEGRATION_GUIDE.md) | Split-key BYOK integration guide |
| [OpenAPI Spec](./openapi.yaml) | OpenAPI 3.0 specification |

---

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test suites
npm run test:unit        # Unit tests
npm run test:security    # Security tests
npm run test:integration # Integration tests

# Watch mode
npm run test:watch
```

---

## Deployment

### Quick Deploy

```bash
# Production build
npm run prisma:deploy
NODE_ENV=production npm start
```

### Docker

```bash
docker build -t safeapi-bridge .
docker run -p 3000:3000 --env-file .env safeapi-bridge
```

### Cloud Platforms

- **Render**: Connect repo, set env vars, deploy
- **Railway**: One-click deploy with PostgreSQL
- **Heroku**: `git push heroku main`
- **AWS/GCP**: See [deployment guide](./docs/DEPLOYMENT.md)

See [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) for detailed instructions.

---

## Contributing

Contributions are welcome! Please read our contributing guidelines:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Write tests for new functionality
4. Ensure all tests pass: `npm test`
5. Commit changes: `git commit -m "feat: add my feature"`
6. Push to branch: `git push origin feature/my-feature`
7. Open a Pull Request

### Development

```bash
# Install dependencies
npm install

# Start development server with hot reload
npm run dev

# Run linting
npm run lint

# Run tests in watch mode
npm run test:watch
```

---

## License

This project is licensed under the MIT License - see [LICENSE](./LICENSE) for details.

---

<div align="center">

**Built with ❤️ for developers who care about security**

[⭐ Star this repo](https://github.com/yourusername/safeapi-bridge) • [🐛 Report Bug](https://github.com/yourusername/safeapi-bridge/issues) • [💡 Request Feature](https://github.com/yourusername/safeapi-bridge/issues)

</div>
