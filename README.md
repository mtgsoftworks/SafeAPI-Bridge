# SafeAPI-Bridge

SafeAPI-Bridge is a production-oriented API gateway for AI providers. It keeps provider API keys out of client applications, enforces quotas and rate limits, records usage, and provides security controls for mobile and web integrations.

## What It Provides

- Multi-provider proxying for OpenAI-compatible APIs, Gemini, Claude, Groq, Mistral, DeepSeek, OpenRouter, GitHub Models, Replicate, Stability, Fal, ElevenLabs, Brave, DeepL, Open-Meteo, and others configured in `src/config/apis.js`.
- Server-key mode for centrally managed provider credentials.
- BYOK split-key mode for user-supplied provider keys without storing the original key in plaintext.
- JWT-based client authentication with logout blacklist support.
- Daily and monthly quota enforcement per user.
- Global, auth, admin, and provider-specific rate limiting.
- Scanner/probe blocking for common WordPress, PHP, path traversal, and automated bot traffic.
- Admin APIs for users, quotas, IP rules, webhooks, audit logs, metrics, log level, provider timeouts, and temporary abuse blocks.
- Protected OpenAPI documentation and Swagger UI.

## Runtime Requirements

- Node.js 18 or later.
- PostgreSQL for production.
- Redis is optional and enables Bull queue support when `REDIS_URL` is set.
- At least one configured provider API key, unless all traffic uses BYOK split keys.

## Quick Start

```bash
npm install
npm run prisma:generate
npm run prisma:deploy
npm start
```

For local development:

```bash
npm run dev
```

The service listens on `PORT` or `3000` by default.

## Required Production Configuration

Set these values in your hosting provider's environment variable panel. Do not commit them.

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://user:password@host:5432/database?schema=public
JWT_SECRET=<64-plus-character-random-secret>
ADMIN_API_KEY=<strong-random-admin-key>
```

Recommended production security settings:

```env
ALLOWED_ORIGINS=https://example.com,https://www.example.com
ALLOW_MOBILE_NO_ORIGIN=true
RATE_LIMIT_WINDOW_MS=3600000
RATE_LIMIT_MAX_REQUESTS=100
REQUEST_TIMEOUT_MS=90000
UPSTREAM_TIMEOUT_MS=60000
ABUSE_GUARD_ENABLED=true
ABUSE_GUARD_STRIKE_THRESHOLD=5
ABUSE_GUARD_WINDOW_MS=600000
ABUSE_GUARD_BLOCK_MS=3600000
ABUSE_GUARD_BLOCK_AUTHENTICATED=false
```

Generate strong secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('base64url'))"
```

## Provider Configuration

Provider keys are optional per provider. Configure only the providers you use.

```env
GEMINI_API_KEY=<gemini-key>
GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta
OPENAI_API_KEY=<openai-key>
OPENAI_BASE_URL=https://api.openai.com/v1
GITHUB_MODELS_API_KEY=<github-models-token>
```

Do not reuse broad GitHub personal access tokens unless required. Prefer least-privilege tokens and rotate them regularly.

## Core API Flow

1. Client requests a JWT from `POST /auth/token` using `userId` and `appId`.
2. Client calls `POST /api/:provider/proxy` with `Authorization: Bearer <JWT>`.
3. Server validates IP rules, JWT, quota, provider rate limits, split-key headers if present, and endpoint whitelist.
4. Server forwards the request to the provider with the provider credential resolved on the server.
5. Server records usage and returns the provider response.

## Important Endpoints

| Area | Method | Endpoint | Access |
| --- | --- | --- | --- |
| Health | GET | `/` | Public minimal service info |
| Health | GET | `/health` | Public minimal status; detailed with `X-Admin-Key` |
| Auth | POST | `/auth/token` | Public, rate limited |
| Auth | GET | `/auth/verify` | JWT |
| Proxy | POST/GET | `/api/:provider/proxy` | JWT |
| Provider metadata | GET | `/api/:provider/endpoints` | JWT |
| BYOK | POST | `/api/split-key/split` | JWT |
| Analytics | GET | `/analytics/my-stats` | JWT |
| Admin | any | `/admin/*` | `X-Admin-Key` |
| Documentation | GET | `/api-docs`, `/api-docs.json`, `/api-docs.yaml` | `X-Admin-Key` |

## Protected Documentation Access

OpenAPI and Swagger are not public. Use the admin key:

```bash
curl -H "X-Admin-Key: $ADMIN_API_KEY" https://api.example.com/api-docs.json
curl -H "X-Admin-Key: $ADMIN_API_KEY" https://api.example.com/api-docs.yaml
```

`/api-docs` is also protected. Direct browser navigation cannot add `X-Admin-Key`; use an internal admin tool, a secure reverse proxy, or a browser extension for header injection when needed.

## Security Notes

- Set `NODE_ENV=production` in live deployments. This enables production behavior such as HTTPS enforcement.
- Rotate any secret that has been posted in chat, logs, screenshots, tickets, or source control.
- Keep `ALLOWED_ORIGINS` restricted to production domains in production.
- Keep `ALLOW_MOBILE_NO_ORIGIN=true` only when native mobile clients require requests without an `Origin` header.
- Abuse guard blocks scanner probes before body parsing and routing. Temporary blocks are in-memory and reset on process restart.
- Use persistent IP blacklist rules for known hostile IPs that must survive restarts.
- Protect database backups. BYOK records do not store plaintext keys, but the database still contains sensitive key material that must be treated as confidential.

## Admin Operations

Temporary abuse blocks:

```bash
curl -H "X-Admin-Key: $ADMIN_API_KEY" https://api.example.com/admin/security/blocks
curl -X DELETE -H "X-Admin-Key: $ADMIN_API_KEY" https://api.example.com/admin/security/blocks/52.138.6.165
```

Metrics:

```bash
curl -H "X-Admin-Key: $ADMIN_API_KEY" https://api.example.com/admin/metrics
curl -H "X-Admin-Key: $ADMIN_API_KEY" https://api.example.com/admin/metrics/prometheus
```

## Testing

The full test suite expects the test environment to be aligned with the active Prisma datasource. Because the current schema uses PostgreSQL, CI should provide a PostgreSQL-compatible `DATABASE_URL` or mock Prisma for suites that do not require a real database.

```bash
npm test
npm run test:unit
npm run test:security
npm run test:integration
```

Targeted security checks used for recent hardening:

```bash
npx jest tests/unit/abuseGuard.test.js tests/unit/securityMonitor.test.js tests/unit/proxy.controller.test.js tests/security/adminAuth.test.js --runInBand --coverage=false
```

## Repository Layout

```text
src/config       Provider, security, environment, and constants
src/controllers  Route handlers
src/middleware   Auth, rate limiting, abuse guard, CORS, logging, security
src/models       Prisma model wrappers
src/routes       Express route modules
src/services     Proxying, split key, usage, analytics, queue, webhook, audit
src/utils        Validation, crypto, logging, errors, URL safety helpers
prisma           Prisma schema and migrations
docs             Operational documentation
tests            Unit, integration, security, and performance tests
```

## Additional Documentation

- `docs/API_REFERENCE.md`
- `docs/ARCHITECTURE.md`
- `docs/SECURITY.md`
- `docs/DEPLOYMENT.md`
- `openapi.yaml`

## License

MIT. See `LICENSE`.
