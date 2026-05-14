# API Reference

This document describes the public, authenticated, admin, and documentation endpoints exposed by SafeAPI-Bridge.

## Base URLs

```text
Local:      http://localhost:3000
Production: https://api.example.com
```

## Authentication Headers

Client-protected endpoints use JWT:

```http
Authorization: Bearer <JWT_TOKEN>
```

Admin endpoints and protected documentation use:

```http
X-Admin-Key: <ADMIN_API_KEY>
```

Some analytics admin endpoints require both JWT and `X-Admin-Key` because they are mounted under JWT-protected analytics routes.

## Public Endpoints

### GET /

Returns minimal service information.

```json
{
  "service": "SafeAPI-Bridge",
  "status": "running",
  "message": "Server is healthy. Use /health for detailed status."
}
```

### GET /health

Returns minimal health data publicly. Detailed provider and infrastructure details are returned only when a valid `X-Admin-Key` is provided.

Public response:

```json
{
  "status": "healthy",
  "timestamp": "2026-05-14T10:00:00.000Z"
}
```

Admin response includes provider configuration status, database health, queue stats, and summary counts.

## Protected Documentation

### GET /api-docs

Swagger UI. Requires `X-Admin-Key`.

### GET /api-docs.json

Raw OpenAPI JSON. Requires `X-Admin-Key`.

```bash
curl -H "X-Admin-Key: $ADMIN_API_KEY" https://api.example.com/api-docs.json
```

### GET /api-docs.yaml

Raw OpenAPI YAML. Requires `X-Admin-Key`.

```bash
curl -H "X-Admin-Key: $ADMIN_API_KEY" https://api.example.com/api-docs.yaml
```

## Authentication

### POST /auth/token

Creates or retrieves a user and returns a JWT.

Request:

```json
{
  "userId": "user-123",
  "appId": "calm-mobile-app"
}
```

Response:

```json
{
  "success": true,
  "token": "<JWT_TOKEN>",
  "expiresIn": "7 days",
  "tokenType": "Bearer",
  "user": {
    "userId": "user-123",
    "appId": "calm-mobile-app",
    "dailyQuota": 100,
    "monthlyQuota": 3000,
    "requestsToday": 0,
    "requestsMonth": 0
  }
}
```

Notes:

- This route is rate limited.
- Production deployments should treat `userId` and `appId` as application identifiers, not as strong end-user authentication by themselves.

### GET /auth/verify

Validates a JWT.

### POST /auth/logout

Adds the current JWT to the in-memory token blacklist until expiration.

### GET /auth/token-info

Returns token issue time, expiration time, and blacklist status.

## Proxy API

### POST /api/:provider/proxy

Forwards a request to a configured provider endpoint.

Path parameter:

| Name | Description |
| --- | --- |
| `provider` | One of the supported provider keys in `src/config/apis.js`, such as `openai`, `gemini`, `claude`, `groq`, `mistral`, `zai`, `deepseek`, `perplexity`, `together`, `openrouter`, `fireworks`, `github`, `replicate`, `stability`, `fal`, `elevenlabs`, `brave`, `deepl`, or `openmeteo`. |

Server-key headers:

```http
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

BYOK split-key headers:

```http
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
X-Partial-Key-Id: <KEY_ID>
X-Partial-Key: <CLIENT_PART>
```

OpenAI-style example:

```json
{
  "endpoint": "/chat/completions",
  "model": "gpt-4o-mini",
  "messages": [
    { "role": "user", "content": "Write a short breathing exercise." }
  ],
  "temperature": 0.7
}
```

Gemini example:

```json
{
  "endpoint": "/models/gemini-2.5-flash:generateContent",
  "contents": [
    {
      "parts": [
        { "text": "Explain mindful breathing in simple terms." }
      ]
    }
  ]
}
```

Response:

- Provider responses are forwarded transparently.
- Provider errors are normalized by the proxy error handler.
- Usage is tracked asynchronously.

### GET /api/:provider/proxy

Forwards a GET request to an allowed provider endpoint. The provider endpoint must be supplied as `?endpoint=/path`.

### POST /api/:provider

Convenience route equivalent to `POST /api/:provider/proxy` for supported providers.

### GET /api/:provider/endpoints

Returns the endpoint allowlist for a provider. Requires JWT.

## BYOK Split-Key API

### POST /api/split-key/split

Splits and stores a provider API key for BYOK usage.

Request:

```json
{
  "originalKey": "<provider-api-key>",
  "apiProvider": "openai",
  "description": "Mobile production OpenAI key"
}
```

Response includes `keyId` and `clientPart`. Store `clientPart` securely and send it in `X-Partial-Key` when proxying.

### GET /api/split-key

Lists split keys created by the authenticated user.

### GET /api/split-key/:keyId

Returns metadata for one split key owned by the authenticated user.

### DELETE /api/split-key/:keyId

Deactivates a split key owned by the authenticated user.

### POST /api/split-key/validate

Validates split-key headers and checks that the key can be reconstructed.

## Analytics API

### GET /analytics/my-stats

Returns analytics for the authenticated user.

### GET /analytics/user/:userId

Returns analytics for the requested user. Users can access only their own records unless `X-Admin-Key` is valid.

### GET /analytics/overview

Admin-only system overview. Requires JWT and `X-Admin-Key`.

### GET /analytics/costs

Admin-only cost breakdown. Requires JWT and `X-Admin-Key`.

### GET /analytics/errors

Admin-only error statistics. Requires JWT and `X-Admin-Key`.

## Admin API

All `/admin/*` routes require `X-Admin-Key` and are protected by the admin rate limiter.

### Users

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/admin/users` | List users. |
| GET | `/admin/users/:userId` | Get one user. |
| POST | `/admin/users` | Create a user. |
| PUT | `/admin/users/:userId/quota` | Update quotas. |
| DELETE | `/admin/users/:userId` | Delete a user. |

### IP Rules

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/admin/ip-rules` | List IP rules. |
| POST | `/admin/ip-rules` | Add whitelist or blacklist rule. |
| DELETE | `/admin/ip-rules/:ip` | Remove rules for an IP. |

### Webhooks

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/admin/webhooks` | List webhooks. |
| POST | `/admin/webhooks` | Create webhook. |
| POST | `/admin/webhooks/:id/test` | Send test webhook. |
| DELETE | `/admin/webhooks/:id` | Delete webhook. |

### Audit Logs

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/admin/audit-logs` | List audit logs. |
| GET | `/admin/audit-logs/stats` | Audit statistics. |
| GET | `/admin/audit-logs/failed` | Recent failed admin operations. |

### Temporary Abuse Blocks

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/admin/security/blocks` | List active in-memory abuse-guard blocks. |
| DELETE | `/admin/security/blocks/:ip` | Remove a temporary block. |

### System

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/admin/metrics` | JSON metrics. |
| GET | `/admin/metrics/prometheus` | Prometheus text metrics. |
| POST | `/admin/metrics/reset` | Reset in-memory metrics. |
| GET | `/admin/log-level` | Current logger level. |
| PUT | `/admin/log-level` | Change logger level. |
| GET | `/admin/provider-timeouts` | Effective provider timeouts. |

## Error Responses

Most errors use this shape:

```json
{
  "error": "Error Type",
  "message": "Human-readable message"
}
```

Validation errors may use the structured formatter:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Endpoint must start with /",
    "details": {},
    "timestamp": "2026-05-14T10:00:00.000Z",
    "requestId": "..."
  }
}
```

## Common Status Codes

| Status | Meaning |
| --- | --- |
| 400 | Invalid input. |
| 401 | Missing, invalid, or revoked authentication. |
| 403 | Forbidden by policy, IP rules, endpoint allowlist, or quota state. |
| 404 | Resource not found or scanner probe intentionally hidden. |
| 429 | Rate limit or quota exceeded. |
| 500 | Internal server error. |
| 503 | Provider or infrastructure unavailable. |
| 504 | Upstream timeout. |
