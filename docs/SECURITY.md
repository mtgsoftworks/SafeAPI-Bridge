# SafeAPI-Bridge Security Guide

## Overview

SafeAPI-Bridge implements multiple layers of security to protect API keys and prevent abuse. This document details the security architecture and best practices.

---

## Security Architecture

### Defense in Depth

```
┌─────────────────────────────────────────────────────────────┐
│                    SECURITY LAYERS                          │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: Transport Security                                │
│  ├── HTTPS Enforcement (production)                         │
│  ├── HSTS Headers (1 year, includeSubDomains, preload)     │
│  └── TLS 1.2+ only                                         │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: Request Validation                                │
│  ├── CORS Origin Validation                                 │
│  ├── Content-Type Verification                              │
│  ├── Body Size Limits (2MB)                                 │
│  └── Request Timeout (30s default)                          │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: Input Sanitization                                │
│  ├── XSS Prevention                                         │
│  ├── SQL Injection Detection                                │
│  ├── Command Injection Detection                            │
│  └── Path Traversal Prevention                              │
├─────────────────────────────────────────────────────────────┤
│  Layer 4: Authentication                                    │
│  ├── JWT Token Verification                                 │
│  ├── Token Blacklist (logout support)                       │
│  └── Token Expiration (7 days default)                      │
├─────────────────────────────────────────────────────────────┤
│  Layer 5: Authorization                                     │
│  ├── IP Whitelist/Blacklist                                 │
│  ├── Endpoint Whitelist per API                             │
│  ├── User Quota Enforcement                                 │
│  └── Admin Key Verification                                 │
├─────────────────────────────────────────────────────────────┤
│  Layer 6: Rate Limiting                                     │
│  ├── Global Rate Limits (100/hour default)                  │
│  ├── Auth Endpoint Limits (10/minute)                       │
│  └── Per-IP Tracking                                        │
├─────────────────────────────────────────────────────────────┤
│  Layer 7: Monitoring & Logging                              │
│  ├── Security Event Logging                                 │
│  ├── Suspicious Activity Detection                          │
│  ├── Audit Logging (admin actions)                          │
│  └── Request Correlation (X-Request-ID)                     │
└─────────────────────────────────────────────────────────────┘
```

---

## Authentication

### JWT Token Security

**Token Structure:**
- Algorithm: HS256
- Expiration: 7 days (configurable)
- Payload: `{ userId, appId, createdAt, iat, exp }`

**Best Practices:**
- Generate strong `JWT_SECRET` (64+ characters)
- Rotate secrets periodically
- Use token blacklist for logout
- Validate token on every request

**Token Blacklist:**
- In-memory LRU cache for performance
- Persistent storage in database
- Automatic cleanup of expired entries

### Admin Authentication

Admin endpoints require both:
1. Valid JWT token
2. `X-Admin-Key` header matching `ADMIN_API_KEY`

```javascript
// Admin endpoint protection
if (adminKey !== process.env.ADMIN_API_KEY) {
  return res.status(403).json({ error: 'Forbidden' });
}
```

---

## BYOK Split-Key Security

### Key Splitting Process

```
Original API Key: sk-abc123xyz789...
                      │
                      ▼
┌─────────────────────────────────────────┐
│         AES-256-GCM Encryption          │
│  ┌─────────────────────────────────┐   │
│  │ 1. Generate random IV (12 bytes) │   │
│  │ 2. Generate encryption key       │   │
│  │ 3. Encrypt original key          │   │
│  │ 4. Split encrypted data          │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
   ┌─────────────┐         ┌─────────────┐
   │ Server Part │         │ Client Part │
   │  (Database) │         │  (Backend)  │
   │             │         │             │
   │ - Encrypted │         │ - Encrypted │
   │   portion   │         │   portion   │
   │ - Decrypt   │         │ - Hash for  │
   │   secret    │         │   validation│
   └─────────────┘         └─────────────┘
```

### Security Properties

1. **Key Never Stored in Plain Text**: Original key is immediately encrypted
2. **Split Storage**: No single location has the complete key
3. **Memory-Only Reconstruction**: Full key exists only in memory during request
4. **Per-Request Reconstruction**: Key is reconstructed and discarded per request
5. **Client Part Validation**: Hash verification prevents tampering

### Usage Tracking

- Each split key has usage counter
- Last used timestamp tracked
- Can be deactivated without deletion

---

## Input Validation

### Endpoint Whitelist

Each API provider has a strict whitelist of allowed endpoints:

```javascript
const allowedEndpoints = {
  openai: [
    '/chat/completions',
    '/completions',
    '/embeddings',
    '/models'
  ],
  gemini: [
    '/models/gemini-2.5-flash:generateContent',
    '/models/gemini-2.5-pro:generateContent',
    // ... more endpoints
  ]
  // ... other providers
};
```

**Protection Against:**
- Unauthorized endpoint access
- API abuse through unexpected endpoints
- Data exfiltration attempts

### Request Sanitization

The `inputSanitizer` middleware detects and blocks:

| Attack Type | Detection Pattern |
|-------------|-------------------|
| SQL Injection | `SELECT`, `UNION`, `DROP`, `--`, etc. |
| Command Injection | `; rm`, `| cat`, backticks, etc. |
| XSS | `<script>`, `javascript:`, event handlers |
| Path Traversal | `../`, `..\\`, absolute paths |

```javascript
// Example detection
const sqlPatterns = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER)\b)/gi,
  /(--|;|\/\*|\*\/)/g,
  /(\bOR\b|\bAND\b).*[=<>]/gi
];
```

---

## Rate Limiting

### Configuration

```javascript
{
  windowMs: 3600000,      // 1 hour window
  maxRequests: 100,       // 100 requests per window
  message: 'Too many requests'
}
```

### Headers

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1705142400
```

### Per-Endpoint Limits

| Endpoint Type | Limit |
|---------------|-------|
| Auth endpoints | 10/minute |
| API proxy | 100/hour |
| Admin endpoints | 50/hour |

---

## IP Security

### IP Rules

```javascript
// IpRule model
{
  ipAddress: '192.168.1.100',  // or CIDR: '192.168.1.0/24'
  type: 'whitelist',           // or 'blacklist'
  reason: 'Office network',
  active: true
}
```

### Behavior

1. **Blacklist Check**: Blocked IPs receive 403 immediately
2. **Whitelist Mode**: If any whitelist rules exist, only whitelisted IPs allowed
3. **Dynamic Updates**: Rules can be added/removed via admin API

---

## Security Monitoring

### Threat Detection

The `securityMonitor` middleware detects:

- **Injection Attempts**: SQL, Command, XSS
- **Brute Force**: Multiple failed auth attempts
- **Suspicious Patterns**: Unusual request patterns
- **Scanner Detection**: Known vulnerability scanner signatures

### Logging

Security events are logged to:
- `logs/security-YYYY-MM-DD.log`
- Console (development)
- Webhook notifications (if configured)

**Log Format:**
```json
{
  "timestamp": "2025-01-13T10:00:00.000Z",
  "level": "warn",
  "eventType": "SUSPICIOUS_ACTIVITY",
  "activityType": "SQL_INJECTION",
  "ip": "192.168.1.100",
  "path": "/api/openai/proxy",
  "userId": "user-123",
  "severity": "high"
}
```

---

## Audit Logging

### Admin Actions Tracked

- User creation/modification/deletion
- IP rule changes
- Webhook configuration changes
- Split key operations
- Quota adjustments

**Audit Log Entry:**
```json
{
  "action": "user.update",
  "adminKey": "hashed-admin-key",
  "ipAddress": "192.168.1.100",
  "details": {
    "userId": "user-123",
    "changes": { "dailyQuota": 200 }
  },
  "success": true,
  "createdAt": "2025-01-13T10:00:00.000Z"
}
```

---

## Security Headers

### Helmet Configuration

```javascript
helmet({
  hsts: {
    maxAge: 31536000,        // 1 year
    includeSubDomains: true,
    preload: true
  },
  contentSecurityPolicy: false  // Disabled for API
})
```

### Response Headers

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
X-Request-ID: uuid-for-tracing
```

---

## Best Practices

### Production Deployment

1. **Environment Variables**
   - Never commit secrets to repository
   - Use strong, random values for JWT_SECRET and ADMIN_API_KEY
   - Rotate secrets periodically

2. **HTTPS**
   - Always use HTTPS in production
   - Configure TLS 1.2+ only
   - Use valid SSL certificates

3. **Database**
   - Use PostgreSQL for production
   - Enable SSL for database connections
   - Regular backups

4. **Monitoring**
   - Set up alerting for security events
   - Monitor rate limit hits
   - Track failed authentication attempts

5. **Updates**
   - Keep dependencies updated
   - Monitor security advisories
   - Apply patches promptly

### Client Integration

1. **Token Storage**
   - Store JWT securely (Keychain/Keystore)
   - Never log tokens
   - Handle token expiration gracefully

2. **BYOK Keys**
   - Store client part in secure backend
   - Never expose in client-side code
   - Use environment variables

3. **Error Handling**
   - Don't expose internal errors to users
   - Log errors server-side
   - Implement retry with backoff

---

## Incident Response

### Suspected Breach

1. **Immediate Actions**
   - Rotate JWT_SECRET (invalidates all tokens)
   - Rotate ADMIN_API_KEY
   - Review audit logs
   - Check for unauthorized API usage

2. **Investigation**
   - Analyze security logs
   - Identify affected users
   - Determine attack vector

3. **Remediation**
   - Patch vulnerability
   - Notify affected users
   - Update security rules

### Key Compromise

If an API key is compromised:

1. Revoke key at provider
2. Deactivate split key: `DELETE /api/split-key/:keyId`
3. Create new split key
4. Update client configuration
