# SafeAPI-Bridge API Reference

## Base URL

```
Development: http://localhost:3000
Production:  https://your-domain.com
```

## Authentication

All protected endpoints require a JWT token in the Authorization header:

```
Authorization: Bearer <JWT_TOKEN>
```

Admin endpoints additionally require:

```
X-Admin-Key: <ADMIN_API_KEY>
```

---

## Authentication Endpoints

### POST /auth/token

Generate a new JWT token. Automatically creates user if not exists.

**Request:**

```json
{
  "userId": "user-123",
  "appId": "my-android-app"
}
```

**Response:**

```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": "7 days",
  "tokenType": "Bearer",
  "user": {
    "userId": "user-123",
    "appId": "my-android-app",
    "dailyQuota": 100,
    "monthlyQuota": 3000,
    "requestsToday": 0,
    "requestsMonth": 0
  }
}
```

### GET /auth/verify

Verify if the current token is valid.

**Headers:**

```
Authorization: Bearer <JWT_TOKEN>
```

**Response:**

```json
{
  "valid": true,
  "user": {
    "userId": "user-123",
    "appId": "my-android-app"
  },
  "message": "Token is valid"
}
```

### POST /auth/logout

Revoke the current token (adds to blacklist).

**Headers:**

```
Authorization: Bearer <JWT_TOKEN>
```

**Response:**

```json
{
  "success": true,
  "message": "Logged out successfully. Token has been revoked.",
  "userId": "user-123"
}
```

### GET /auth/token-info

Get detailed information about the current token.

**Headers:**

```
Authorization: Bearer <JWT_TOKEN>
```

**Response:**

```json
{
  "user": {
    "userId": "user-123",
    "appId": "my-android-app"
  },
  "issuedAt": "2025-01-13T10:00:00.000Z",
  "expiresAt": "2025-01-20T10:00:00.000Z",
  "expiresInSeconds": 604800,
  "expiresInHours": "168.00",
  "isBlacklisted": false
}
```

---

## Proxy Endpoints

### POST /api/:api/proxy

Main proxy endpoint for AI API requests.

**Path Parameters:**

- `api`: API provider name (openai, gemini, claude, groq, mistral, zai, deepseek, perplexity, together, openrouter, fireworks, github, replicate, stability, fal, elevenlabs, brave, deepl, openmeteo)

**Headers (Server Key Method):**

```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**Headers (BYOK Split-Key Method):**

```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
X-Partial-Key-Id: sk-myapp-user123-abc123
X-Partial-Key: <CLIENT_PART>
```

**Request Body (OpenAI Example):**

```json
{
  "endpoint": "/chat/completions",
  "model": "gpt-4",
  "messages": [
    { "role": "user", "content": "Hello, world!" }
  ],
  "temperature": 0.7
}
```

**Request Body (Gemini Example):**

```json
{
  "endpoint": "/models/gemini-3-flash:generateContent",
  "contents": [
    {
      "parts": [
        { "text": "Explain quantum computing in simple terms." }
      ]
    }
  ],
  "generationConfig": {
    "maxOutputTokens": 1024,
    "temperature": 0.7
  }
}
```

**Request Body (Claude Example):**

```json
{
  "endpoint": "/messages",
  "model": "claude-sonnet-5-20260203",
  "max_tokens": 1024,
  "messages": [
    { "role": "user", "content": "What is the meaning of life?" }
  ]
}
```

**Response:**
The response is transparently forwarded from the AI provider.

### GET /api/:api/endpoints

Get list of allowed endpoints for a specific API.

**Response:**

```json
{
  "api": "OPENAI",
  "configured": true,
  "baseUrl": "https://api.openai.com/v1",
  "allowedEndpoints": [
    "/chat/completions",
    "/completions",
    "/embeddings",
    "/models"
  ],
  "message": "API is configured and ready to use"
}
```

---

## Split-Key (BYOK) Endpoints

### POST /api/split-key/split

Create a new split key for BYOK usage.

**Request:**

```json
{
  "originalKey": "sk-your-api-key-here",
  "apiProvider": "openai",
  "keyId": "my-custom-key-id",
  "description": "Production key for mobile app"
}
```

**Response:**

```json
{
  "success": true,
  "message": "API key split successfully",
  "data": {
    "keyId": "my-custom-key-id",
    "apiProvider": "openai",
    "clientPart": "encrypted-client-part-base64",
    "algorithm": "AES-256-GCM",
    "createdAt": "2025-01-13T10:00:00.000Z",
    "instructions": {
      "storage": "Store clientPart securely in your backend",
      "usage": "Include X-Partial-Key-Id and X-Partial-Key headers"
    }
  }
}
```

### GET /api/split-key

List all split keys for the current user.

**Response:**

```json
{
  "success": true,
  "keys": [
    {
      "keyId": "my-custom-key-id",
      "apiProvider": "openai",
      "algorithm": "AES-256-GCM",
      "keyVersion": 1,
      "active": true,
      "usageCount": 150,
      "lastUsed": "2025-01-13T09:30:00.000Z",
      "createdAt": "2025-01-01T00:00:00.000Z"
    }
  ]
}
```

### GET /api/split-key/:keyId

Get details for a specific split key.

**Response:**

```json
{
  "success": true,
  "key": {
    "keyId": "my-custom-key-id",
    "apiProvider": "openai",
    "algorithm": "AES-256-GCM",
    "keyVersion": 1,
    "active": true,
    "description": "Production key for mobile app",
    "usageCount": 150,
    "lastUsed": "2025-01-13T09:30:00.000Z",
    "createdAt": "2025-01-01T00:00:00.000Z"
  }
}
```

### DELETE /api/split-key/:keyId

Deactivate a split key.

**Response:**

```json
{
  "success": true,
  "message": "Split key deactivated successfully",
  "keyId": "my-custom-key-id"
}
```

### POST /api/split-key/validate

Validate split key headers without making an API request.

**Headers:**

```
Authorization: Bearer <JWT_TOKEN>
X-Partial-Key-Id: my-custom-key-id
X-Partial-Key: <CLIENT_PART>
```

**Response:**

```json
{
  "valid": true,
  "keyId": "my-custom-key-id",
  "apiProvider": "openai",
  "message": "Split key headers are valid"
}
```

---

## Analytics Endpoints

### GET /analytics/my-stats

Get current user's usage statistics.

**Response:**

```json
{
  "userId": "user-123",
  "period": {
    "start": "2025-01-01T00:00:00.000Z",
    "end": "2025-01-13T23:59:59.999Z"
  },
  "usage": {
    "totalRequests": 450,
    "successfulRequests": 445,
    "failedRequests": 5,
    "totalTokens": 125000,
    "estimatedCost": 2.50
  },
  "byApi": {
    "openai": { "requests": 300, "tokens": 100000 },
    "gemini": { "requests": 150, "tokens": 25000 }
  },
  "quotas": {
    "daily": { "used": 45, "limit": 100 },
    "monthly": { "used": 450, "limit": 3000 }
  }
}
```

### GET /analytics/overview (Admin)

Get system-wide statistics.

**Headers:**

```
Authorization: Bearer <JWT_TOKEN>
X-Admin-Key: <ADMIN_API_KEY>
```

**Response:**

```json
{
  "period": {
    "start": "2025-01-01T00:00:00.000Z",
    "end": "2025-01-13T23:59:59.999Z"
  },
  "totals": {
    "users": 1500,
    "requests": 45000,
    "tokens": 12500000,
    "cost": 250.00
  },
  "byApi": {
    "openai": { "requests": 30000, "tokens": 10000000 },
    "gemini": { "requests": 15000, "tokens": 2500000 }
  }
}
```

### GET /analytics/costs (Admin)

Get cost breakdown by API.

### GET /analytics/errors (Admin)

Get error statistics.

---

## Admin Endpoints

All admin endpoints require `X-Admin-Key` header.

### GET /admin/users

List all users with pagination.

### GET /admin/users/:userId

Get user details.

### PATCH /admin/users/:userId

Update user quotas or status.

### DELETE /admin/users/:userId

Deactivate a user.

### GET /admin/ip-rules

List IP whitelist/blacklist rules.

### POST /admin/ip-rules

Add a new IP rule.

### DELETE /admin/ip-rules/:id

Remove an IP rule.

### GET /admin/webhooks

List configured webhooks.

### POST /admin/webhooks

Create a new webhook.

### DELETE /admin/webhooks/:id

Remove a webhook.

### GET /admin/audit-logs

Get audit logs with filtering.

---

## Health Check Endpoints

### GET /

Service info.

**Response:**

```json
{
  "service": "SafeAPI-Bridge",
  "status": "running",
  "version": "1.0.0",
  "message": "Server is healthy. Use /health for detailed status."
}
```

### GET /health

Detailed health check including database and API status.

**Response:**

```json
{
  "status": "healthy",
  "timestamp": "2025-01-13T10:00:00.000Z",
  "apis": {
    "openai": { "configured": true, "baseUrl": "https://api.openai.com/v1" },
    "gemini": { "configured": true, "baseUrl": "https://generativelanguage.googleapis.com/v1beta" },
    "claude": { "configured": false, "baseUrl": "https://api.anthropic.com/v1" }
  },
  "infrastructure": {
    "database": { "status": "connected", "latency": "3ms" }
  },
  "summary": "2/19 APIs configured"
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Error Type",
  "message": "Human-readable error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

### Common Error Codes

| Status | Error | Description |
|--------|-------|-------------|
| 400 | Bad Request | Invalid request body or parameters |
| 401 | Unauthorized | Missing or invalid token |
| 403 | Forbidden | Endpoint not allowed or quota exceeded |
| 404 | Not Found | Resource not found |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |
| 502 | Bad Gateway | External API error |
| 503 | Service Unavailable | Service temporarily unavailable |
| 504 | Gateway Timeout | External API timeout |

---

## Rate Limiting

Default limits:

- **Global**: 100 requests per hour per IP
- **Auth endpoints**: 10 requests per minute per IP

Rate limit headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1705142400
```
