# SafeAPI-Bridge Deployment Guide

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development](#local-development)
3. [Production Deployment](#production-deployment)
4. [Docker Deployment](#docker-deployment)
5. [Cloud Platforms](#cloud-platforms)
6. [Environment Configuration](#environment-configuration)
7. [Database Setup](#database-setup)
8. [Security Checklist](#security-checklist)
9. [Monitoring & Logging](#monitoring--logging)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

- **Node.js**: v18 or higher
- **npm**: v9 or higher
- **Database**: SQLite (dev) or PostgreSQL (production)
- **At least one AI provider API key**

---

## Local Development

### 1. Clone and Install

```bash
git clone https://github.com/yourusername/safeapi-bridge.git
cd safeapi-bridge
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your configuration
```

### 3. Setup Database

```bash
# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate
```

### 4. Start Development Server

```bash
npm run dev
```

Server runs at `http://localhost:3000` with hot reload.

---

## Production Deployment

### 1. Environment Setup

```bash
# Set NODE_ENV
export NODE_ENV=production

# Generate strong JWT secret
export JWT_SECRET=$(openssl rand -base64 64)

# Set admin key
export ADMIN_API_KEY=$(openssl rand -base64 32)
```

### 2. Database Migration

```bash
# Deploy migrations without creating new ones
npm run prisma:deploy
```

### 3. Build and Start

```bash
# Start production server
npm start
```

### 4. Process Manager (PM2)

```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start src/server.js --name safeapi-bridge

# Save process list
pm2 save

# Setup startup script
pm2 startup
```

### PM2 Ecosystem File

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'safeapi-bridge',
    script: 'src/server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    max_memory_restart: '500M',
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    merge_logs: true
  }]
};
```

```bash
pm2 start ecosystem.config.js --env production
```

---

## Docker Deployment

### Dockerfile

Create `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci --only=production

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY src ./src/

# Create logs directory
RUN mkdir -p logs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start server
CMD ["node", "src/server.js"]
```

### Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  safeapi-bridge:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:password@db:5432/safeapi
      - JWT_SECRET=${JWT_SECRET}
      - ADMIN_API_KEY=${ADMIN_API_KEY}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - GEMINI_API_KEY=${GEMINI_API_KEY}
    depends_on:
      - db
    restart: unless-stopped
    volumes:
      - ./logs:/app/logs

  db:
    image: postgres:15-alpine
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=safeapi
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  postgres_data:
```

### Build and Run

```bash
# Build image
docker build -t safeapi-bridge .

# Run with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f safeapi-bridge
```

---

## Cloud Platforms

### Render

1. Create a new Web Service
2. Connect your GitHub repository
3. Configure:
   - **Build Command**: `npm install && npm run prisma:generate`
   - **Start Command**: `npm start`
   - **Environment Variables**: Add all required vars

### Railway

1. Create new project from GitHub
2. Add PostgreSQL database
3. Configure environment variables
4. Deploy

### Heroku

```bash
# Login to Heroku
heroku login

# Create app
heroku create safeapi-bridge

# Add PostgreSQL
heroku addons:create heroku-postgresql:hobby-dev

# Set environment variables
heroku config:set NODE_ENV=production
heroku config:set JWT_SECRET=$(openssl rand -base64 64)

# Deploy
git push heroku main

# Run migrations
heroku run npm run prisma:deploy
```

### AWS (Elastic Beanstalk)

1. Install EB CLI: `pip install awsebcli`
2. Initialize: `eb init`
3. Create environment: `eb create production`
4. Set environment variables in AWS Console
5. Deploy: `eb deploy`

### Google Cloud Run

```bash
# Build and push image
gcloud builds submit --tag gcr.io/PROJECT_ID/safeapi-bridge

# Deploy
gcloud run deploy safeapi-bridge \
  --image gcr.io/PROJECT_ID/safeapi-bridge \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars "NODE_ENV=production,JWT_SECRET=..."
```

---

## Environment Configuration

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment | `production` |
| `PORT` | Server port | `3000` |
| `JWT_SECRET` | JWT signing secret | `64+ char random string` |
| `DATABASE_URL` | Database connection | `postgresql://...` |
| `ADMIN_API_KEY` | Admin access key | `32+ char random string` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LIGHT_MODE` | Minimal resource mode | `false` |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window | `3600000` (1 hour) |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests/window | `100` |
| `ALLOWED_ORIGINS` | CORS origins | `*` |
| `REQUEST_TIMEOUT_MS` | Request timeout | `30000` |
| `LOG_DIR` | Log directory | `./logs` |
| `REDIS_URL` | Redis URL for queue (optional) | - |
| `QUEUE_MAX_CONCURRENT` | Max concurrent queue jobs | `10` |
| `QUEUE_MAX_SIZE` | Max queue size | `1000` |
| `API_RETRY_ATTEMPTS` | Retry attempts for API calls | `3` |
| `API_RETRY_DELAY_MS` | Initial retry delay | `1000` |
| `RETRY_MAX_DELAY_MS` | Max delay for backoff | `30000` |

---

## Database Setup

### SQLite (Development)

```env
DATABASE_URL=file:./dev.db
```

### PostgreSQL (Production)

```env
DATABASE_URL=postgresql://user:password@host:5432/database?schema=public
```

### Migration Commands

```bash
# Create new migration (development)
npm run prisma:migrate

# Apply migrations (production)
npm run prisma:deploy

# Generate client
npm run prisma:generate

# View database (development)
npm run prisma:studio
```

---

## Security Checklist

### Before Production

- [ ] Generate strong `JWT_SECRET` (64+ characters)
- [ ] Generate strong `ADMIN_API_KEY`
- [ ] Configure `ALLOWED_ORIGINS` for CORS
- [ ] Set `NODE_ENV=production`
- [ ] Enable HTTPS (via reverse proxy or cloud platform)
- [ ] Configure rate limiting appropriately
- [ ] Set up IP whitelist/blacklist if needed
- [ ] Review and configure logging
- [ ] Set up monitoring and alerting
- [ ] Backup database regularly

### Reverse Proxy (Nginx)

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
    }
}
```

---

## Monitoring & Logging

### Log Files

- `logs/security-*.log` - Security events
- `logs/error-*.log` - Error logs
- `logs/combined-*.log` - All logs

### Health Check Endpoint

```bash
curl https://api.yourdomain.com/health
```

### Metrics to Monitor

- Request latency (p50, p95, p99)
- Error rate
- Database connection health
- Memory usage
- API quota usage per user

### Alerting Recommendations

- Database connection failures
- High error rate (>5%)
- Memory usage >80%
- Response time >5s

---

## Troubleshooting

### Common Issues

**Database connection errors:**

```bash
# Check DATABASE_URL format
# Ensure database is running and accessible
npm run prisma:generate
```

**JWT errors:**

```bash
# Ensure JWT_SECRET is set
# Check token expiration
```

**CORS errors:**

```bash
# Configure ALLOWED_ORIGINS correctly
# For mobile apps, set ALLOW_MOBILE_NO_ORIGIN=true
```

**Rate limiting:**

```bash
# Increase RATE_LIMIT_MAX_REQUESTS if needed
# Check if behind proxy (trust proxy setting)
```

### Debug Mode

```bash
# Enable debug logging
DEBUG=* npm run dev
```

### Check Logs

```bash
# View recent errors
tail -f logs/error-*.log

# Search for specific errors
grep "ERROR" logs/combined-*.log
```
