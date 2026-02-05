# Repository Guidelines

## Project Structure & Module Organization

- Core server entry: `src/server.js`.
- HTTP pipeline: `src/routes`, `src/controllers`, `src/middleware`, `src/utils`.
- Data access: `src/db` using Prisma, schema in `prisma/schema.prisma`, migrations in `prisma/migrations`.
- Services: `src/services` (apiForwarding, requestQueue, retryService, splitKey, usage, analytics, etc.).
- Tests: unit and security tests live under `tests/` (`tests/unit`, `tests/security`).
- Operational tooling: `scripts/` (schedulers, Render helpers, full test runners).
- API docs and guides: `openapi.yaml`, `BYOK_INTEGRATION_GUIDE.md`, `README.md`, `docs/`.

## Key Services

- `apiForwarding.js`: API proxy with retry and circuit breaker support.
- `requestQueue.js`: Bull queue (Redis) with in-memory fallback, priority queue.
- `retryService.js`: Exponential backoff, jitter, circuit breaker pattern.
- `splitKey.js`: BYOK AES-256-GCM encryption and key splitting.
- `cacheService.js`: Redis + in-memory cache with TTL and tags.

## Build, Test, and Development Commands

- Install deps: `npm install`.
- Local dev with reload: `npm run dev`.
- Start production server: `npm start`.
- Run all Jest tests with coverage: `npm test`.
- Focused suites: `npm run test:unit`, `npm run test:integration`, `npm run test:security`.
- Prisma workflows: `npm run prisma:generate`, `npm run prisma:migrate`, `npm run prisma:deploy`.

## Coding Style & Naming Conventions

- Runtime: Node.js 18+, CommonJS modules (`require`/`module.exports`), async/await.
- Indentation: 2 spaces; always use semicolons and single quotes for strings.
- Place request logic in controllers/services, not routes; keep middleware small and composable.
- Name files by responsibility: `*.controller.js`, `*.service.js`, `*.middleware.js` where appropriate.

## Testing Guidelines

- Framework: Jest (`tests/**/*.test.js`, `__tests__` supported).
- Prefer fast unit tests in `tests/unit`; heavier permission or edge-case checks in `tests/security`.
- Keep tests deterministic (no live provider calls); mock external HTTP and Prisma.
- Aim to maintain or improve coverage thresholds defined in `jest.config.js`.
- Run `npm test` before opening a PR.

## Commit & Pull Request Guidelines

- Commit messages: use clear, present-tense summaries, ideally Conventional Commit style, e.g. `feat: add split-key validation` or `fix: tighten IP whitelist checks`.
- Scope commits narrowly (one logical change per commit).
- PRs should include: purpose summary, key implementation notes (especially around security, quotas, or BYOK), testing commands/results, and links to related issues.
- For changes touching `.env` expectations, Prisma schema, or security behavior, call this out explicitly in the PR description.

## Security & Configuration Notes

- Never commit secrets (`.env`, provider keys, JWT secrets, database URLs); use `.env` locally and environment variables in production.
- When adding new AI providers or admin endpoints, update rate limiting, IP rules, logging, and the OpenAPI spec to match the security model used elsewhere in `src/`.

## Queue & Retry Configuration

- `REDIS_URL`: Optional, enables Bull queue. Falls back to in-memory if not set.
- `QUEUE_MAX_CONCURRENT`: Max concurrent jobs (default: 10).
- `API_RETRY_ATTEMPTS`: Retry attempts for API calls (default: 3).
- `RETRY_MAX_DELAY_MS`: Max delay for exponential backoff (default: 30000).
