# 🚀 Deployment Guide - Render.com

Complete guide to deploy SafeAPI-Bridge on Render.com for production use with your Play Store mobile app.

## 📋 Prerequisites

1. ✅ GitHub account with SafeAPI-Bridge repository
2. ✅ Render.com account (free tier available)
3. ✅ At least one AI API key (OpenAI, Gemini, Claude, etc.)

---

## 🎯 Quick Deploy (Recommended)

### Option 1: One-Click Deploy via Blueprint

1. **Push to GitHub** (if not done already)
```bash
git add .
git commit -m "feat: Production-ready with PostgreSQL, Redis, Analytics"
git push origin main
```

2. **Deploy on Render**
- Go to https://render.com/deploy
- Click "New Blueprint Instance"
- Connect your GitHub repository
- Select the repository: `SafeAPI-Bridge`
- Render will automatically detect `render.yaml`
- Click "Apply"

3. **Configure Environment Variables**
After deployment, go to your service dashboard and add:
- `OPENAI_API_KEY` (if using OpenAI)
- `GEMINI_API_KEY` (if using Gemini)
- `CLAUDE_API_KEY` (if using Claude)
- Other API keys as needed

4. **Done!** 🎉
Your server will be available at: `https://safeapi-bridge.onrender.com`

---

## 🔧 Manual Deploy

### Step 1: Create PostgreSQL Database

1. Go to https://dashboard.render.com
2. Click "New" → "PostgreSQL"
3. Configure:
   - **Name**: `safeapi-db`
   - **Database**: `safeapi_bridge`
   - **User**: `safeapi_user`
   - **Region**: Choose closest to your users
   - **Plan**: Starter (Free)
4. Click "Create Database"
5. **Copy the Internal Database URL** (starts with `postgresql://`)

### Step 2: Create Web Service

1. Click "New" → "Web Service"
2. Connect your GitHub repository
3. Configure:
   - **Name**: `safeapi-bridge`
   - **Region**: Same as database
   - **Branch**: `main`
   - **Build Command**: `npm install && npx prisma generate && npx prisma migrate deploy`
   - **Start Command**: `npm start`
   - **Plan**: Starter (Free)

### Step 3: Environment Variables

Add the following environment variables:

**Required:**
```env
NODE_ENV=production
DATABASE_URL=<YOUR_POSTGRES_URL_FROM_STEP_1>
JWT_SECRET=<GENERATE_A_STRONG_RANDOM_STRING>
ADMIN_API_KEY=<GENERATE_A_STRONG_RANDOM_STRING>
```

**AI API Keys (at least one):**
```env
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...
CLAUDE_API_KEY=sk-ant-...
GROQ_API_KEY=...
MISTRAL_API_KEY=...
```

**Optional:**
```env
REDIS_URL=<IF_YOU_HAVE_REDIS>
ALLOWED_ORIGINS=https://yourapp.com,https://anotherapp.com
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=3600000
```

### Step 4: Deploy

Click "Create Web Service" - Render will:
1. Clone your repository
2. Install dependencies
3. Run Prisma migrations
4. Start the server

---

## 🔗 Post-Deployment Setup

### 1. Test Your Deployment

```bash
# Health check
curl https://your-app.onrender.com/health

# Get JWT token
curl -X POST https://your-app.onrender.com/auth/token \
  -H "Content-Type: application/json" \
  -d '{"userId":"test123","appId":"mobile-app"}'

# Test Gemini (with token from previous step)
curl -X POST https://your-app.onrender.com/api/gemini/proxy \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "endpoint": "/models/gemini-2.5-flash:generateContent",
    "contents": [{"parts": [{"text": "Hello!"}]}]
  }'
```

### 2. Update Your Android App

Replace localhost with your Render URL:

```kotlin
// Before
private const val BASE_URL = "http://localhost:3000"

// After
private const val BASE_URL = "https://your-app.onrender.com"
```

### 3. Configure CORS

Update `ALLOWED_ORIGINS` to your actual domains:
```env
ALLOWED_ORIGINS=https://play.google.com,https://yourapp.com
```

### 4. Save Admin Key

The `ADMIN_API_KEY` is required for admin endpoints. Save it securely:
```bash
# Access admin endpoints
curl https://your-app.onrender.com/admin/users \
  -H "X-Admin-Key: YOUR_ADMIN_API_KEY"
```

---

## 📊 Database Management

### View Database

Access Prisma Studio locally (connects to production DB):

```bash
# Set DATABASE_URL to your Render PostgreSQL URL
export DATABASE_URL="postgresql://..."

# Run Prisma Studio
npm run prisma:studio
```

### Run Migrations

If you modify the schema later:

```bash
# Local development
npm run prisma:migrate

# This will auto-deploy on next Render push
git push origin main
```

---

## 🔴 Optional: Add Redis

For better caching performance:

1. Go to Render Dashboard
2. Click "New" → "Redis"
3. Configure:
   - **Name**: `safeapi-redis`
   - **Plan**: Starter (Free for 30 days)
4. Copy the **Internal Redis URL**
5. Add to your web service env vars:
   ```env
   REDIS_URL=redis://...
   ```
6. Redeploy the service

---

## 🎛️ Monitoring & Analytics

### View Logs

```bash
# In Render dashboard
Services → safeapi-bridge → Logs
```

### Analytics Dashboard

Access analytics via API:
```bash
curl https://your-app.onrender.com/analytics/overview \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Check Usage

```bash
# My stats
curl https://your-app.onrender.com/analytics/my-stats \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Cost breakdown
curl https://your-app.onrender.com/analytics/costs \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## ⚠️ Important Notes

### Free Tier Limitations

**Render Free Tier:**
- ✅ 750 hours/month (enough for 24/7)
- ⚠️ Spins down after 15 minutes of inactivity (first request takes ~30s)
- ⚠️ 100GB bandwidth/month

**PostgreSQL Free Tier:**
- ✅ 1GB storage
- ✅ 90 days free (then $7/month)

**Redis Free Tier:**
- ✅ 25MB storage
- ⚠️ 30 days free (then $5/month)

### Performance Tips

1. **Prevent Spin Down**: Use a service like UptimeRobot to ping your server every 10 minutes
2. **Enable Caching**: Use Redis for better performance
3. **Monitor Usage**: Check analytics regularly to avoid quota surprises

### Security Best Practices

1. ✅ **Always use HTTPS** (Render provides free SSL)
2. ✅ **Rotate JWT_SECRET** periodically
3. ✅ **Set specific ALLOWED_ORIGINS** (not *)
4. ✅ **Monitor error webhooks** for suspicious activity
5. ✅ **Backup database** regularly (Render has daily backups)

---

## 🐛 Troubleshooting

### Build Fails

**Error**: `Prisma migration failed`
**Solution**: Make sure DATABASE_URL is set correctly

**Error**: `Module not found`
**Solution**: Clear build cache in Render settings and redeploy

### Server Won't Start

**Check logs**: Services → Your Service → Logs

**Common issues**:
- Missing `DATABASE_URL`
- Invalid `JWT_SECRET`
- Port conflicts (use `process.env.PORT`)

### Database Connection Issues

**Error**: `Can't reach database`
**Solution**:
1. Use **Internal Database URL** (not external)
2. Check database is in same region as web service

### API Returns 503

**Check**: Is the AI API key valid?
```bash
curl https://your-app.onrender.com/health
```

Look for which APIs are configured.

---

## 📱 Connect to Play Store App

1. **Update Base URL** in your Android app
2. **Get Token** via `/auth/token` endpoint
3. **Store Token** in SharedPreferences/DataStore
4. **Make API Calls** with token in Authorization header

### Example Android Integration

```kotlin
// RetrofitInstance.kt
object RetrofitInstance {
    private const val BASE_URL = "https://safeapi-bridge.onrender.com/"

    val api: SafeAPIService by lazy {
        Retrofit.Builder()
            .baseUrl(BASE_URL)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(SafeAPIService::class.java)
    }
}
```

---

## 🎉 Success!

Your SafeAPI-Bridge is now:
- ✅ Deployed to production
- ✅ Connected to PostgreSQL
- ✅ Secured with JWT
- ✅ Tracking usage and analytics
- ✅ Ready for your Play Store app!

**Next Steps**:
1. Test with your mobile app
2. Monitor usage in analytics
3. Set up webhooks for notifications
4. Consider upgrading to paid tier for production scale

---

## 📚 Additional Resources

- [Render.com Docs](https://render.com/docs)
- [Prisma Docs](https://www.prisma.io/docs)
- [GitHub Repository](https://github.com/mtgsoftworks/SafeAPI-Bridge)

---

**Need Help?** Open an issue on GitHub or check the troubleshooting section above.
