# SafeAPI-Bridge Deployment Guide

This guide describes how to deploy SafeAPI-Bridge safely in production. It is written for environments such as Render, Railway, Docker, VM/PM2, or any Node.js 18+ platform with PostgreSQL.

## Production Requirements

- Node.js 18 or later.
- PostgreSQL database reachable through `DATABASE_URL`.
- At least one provider API key, unless all users rely on BYOK split-key mode.
- A strong `JWT_SECRET` and `ADMIN_API_KEY` stored only in the hosting platform secret manager.
- HTTPS termination at the platform load balancer or reverse proxy.
- Optional Redis instance for Bull queue support. Without Redis, the queue falls back to in-memory behavior.

## Required Environment Variables

Set these variables in the production platform, not in a committed file.

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DB?schema=public
JWT_SECRET=<64+ character random secret>
ADMIN_API_KEY=<48+ character random admin key>
ALLOWED_ORIGINS=https://calmsmartliving.com,https://www.calmsmartliving.com
ALLOW_MOBILE_NO_ORIGIN=true
```

Use `ALLOW_MOBILE_NO_ORIGIN=true` only when native mobile clients call the API without an `Origin` header. Browser origins are still checked with exact-match CORS rules.

## Recommended Production Variables

```env
RATE_LIMIT_WINDOW_MS=3600000
RATE_LIMIT_MAX_REQUESTS=100
REQUEST_TIMEOUT_MS=90000
UPSTREAM_TIMEOUT_MS=60000
LOG_LEVEL=info
LOG_DIR=./logs
LOG_MAX_FILES=30d

ABUSE_GUARD_ENABLED=true
ABUSE_GUARD_STRIKE_THRESHOLD=5
ABUSE_GUARD_WINDOW_MS=600000
ABUSE_GUARD_BLOCK_MS=3600000
ABUSE_GUARD_BLOCK_AUTHENTICATED=false
```

Provider keys are configured only for providers you use:

```env
OPENAI_API_KEY=<openai-key>
GEMINI_API_KEY=<gemini-key>
CLAUDE_API_KEY=<claude-key>
GROQ_API_KEY=<groq-key>
MISTRAL_API_KEY=<mistral-key>
GITHUB_MODELS_API_KEY=<github-models-token>
```

Optional infrastructure:

```env
REDIS_URL=redis://default:PASSWORD@HOST:6379
QUEUE_MAX_CONCURRENT=10
QUEUE_MAX_SIZE=1000
API_RETRY_ATTEMPTS=3
RETRY_MAX_DELAY_MS=30000
```

## Secret Generation

Generate production secrets locally and store only the resulting values in the platform secret manager.

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
node -e "console.log(require('crypto').randomBytes(64).toString('base64url'))"
```

Use the shorter output for `ADMIN_API_KEY` and the longer output for `JWT_SECRET`, or generate both at 64 bytes. Do not reuse development or test values.

## Local Preparation

```bash
npm install
npm run prisma:generate
npm test
```

For local development with the current Prisma schema, use PostgreSQL. The schema provider is `postgresql`, so SQLite connection strings are not valid unless the Prisma schema is intentionally changed.

## Production Deployment Steps

1. Configure the production environment variables in the hosting platform.
2. Install dependencies with `npm install` or `npm ci`.
3. Generate the Prisma client with `npm run prisma:generate`.
4. Apply migrations with `npm run prisma:deploy`.
5. Start the service with `npm start`.
6. Verify `/health` and a protected docs endpoint.

Typical command sequence:

```bash
npm ci
npm run prisma:generate
npm run prisma:deploy
npm start
```

## Render Deployment

Recommended settings:

- Build command: `npm install && npm run prisma:generate`
- Start command: `npm run prisma:deploy && npm start`
- Runtime: Node.js 18+
- Environment: set all required variables in Render Environment, not in the repository.

Render-style interpolation such as `${{Postgres.DATABASE_URL}}` should be used only inside the Render dashboard. Do not place that literal in a local `.env` file.

## Railway Deployment

1. Create a Railway project from the repository.
2. Add a PostgreSQL service.
3. Set `DATABASE_URL` from Railway's PostgreSQL connection string.
4. Add `NODE_ENV=production`, `JWT_SECRET`, `ADMIN_API_KEY`, `ALLOWED_ORIGINS`, and provider keys.
5. Use `npm run prisma:deploy && npm start` as the start command if the platform does not run migrations separately.

## Docker Deployment

Example Dockerfile:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev
RUN npx prisma generate

COPY src ./src
COPY openapi.yaml ./openapi.yaml

ENV NODE_ENV=production
EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
```

Example compose file:

```yaml
services:
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      PORT: 3000
      DATABASE_URL: postgresql://postgres:postgres@db:5432/safeapi?schema=public
      JWT_SECRET: ${JWT_SECRET}
      ADMIN_API_KEY: ${ADMIN_API_KEY}
      ALLOWED_ORIGINS: https://calmsmartliving.com,https://www.calmsmartliving.com
      ALLOW_MOBILE_NO_ORIGIN: "true"
    depends_on:
      - db

  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: safeapi
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

Do not use the example database password in a real deployment.

## PM2 Deployment

```bash
npm ci --omit=dev
npm run prisma:generate
npm run prisma:deploy
pm2 start src/server.js --name safeapi-bridge --env production
pm2 save
```

Use the process manager or host-level environment to inject secrets. Do not place production secrets in `ecosystem.config.js` if it is committed.

## Protected Documentation Access

The documentation endpoints are intentionally not public. They require `X-Admin-Key`.

```bash
curl -H "X-Admin-Key: $ADMIN_API_KEY" https://api.example.com/api-docs.json
curl -H "X-Admin-Key: $ADMIN_API_KEY" https://api.example.com/api-docs.yaml
```

Swagger UI at `/api-docs` is also protected. A normal browser navigation cannot add `X-Admin-Key` by itself; use an internal admin tool, a trusted reverse proxy that injects the header, or fetch the raw spec with `curl` and view it locally.

## Health Checks

Unauthenticated health check:

```bash
curl https://api.example.com/health
```

The public health response is intentionally minimal. When the request includes a valid `X-Admin-Key`, the health controller may include additional operational detail.

## CI/CD Checklist

Before deployment, run:

```bash
npm test
npm run prisma:generate
npm run prisma:deploy -- --help
```

Pipeline recommendations:

- Install with a clean dependency command (`npm ci` when lockfile consistency is enforced).
- Provide a PostgreSQL-compatible test `DATABASE_URL` for suites that touch Prisma, or mock Prisma explicitly in non-database suites.
- Run unit and security tests on every pull request.
- Run Prisma validation or generation before packaging.
- Apply migrations once per deployment, before accepting traffic.
- Do not print secrets in build logs.
- Keep deployment of code and environment changes coordinated when changing security behavior.

## Security Checklist

- `NODE_ENV=production` is set.
- `JWT_SECRET` is strong, random, and not reused from development.
- `ADMIN_API_KEY` is strong, random, and not exposed to clients.
- Public docs are protected by `X-Admin-Key`.
- `ALLOWED_ORIGINS` contains only production browser origins.
- `ALLOW_MOBILE_NO_ORIGIN=true` is used only because the mobile app requires it.
- Scanner abuse guard is enabled.
- Admin routes and analytics admin endpoints are not exposed through a public frontend.
- Database backups and retention policy are configured.
- Provider keys are rotated if they were ever pasted in logs, chat, tickets, or commits.

## Operations

Useful admin endpoints:

```bash
curl -H "X-Admin-Key: $ADMIN_API_KEY" https://api.example.com/admin/security/blocks
curl -X DELETE -H "X-Admin-Key: $ADMIN_API_KEY" https://api.example.com/admin/security/blocks/203.0.113.10
curl -H "X-Admin-Key: $ADMIN_API_KEY" https://api.example.com/admin/metrics
```

Operational notes:

- Temporary abuse blocks are in memory and reset when the process restarts.
- Persistent IP whitelist and blacklist rules are stored in PostgreSQL through the `IpRule` model.
- Request logs and security logs are written through Winston and may need platform log shipping in stateless deployments.
- Redis is recommended when queue behavior must survive process restarts.

## Rollback Procedure

1. Stop new deployments immediately.
2. Roll back the application image or commit to the last known good version.
3. Do not roll back database migrations blindly. Review whether a down migration or forward fix is safer.
4. Keep compromised secrets rotated even after rollback.
5. Review `logs/security-*.log`, platform request logs, and admin audit logs before reopening admin access.
