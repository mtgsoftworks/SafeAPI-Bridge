# Security Guide

SafeAPI-Bridge is designed as a defense-in-depth proxy for AI provider traffic. This guide documents the security model, operational controls, and production requirements.

## Security Model

The service protects three main assets:

- Provider API keys stored in server environment variables or split-key records.
- Client JWTs used to access proxy and analytics endpoints.
- Administrative capabilities exposed through `/admin/*` and protected documentation routes.

Primary controls:

- HTTPS enforcement in production.
- Helmet security headers.
- Strict CORS allowlist for browser origins.
- Mobile no-origin support when explicitly enabled.
- JWT verification and logout blacklist.
- Admin key verification using timing-safe comparison.
- IP whitelist and blacklist rules.
- Endpoint allowlists per provider.
- Global, auth, admin, and provider-specific rate limits.
- Quota checks per user.
- Abuse guard for scanner/probe traffic.
- Structured security and audit logs.
- SSRF validation for webhook URLs.

## Production Requirements

Set the following in production:

```env
NODE_ENV=production
JWT_SECRET=<64-plus-character-random-secret>
ADMIN_API_KEY=<strong-random-admin-key>
DATABASE_URL=postgresql://...
ALLOWED_ORIGINS=https://example.com,https://www.example.com
ALLOW_MOBILE_NO_ORIGIN=true
ABUSE_GUARD_ENABLED=true
```

Do not use development or sample values in production.

If a secret is exposed in chat, tickets, screenshots, browser history, logs, CI output, or source control, rotate it immediately.

## Authentication

### JWT

JWTs are signed with `JWT_SECRET` and expire according to the configured application value. The default runtime value is currently seven days.

JWT-protected endpoints require:

```http
Authorization: Bearer <JWT_TOKEN>
```

Logout uses an in-memory blacklist. In multi-instance deployments or after process restarts, previously blacklisted tokens may no longer be known to all instances. For high-security deployments, use shorter JWT lifetime and consider a persistent blacklist store.

### Admin Key

Admin endpoints and documentation require:

```http
X-Admin-Key: <ADMIN_API_KEY>
```

Admin comparison is timing-safe. Missing or invalid admin keys are logged and counted by failed-auth tracking.

Protected documentation:

- `/api-docs`
- `/api-docs.json`
- `/api-docs.yaml`

## Authorization

### Endpoint Allowlist

Each provider has an allowlist in `src/config/apis.js`. Requests outside that allowlist are rejected before forwarding.

### IP Rules

IP rules are stored in the database and managed through `/admin/ip-rules`.

Behavior:

- No rule for an IP means allowed by default.
- Blacklist rules take precedence.
- If an IP has an active whitelist rule and no blacklist rule, it is allowed.
- Current rule matching is exact IP matching.

Use persistent blacklist rules for IPs that must remain blocked after restart.

### Quotas

User quotas are enforced before proxying. Counters are incremented asynchronously during usage tracking. For high-volume deployments, review race conditions around parallel requests and consider transactional quota reservations.

## Abuse Guard

The abuse guard is an early middleware that runs before body parsing and normal routing. It blocks common scanner traffic with minimal responses and without changing mobile client contracts.

Detected probe signals include:

- WordPress paths such as `/wp-content`, `/wp-includes`, `/wp-login.php`, `/xmlrpc.php`.
- PHP probing such as `/wp-blog.php` or `/admin.php`.
- Double-slash paths such as `//wp-includes/js/jquery/`.
- Path traversal patterns.
- Known scanner user agents.
- Missing user-agent only when combined with scanner path signals.

Default configuration:

```env
ABUSE_GUARD_ENABLED=true
ABUSE_GUARD_STRIKE_THRESHOLD=5
ABUSE_GUARD_WINDOW_MS=600000
ABUSE_GUARD_BLOCK_MS=3600000
ABUSE_GUARD_BLOCK_AUTHENTICATED=false
```

Behavior:

- Scanner probes receive a minimal `404`.
- Repeated probes create an in-memory temporary block.
- Authenticated application paths are not blocked by temporary blocks when `ABUSE_GUARD_BLOCK_AUTHENTICATED=false`.
- Scanner paths are still blocked even if a caller sends a bearer token.
- Blocks reset on process restart.

Admin operations:

```bash
curl -H "X-Admin-Key: $ADMIN_API_KEY" https://api.example.com/admin/security/blocks
curl -X DELETE -H "X-Admin-Key: $ADMIN_API_KEY" https://api.example.com/admin/security/blocks/52.138.6.165
```

## Rate Limits

Default limits:

- Global API routes: configured by `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX_REQUESTS`.
- Auth routes: strict auth limiter.
- Admin routes: strict admin limiter.
- Provider proxy routes: provider-specific limiter.

Rate limit headers use the standard `RateLimit-*` format from `express-rate-limit`.

## CORS and Mobile Clients

Production browser origins should be explicit:

```env
ALLOWED_ORIGINS=https://example.com,https://www.example.com
```

Native mobile apps commonly send no `Origin` header. Keep this enabled only if required:

```env
ALLOW_MOBILE_NO_ORIGIN=true
```

Do not use wildcard origins in production.

## BYOK Split-Key Security

BYOK split-key mode encrypts the original provider key and stores split components. It avoids storing the original provider key as plaintext.

Important operational guidance:

- Treat the database as sensitive key material.
- Restrict database access to the application and approved operators.
- Encrypt backups at rest.
- Rotate provider keys if split-key records or database backups are exposed.
- Do not expose `clientPart` in client-side web code, public logs, or analytics systems.

## Webhook SSRF Protection

Webhook URLs are validated during creation and before sending.

Blocked targets include:

- Localhost and loopback addresses.
- RFC1918 private ranges.
- Cloud metadata service IPs.
- Unsupported protocols.
- Redirect-based SSRF via `maxRedirects: 0`.

For high-security deployments, prefer webhooks to approved vendor domains and monitor failed webhook events.

## Logging and Audit

Security events are written through the structured security logger. File logging is disabled in light mode.

Admin operations are also recorded in `AuditLog` where applicable.

Monitor for:

- `FAILED_AUTH`
- `SUSPICIOUS_ACTIVITY`
- `SCANNER_PROBE_DETECTED`
- `IP_TEMP_BLOCKED`
- `BLOCKED_REQUEST`
- `RATE_LIMIT_EXCEEDED`
- `SSRF_ATTEMPT`
- `ADMIN_OPERATION`

## Incident Response

### If an admin key or JWT secret is exposed

1. Rotate `ADMIN_API_KEY` and `JWT_SECRET` immediately.
2. Restart all running instances.
3. Invalidate or reissue mobile/client tokens as needed.
4. Review audit logs and security logs.

### If a provider key is exposed

1. Revoke the provider key at the provider console.
2. Replace the environment variable or BYOK split key.
3. Review `ApiUsage` and provider-side usage logs.
4. Add temporary IP blocks or persistent IP rules if abuse is ongoing.

### If scanner traffic spikes

1. Confirm abuse guard is enabled.
2. Review `/admin/security/blocks`.
3. Persistently blacklist repeat hostile IPs if appropriate.
4. Consider upstream firewall/WAF rules for volumetric attacks.

## Production Checklist

- [ ] `NODE_ENV=production`.
- [ ] Strong `JWT_SECRET` and `ADMIN_API_KEY` generated and stored only in the deployment secret store.
- [ ] Provider keys rotated after any exposure.
- [ ] `ALLOWED_ORIGINS` restricted to production domains.
- [ ] `ALLOW_MOBILE_NO_ORIGIN` set intentionally for native apps.
- [ ] Abuse guard enabled.
- [ ] `/api-docs*` protected by admin key.
- [ ] Database uses PostgreSQL and restricted network access.
- [ ] Backups encrypted and access controlled.
- [ ] Logs monitored for failed auth, scanner probes, and rate limits.
- [ ] Dependency audit reviewed before release.
