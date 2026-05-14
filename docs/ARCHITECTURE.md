# SafeAPI-Bridge Architecture

SafeAPI-Bridge is a Node.js/Express API gateway for AI provider traffic. Its primary responsibility is to keep provider API keys off client devices while enforcing authentication, quota control, rate limiting, IP policy, abuse detection, request validation, usage logging, and optional BYOK split-key flows.

## High-Level Design

```text
Client Applications
  - Native mobile apps
  - Web frontends
  - Backend services
        |
        | HTTPS + JWT + optional BYOK headers
        v
SafeAPI-Bridge
  - Express middleware pipeline
  - Auth, quota, rate limit, IP rules
  - Abuse guard and security logging
  - Provider key resolution
  - Retry and circuit breaker support
  - Usage and analytics persistence
        |
        | Provider-specific HTTP request
        v
External Providers
  - OpenAI, Gemini, Claude, Groq, Mistral, Z.ai
  - DeepSeek, Perplexity, Together, OpenRouter, Fireworks
  - GitHub Models, Replicate, Stability, Fal.ai, ElevenLabs
  - Brave Search, DeepL, Open-Meteo
```

The gateway supports two key-management modes:

- Server-key mode: provider keys are stored as server environment variables.
- BYOK split-key mode: users split a provider key, the server stores its encrypted part, and clients send their part through protected headers.

## Runtime Components

| Area | Path | Responsibility |
|---|---|---|
| Server entry | `src/server.js` | Express application setup, middleware order, route mounting, graceful shutdown |
| Routes | `src/routes` | HTTP route definitions and middleware composition |
| Controllers | `src/controllers` | Request handlers for proxy, admin, and operational flows |
| Middleware | `src/middleware` | Security, auth, quota, rate limit, CORS, timeout, logging, validation boundaries |
| Services | `src/services` | Provider forwarding, retries, queue, cache, split-key crypto, analytics, abuse guard |
| Models | `src/models` | Database access wrappers over Prisma |
| Database | `src/db`, `prisma` | Prisma client, PostgreSQL schema, migrations |
| Utilities | `src/utils` | Error handling, validation, response formatting, security logging |
| Tests | `tests` | Unit, integration, and security coverage |

## Middleware Pipeline

The global middleware order is security-sensitive:

```text
requestId
smartCompression
helmet
httpsEnforcement
abuseGuard
corsConfig
express.json / express.urlencoded
requestTimeout
inputSanitizer
logger
securityMonitor
/api rate limiter
routes
notFoundHandler
errorMiddleware
```

Key design decisions:

- `abuseGuard` runs before body parsing and route handling so scanner probes such as WordPress/PHP paths are dropped early.
- CORS runs before JSON parsing and application routes.
- Body size is limited to 2 MB.
- `/api` has global rate limiting, while provider routes add provider-specific rate limiting.
- Root and `/health` are excluded from API rate limiting.
- Error handling is centralized at the end of the Express stack.

## Request Flow

### Authentication

```text
POST /auth/token
  -> authLimiter
  -> validateAuthRequest
  -> UserModel.findOrCreate
  -> JWT issued for 7 days
```

The token payload contains `userId`, `appId`, and creation timestamp. Tokens are verified by `authenticateToken` on protected routes.

### Proxy Request

```text
POST /api/:api/proxy
GET  /api/:api/proxy
POST /api/:provider
  -> ipCheck
  -> authenticateToken
  -> quotaCheck
  -> provider rate limiter
  -> validateSplitKey
  -> reconstructApiKey
  -> validateProxyRequest
  -> addSplitKeySecurityHeaders
  -> proxyRequest
  -> usage tracking
```

The same security chain protects both generic proxy routes and convenience provider routes.

### Admin Request

```text
/admin/*
  -> adminLimiter
  -> adminAuth using X-Admin-Key
  -> controller action
  -> audit/security logging where applicable
```

`adminAuth` uses a timing-safe comparison against `ADMIN_API_KEY` and tracks failed authentication attempts.

## Public and Protected Surfaces

| Surface | Auth Requirement | Notes |
|---|---|---|
| `GET /` | None | Minimal service status |
| `GET /health` | None; optional admin key | Public response is minimal; admin key can expose more operational detail |
| `POST /auth/token` | Request validation and auth rate limit | Creates or retrieves a user and returns JWT |
| `/api/*` proxy routes | JWT, IP policy, quota, rate limits | Supports server-key and BYOK modes |
| `/api/split-key/*` | JWT | Split-key management for authenticated users |
| `/analytics/my-stats` | JWT | Current user's analytics |
| `/analytics/user/:userId` | JWT or admin key for other users | Users can read only their own stats unless admin key is supplied |
| `/analytics/overview`, `/analytics/costs`, `/analytics/errors` | JWT + `X-Admin-Key` | System-wide analytics |
| `/admin/*` | `X-Admin-Key` | Administrative operations |
| `/api-docs`, `/api-docs.json`, `/api-docs.yaml` | `X-Admin-Key` | API docs are intentionally not public |

## Security Architecture

### Authentication and Authorization

- Client access uses JWT bearer tokens.
- Admin access uses `X-Admin-Key` and a stricter admin rate limiter.
- Admin failed attempts are tracked and can trigger temporary lockout.
- Users can access only their own split keys and user analytics unless an admin key is present.

### Network and Origin Controls

- `helmet` applies baseline HTTP security headers.
- HTTPS enforcement is active in production.
- CORS uses exact origin matching from `ALLOWED_ORIGINS`.
- Requests without an `Origin` header are allowed only when `ALLOW_MOBILE_NO_ORIGIN` is not set to `false`.
- `trust proxy` is enabled so client IPs are resolved correctly behind a reverse proxy.

### Rate Limiting and Abuse Controls

- `/api` has a configurable IP-based global limiter.
- Authentication routes have a stricter brute-force limiter.
- Admin routes have a strict limiter.
- Provider routes have provider-specific per-minute limiters.
- `abuseGuard` detects scanner probes such as WordPress paths, `.php` probes, double-slash paths, path traversal probes, and scanner user agents.
- Scanner probes are answered with empty `404` responses and can lead to temporary in-memory IP blocks.
- Active temporary blocks are visible through `/admin/security/blocks` and removable through `DELETE /admin/security/blocks/:ip`.

### Persistent IP Policy

`ipCheck` uses the `IpRule` model to enforce whitelist and blacklist entries stored in PostgreSQL.

- Blacklisted IPs are denied.
- Whitelist behavior depends on the model implementation and active rules.
- IP verification fails closed with `503` if the rule check cannot be completed.

### Key Protection

Server-key mode:

- Provider keys are loaded from environment variables.
- Keys never need to be shipped in client applications.

BYOK split-key mode:

- User submits a provider key through `/api/split-key/split`.
- The server encrypts and stores its part in PostgreSQL.
- The client stores and sends its part through `X-Partial-Key-Id` and `X-Partial-Key`.
- Reconstruction happens in memory during the proxy request.

## Data Model Summary

| Model | Purpose |
|---|---|
| `User` | Application user, app ID, generated API key, quota counters, status |
| `ApiUsage` | Request usage records, status, token/cost estimate, latency, IP, user agent |
| `IpRule` | Persistent IP whitelist and blacklist rules |
| `Webhook` | Webhook targets, events, retry settings, delivery statistics |
| `Admin` | Optional admin user representation |
| `SplitKey` | BYOK split-key metadata and encrypted server-side material |
| `AuditLog` | Administrative operation audit records |

The active Prisma datasource is PostgreSQL.

## Provider Forwarding

Provider routing is configured through `src/config/env.js` and provider metadata. The proxy validates requested providers and endpoints, resolves the correct API key, applies timeout settings, forwards the request, and records usage.

Provider timeout configuration can be set globally with `UPSTREAM_TIMEOUT_MS` or per provider, for example:

```env
OPENAI_TIMEOUT_MS=60000
GEMINI_TIMEOUT_MS=60000
CLAUDE_TIMEOUT_MS=90000
GROQ_TIMEOUT_MS=30000
```

## Queue, Retry, and Cache

- `requestQueue.js` initializes Bull when `REDIS_URL` is set and falls back to memory when Redis is unavailable.
- `retryService.js` provides exponential backoff, jitter, and circuit breaker behavior for provider calls.
- `cacheService.js` provides Redis-backed or in-memory cache behavior with TTL and tag support.
- Redis is recommended for production environments that need shared state across multiple instances.

## Observability

The application writes structured operational and security logs through Winston.

Important log categories:

- Request logs from Morgan/Winston integration.
- Security events such as scanner probes, temporary blocks, failed admin auth, rate-limit events, and split-key operations.
- Error logs from centralized error handling and process-level exception handlers.
- Admin operation audit logs.

Operational endpoints:

```text
GET /health
GET /admin/metrics
GET /admin/metrics/prometheus
GET /admin/security/blocks
```

Admin endpoints require `X-Admin-Key`.

## Operational Boundaries

- Temporary abuse blocks are process-local memory and reset on restart.
- Token blacklist behavior is service-backed but should be reviewed before relying on cross-instance logout semantics.
- Queue memory fallback is not durable. Use Redis for multi-instance or restart-safe queue behavior.
- Files under `logs/` may not persist on stateless platforms unless log shipping or persistent volumes are configured.
- API documentation endpoints are protected but still reachable if a valid admin key is presented.

## Repository Layout

```text
SafeAPI-Bridge/
  src/
    config/        Environment and provider configuration
    controllers/   Request handlers
    db/            Prisma client
    middleware/    Express middleware
    models/        Data access models
    routes/        Route definitions
    services/      Business and infrastructure services
    utils/         Shared utilities
    server.js      Application entry point
  prisma/
    schema.prisma  PostgreSQL schema
    migrations/    Database migrations
  tests/
    unit/          Fast unit tests
    integration/   Integration tests
    security/      Security-focused tests
  docs/            Project documentation
  scripts/         Operational scripts
  openapi.yaml     OpenAPI specification
  README.md        Project overview and quick start
```
