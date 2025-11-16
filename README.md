<div align="center">

# SafeAPI-Bridge

**Secure API proxy server for protecting AI API keys with BYOK (Bring Your Own Key) support**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-v18+-green.svg)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-4.x-blue.svg)](https://expressjs.com/)

*Never expose your AI API keys in mobile or web applications again, now with split-key BYOK support.*


</div>

---

## Why SafeAPI-Bridge?

SafeAPI-Bridge is a secure proxy server that sits between your client applications (Android, iOS, Web, backend services) and AI providers (OpenAI, Google Gemini, Anthropic Claude, Groq, Mistral, etc.). It prevents API keys from being shipped in client binaries or front-end code, while providing a simple, unified API surface.

It supports two authentication modes:

1. **Server Key Method** - AI API keys live only in the server `.env`.
2. **BYOK Split Key Method** - users bring their own API keys, split into two parts so the full key never exists in one place.

Typical use cases:

- Mobile apps published to app stores.
- Web apps where code is fully visible to the browser.
- Multi-tenant SaaS where enterprise customers want to use their own AI keys.

---

## Features

- Dual authentication methods:
  - Server-managed keys (simpler integration).
  - BYOK split-key with AES-256-GCM.
- Multi-provider AI support:
  - OpenAI, Gemini, Claude, Groq, Mistral (extensible).
- Strong security layers:
  - JWT auth, IP whitelist/blacklist, per-user daily/monthly quotas.
  - Express rate limiting, HTTPS enforcement, Helmet, strict CORS.
  - Endpoint whitelist per provider (only safe API paths are allowed).
- BYOK split-key engine:
  - Split keys into server part + client part.
  - Full key is reconstructed only in memory, per request.
  - Key rotation and usage tracking via Prisma.
- Analytics and admin tooling:
  - Usage tracking (`ApiUsage`), cost estimation, per-user stats.
  - Admin APIs for users, IP rules, webhooks, audit logs.
  - Security and audit logging to files via Winston.

---

## System Architecture

### High-Level Components

- **Clients**
  - Android / iOS apps.
  - Web frontends.
  - Backend services (server-to-server).
- **SafeAPI-Bridge API server (Node.js / Express)**
  - HTTP endpoints under `/auth`, `/api`, `/api/split-key`, `/admin`, `/analytics`.
  - Middleware pipeline: HTTPS enforcement, CORS, rate limiting, JWT auth, IP checks, quota checks, BYOK split-key handling, security monitoring, error handling.
- **Database (Prisma)**
  - Default: SQLite (`file:./dev.db`) for local/simple deployments.
  - Recommended for production: PostgreSQL.
- **External AI providers**
  - OpenAI, Gemini, Claude, Groq, Mistral (configured via `.env`).

### Request Flow - Server Key Method

1. Client obtains JWT via `POST /auth/token` with `userId` and `appId`.
2. Client calls `POST /api/:api/proxy` (or convenience routes like `/api/openai`) with `Authorization: Bearer <JWT>`.
3. Middleware chain runs:
   - `ipCheck` -> `authenticateToken` -> `quotaCheck` -> `validateProxyRequest` -> security monitoring and rate limiting.
4. `proxyRequest` controller:
   - Validates endpoint against provider whitelist (`config/apis.js`).
   - Loads provider API key from server-side config (`config/env.js`).
   - Calls the upstream AI API with correct headers.
5. Usage and cost data are recorded in `ApiUsage` (Prisma), quota counters updated, optional webhooks fired.

### Request Flow - BYOK Split Key Method

1. User splits their API key once via `POST /api/split-key/split`:
   - `SplitKeyService` (AES-256-GCM) encrypts the original key.
   - Server keeps: encrypted server part + decryption secret.
   - Client receives: `keyId` + `clientPart`.
2. Client stores `keyId` and `clientPart` securely in backend config (never in public repos).
3. For each AI request, client calls `POST /api/:api/proxy` with:
   - `Authorization: Bearer <JWT>`.
   - `X-Partial-Key-Id: <keyId>`.
   - `X-Partial-Key: <clientPart>`.
4. Middleware:
   - Validates split-key headers and reconstructs the original key only in memory.
5. `proxyRequest` uses the reconstructed key instead of server `.env` key.
6. Usage is tracked (including which split key was used); security logs record BYOK usage and errors.

### Data Model Overview (Prisma)

Key models (`prisma/schema.prisma`):

- `User` - application users, quotas, request counters, total cost.
- `ApiUsage` - per-request log: API, endpoint, status, tokens, cost, response time, IP, user agent.
- `SplitKey` - BYOK split-key metadata, encrypted components, version, usage stats.
- `IpRule` - IP whitelist/blacklist rules (used by `ipCheck` middleware).
- `Webhook` - outbound webhooks configuration and stats.
- `Admin` - optional admin accounts (for tooling on top of admin APIs).
- `AuditLog` - admin operations log (user changes, IP rules, webhooks, etc.).

---

## Quick Start

### Prerequisites

- Node.js 18+.
- At least one AI provider API key (OpenAI, Gemini, Claude, Groq, Mistral).
- SQLite (default) or PostgreSQL for production analytics/BYOK.

### 1. Clone and Install

```bash
git clone https://github.com/yourusername/safeapi-bridge.git
cd safeapi-bridge
npm install
```

### 2. Configure Environment

Create your `.env` from the example:

```bash
cp .env.example .env
```

Edit `.env` and set at least:

```env
# Server
PORT=3000
NODE_ENV=production

# JWT Secret (required in production)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Admin key (for analytics and admin routes)
ADMIN_API_KEY=your-admin-api-key-here

# Database
DATABASE_URL=file:./dev.db

# AI provider keys (Server Key method)
OPENAI_API_KEY=sk-your-openai-key
GEMINI_API_KEY=your-gemini-key
CLAUDE_API_KEY=sk-ant-your-claude-key

# Rate limiting
RATE_LIMIT_WINDOW_MS=3600000
RATE_LIMIT_MAX_REQUESTS=100

# CORS
ALLOWED_ORIGINS=https://yourapp.com,https://anotherapp.com
ALLOW_MOBILE_NO_ORIGIN=true

# Logging / timeouts
LOG_DIR=./logs
REQUEST_TIMEOUT_MS=30000
```

### 3. Run Database Migrations

```bash
npx prisma migrate dev
npx prisma generate
```

### 4. Start the Server

```bash
# Development
npm run dev

# Production
npm start
```

The server will listen on `http://localhost:3000` (or the port you configure).

---

## API Usage

### 1. Get a JWT Token

```bash
curl -X POST http://localhost:3000/auth/token \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "appId": "backend-service"
  }'
```

### 2. Proxy with Server Key (OpenAI)

```bash
curl -X POST http://localhost:3000/api/openai/proxy \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "endpoint": "/chat/completions",
    "model": "gpt-3.5-turbo",
    "messages": [
      { "role": "user", "content": "SafeAPI-Bridge nedir?" }
    ]
  }'
```

### 3. Proxy with BYOK (Gemini)

```bash
curl -X POST http://localhost:3000/api/gemini/proxy \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "X-Partial-Key-Id: YOUR_KEY_ID" \
  -H "X-Partial-Key: YOUR_CLIENT_PART" \
  -H "Content-Type: application/json" \
  -d '{
    "endpoint": "/models/gemini-2.5-flash:generateContent",
    "contents": [
      {
        "parts": [
          { "text": "SafeAPI-Bridge ve BYOK mantigini acikla." }
        ]
      }
    ]
  }'
```

---

## BYOK Integration

SafeAPI-Bridge implements a secure split-key BYOK mechanism:

- Original API key is split into server part (DB) and client part (your backend).
- The full key is reconstructed only in memory per request.
- Supports key rotation and per-key usage tracking.

See `BYOK_INTEGRATION_GUIDE.md` for detailed flows and examples.

---

## Security

- Keys are never shipped in mobile or web client code.
- BYOK split-key mode for tenant-owned keys.
- Endpoint whitelist per provider to prevent misuse.
- JWT-based auth with logout/blacklist support.
- IP whitelist/blacklist via `IpRule` model and `ipCheck` middleware.
- Global rate limiting and per-user daily/monthly quotas.
- Request validation and body sanitization.
- Security monitoring middleware and audit logs for admin actions.

---

## Documentation

- **Backend Usage Guide** - `docs/BACKEND_USAGE.md`
- **OpenAPI 3 Spec** - `docs/openapi.yaml`
- **BYOK Integration (Detailed)** - `BYOK_INTEGRATION_GUIDE.md`

---

## License

This project is licensed under the MIT License - see `LICENSE` for details.

---

## Contributing

Contributions are welcome.

1. Fork this repository.
2. Create a feature branch: `git checkout -b feature/my-feature`.
3. Commit changes: `git commit -m "feat: add my feature"`.
4. Push the branch: `git push origin feature/my-feature`.
5. Open a Pull Request.

---

## Support

- Report bugs: GitHub Issues (link to your repo).
- Request features: GitHub Issues.
- Ask questions: GitHub Discussions (if enabled).

---

<div align="center">

**Built for developers who care about security and good API hygiene.**

Star this repo if you find it helpful!

</div>

