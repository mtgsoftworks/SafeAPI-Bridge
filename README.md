<div align="center">

# 🌉 SafeAPI-Bridge

**Secure API Proxy Server for Protecting AI API Keys**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-v18+-green.svg)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-4.x-blue.svg)](https://expressjs.com/)

*Never expose your API keys in mobile or web applications again.*

[Features](#-features) • [Quick Start](#-quick-start) • [API Usage](#-api-usage) • [Security](#-security) • [Documentation](#-documentation)

</div>

---

## 🎯 Why SafeAPI-Bridge?

SafeAPI-Bridge is a secure proxy server that sits between your client applications (Android, iOS, Web) and AI service providers (OpenAI, Google Gemini, Anthropic Claude, etc.). It protects your expensive API keys from being extracted from client-side code while providing a seamless API experience.

### The Problem
- 🚨 API keys in mobile/web apps can be easily extracted
- 💸 Exposed keys lead to unauthorized usage and unexpected bills
- 🔓 Client-side code is always vulnerable to reverse engineering

### The Solution
- ✅ API keys stored securely on your server
- 🔐 JWT-based authentication for clients
- 🛡️ Rate limiting and request validation
- 📊 Centralized logging and monitoring

---

## ✨ Features

<table>
  <tr>
    <td>🔐 <b>JWT Authentication</b></td>
    <td>Token-based secure client authentication</td>
  </tr>
  <tr>
    <td>🤖 <b>Multi-API Support</b></td>
    <td>OpenAI, Gemini, Claude, Groq, Mistral</td>
  </tr>
  <tr>
    <td>🛡️ <b>Security First</b></td>
    <td>Helmet, CORS, Rate Limiting, Input Validation</td>
  </tr>
  <tr>
    <td>📊 <b>Request Logging</b></td>
    <td>Detailed logging with Morgan</td>
  </tr>
  <tr>
    <td>✅ <b>Endpoint Whitelist</b></td>
    <td>Only allowed endpoints accessible</td>
  </tr>
  <tr>
    <td>🔑 <b>Key Protection</b></td>
    <td>API keys never exposed to clients</td>
  </tr>
  <tr>
    <td>⚡ <b>Easy Setup</b></td>
    <td>Simple configuration and deployment</td>
  </tr>
  <tr>
    <td>🚀 <b>Production Ready</b></td>
    <td>Error handling, graceful shutdown</td>
  </tr>
</table>

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ installed
- API keys for your preferred AI services

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/safeapi-bridge.git
cd safeapi-bridge
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment**
```bash
cp .env.example .env
```

Edit `.env` file with your API keys:
```env
# Server
PORT=3000
NODE_ENV=production

# JWT Secret (use a strong random string)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# AI API Keys
OPENAI_API_KEY=sk-your-openai-key
GEMINI_API_KEY=your-gemini-key
CLAUDE_API_KEY=sk-ant-your-claude-key

# Rate Limiting
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=3600000

# CORS (comma-separated origins)
ALLOWED_ORIGINS=https://yourapp.com,https://anotherapp.com
```

4. **Start the server**
```bash
# Development
npm run dev

# Production
npm start
```

Server will start on `http://localhost:3000` 🎉

Security notes:
- Analytics endpoints (`/analytics/overview`, `/analytics/costs`, `/analytics/errors`) require `X-Admin-Key` header equal to your `ADMIN_API_KEY`.
- Do not expose `ADMIN_API_KEY` in client apps. Keep it server-side only.
- IP rules, rate limiting, and endpoint whitelisting are enabled by default.

---

## 📖 API Usage

### 1️⃣ Get Authentication Token

First, obtain a JWT token for your client:

```bash
POST http://localhost:3000/auth/token
Content-Type: application/json

{
  "userId": "user123",
  "appId": "your-android-app"
}
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": "7 days",
  "tokenType": "Bearer"
}
```

### 2️⃣ Make API Requests

Use the token to proxy requests to AI services:

#### OpenAI (ChatGPT)
```bash
POST http://localhost:3000/api/openai/proxy
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "endpoint": "/chat/completions",
  "model": "gpt-4",
  "messages": [
    {"role": "user", "content": "Hello, how are you?"}
  ]
}
```

#### Google Gemini
```bash
POST http://localhost:3000/api/gemini/proxy
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "endpoint": "/models/gemini-2.5-flash:generateContent",
  "contents": [
    {"parts": [{"text": "What is AI?"}]}
  ]
}
```

#### Streaming (OpenAI/Claude)
- To receive server-sent events (SSE) streams, set `stream: true` in body and include `Accept: text/event-stream` header.
- Example (OpenAI):
```bash
POST http://localhost:3000/api/openai/proxy
Authorization: Bearer YOUR_JWT_TOKEN
Accept: text/event-stream
Content-Type: application/json

{
  "endpoint": "/chat/completions",
  "model": "gpt-4o-mini",
  "stream": true,
  "messages": [{"role":"user","content":"Hello!"}]
}
```

#### Streaming (Claude)
- SSE için `Accept: text/event-stream` ve body’de `stream: true` gönderin.
```bash
POST http://localhost:3000/api/claude/proxy
Authorization: Bearer YOUR_JWT_TOKEN
Accept: text/event-stream
Content-Type: application/json

{
  "endpoint": "/messages",
  "stream": true,
  "max_tokens": 512,
  "model": "claude-3-5-sonnet-latest",
  "messages": [
    {"role": "user", "content": "Merhaba!"}
  ]
}
```

#### Anthropic Claude
```bash
POST http://localhost:3000/api/claude/proxy
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "endpoint": "/messages",
  "model": "claude-3-sonnet-20240229",
  "max_tokens": 1024,
  "messages": [
    {"role": "user", "content": "Explain quantum computing"}
  ]
}
```

## 🔐 Admin-Only API
- Bu uç noktalar geçerli `X-Admin-Key` (değeri `ADMIN_API_KEY`) header’ı gerektirir.
- Bu anahtarı asla istemci (mobil/web) uygulamalara gömmeyin; yalnızca güvenli sunucu tarafı kullanımlarda gönderin.

Korumalı uçlar:
- `GET /analytics/overview`
- `GET /analytics/costs`
- `GET /analytics/errors`
- Tüm `/admin/*` uçları (kullanıcı/IP kural/webhook yönetimi)

Örnek:
```bash
curl -H "Authorization: Bearer <JWT>" \
     -H "X-Admin-Key: $ADMIN_API_KEY" \
     https://your-app/analytics/overview
```

### 3️⃣ Health Check

```bash
GET http://localhost:3000/health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-10-23T12:00:00.000Z",
  "apis": {
    "openai": {"configured": true},
    "gemini": {"configured": true},
    "claude": {"configured": true}
  }
}
```

---

## 📱 Client Integration

### Android (Kotlin + Retrofit)

```kotlin
interface SafeAPIService {
    @POST("auth/token")
    suspend fun getToken(@Body request: TokenRequest): TokenResponse

    @POST("api/gemini/proxy")
    suspend fun chat(
        @Header("Authorization") token: String,
        @Body request: ChatRequest
    ): ChatResponse
}

// Usage
class AIRepository(private val api: SafeAPIService) {
    suspend fun chat(message: String): String {
        // Get token (cache it for reuse)
        val tokenResponse = api.getToken(
            TokenRequest(userId = "user123", appId = "myapp")
        )

        // Make AI request
        val response = api.chat(
            token = "Bearer ${tokenResponse.token}",
            request = ChatRequest(
                endpoint = "/models/gemini-2.5-flash:generateContent",
                contents = listOf(
                    Content(parts = listOf(Part(text = message)))
                )
            )
        )

        return response.candidates[0].content.parts[0].text
    }
}
```

### iOS (Swift + Alamofire)

```swift
class SafeAPIClient {
    let baseURL = "http://your-server.com"

    func getToken(completion: @escaping (String?) -> Void) {
        AF.request("\(baseURL)/auth/token", method: .post,
                   parameters: ["userId": "user123", "appId": "myapp"],
                   encoding: JSONEncoding.default)
            .responseDecodable(of: TokenResponse.self) { response in
                completion(response.value?.token)
            }
    }

    func chat(message: String, token: String, completion: @escaping (String?) -> Void) {
        let headers: HTTPHeaders = ["Authorization": "Bearer \(token)"]
        let params: [String: Any] = [
            "endpoint": "/models/gemini-2.5-flash:generateContent",
            "contents": [["parts": [["text": message]]]]
        ]

        AF.request("\(baseURL)/api/gemini/proxy", method: .post,
                   parameters: params, encoding: JSONEncoding.default,
                   headers: headers)
            .responseDecodable(of: ChatResponse.self) { response in
                completion(response.value?.candidates.first?.content.parts.first?.text)
            }
    }
}
```

---

## 🔒 Security

### Best Practices

✅ **Production Checklist:**
- [ ] Change `JWT_SECRET` to a strong random string (min 32 characters)
- [ ] Use HTTPS (SSL/TLS certificate)
- [ ] Set `ALLOWED_ORIGINS` to your actual domains
- [ ] Adjust rate limits based on your needs
- [ ] Enable firewall rules
- [ ] Keep dependencies updated (`npm audit`)
- [ ] Use environment-specific `.env` files
- [ ] Never commit `.env` to version control

### Security Features

| Feature | Description |
|---------|-------------|
| **JWT Authentication** | 7-day expiring tokens with signature verification |
| **Rate Limiting** | 100 requests/hour per IP (configurable) |
| **CORS Protection** | Whitelist-based origin validation |
| **Helmet.js** | Sets secure HTTP headers |
| **Input Validation** | Request sanitization and validation |
| **Endpoint Whitelist** | Only pre-approved endpoints accessible |
| **Error Handling** | No sensitive data in error responses |

---

## 📂 Project Structure

```
safeapi-bridge/
├── src/
│   ├── config/
│   │   ├── env.js              # Environment configuration
│   │   └── apis.js             # API configs & whitelists
│   ├── middleware/
│   │   ├── auth.js             # JWT authentication
│   │   ├── rateLimiter.js      # Rate limiting
│   │   ├── logger.js           # Request logging
│   │   └── corsConfig.js       # CORS configuration
│   ├── routes/
│   │   ├── auth.js             # Authentication routes
│   │   └── proxy.js            # Proxy routes
│   ├── controllers/
│   │   └── proxy.js            # Proxy business logic
│   ├── utils/
│   │   ├── validator.js        # Input validation
│   │   └── errorHandler.js     # Error handling
│   └── server.js               # Express app entry point
├── .env                         # Environment variables (gitignored)
├── .env.example                 # Example env file
├── .gitignore
├── package.json
├── LICENSE
└── README.md
```

---

## 🛠️ API Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/` | GET | ❌ | Service information |
| `/health` | GET | ❌ | Health check & API status |
| `/auth/token` | POST | ❌ | Generate JWT token |
| `/auth/verify` | GET | ✅ | Verify token validity |
| `/api/:api/proxy` | POST | ✅ | Proxy to AI API |
| `/api/:api/endpoints` | GET | ✅ | Get allowed endpoints |

**Supported APIs:** `openai`, `gemini`, `claude`, `groq`, `mistral`

---

## 🤖 Supported AI Services

| Service | Latest Models (2025) | Status |
|---------|--------|--------|
| **OpenAI** | GPT-4, GPT-4 Turbo, GPT-3.5 Turbo, Embeddings | ✅ Supported |
| **Google Gemini** | Gemini 2.5 Pro/Flash/Lite, 2.0 Flash/Lite, Embeddings | ✅ Supported |
| **Anthropic Claude** | Claude Opus 4.1, Sonnet 4.5, Haiku 4.5 | ✅ Supported |
| **Groq** | Llama 3.3 70B, Llama 3.1 405B, Mixtral 8x7B | ✅ Supported |
| **Mistral AI** | Mistral Medium 3, Codestral 2, Small 3.1, Magistral | ✅ Supported |

### Model Details

**Google Gemini (2025)**
- `gemini-2.5-flash` - Latest, fast and efficient
- `gemini-2.5-pro` - Most capable, best for complex tasks
- `gemini-2.5-flash-lite` - Lightweight version
- `gemini-2.0-flash` - Previous generation
- `text-embedding-004` - Latest embeddings

**Anthropic Claude 4 Series (2025)**
- `claude-opus-4-1` - Most powerful, 74.5% on SWE-bench ($15/$75 per M tokens)
- `claude-sonnet-4-5` - Balanced performance ($3/$15 per M tokens)
- `claude-haiku-4-5` - Fast and cost-effective ($1/$5 per M tokens)

**Groq (2025)**
- `llama-3.3-70b-versatile` - Latest Meta model, 128K context
- `llama-3.1-405b-reasoning` - Largest open model
- `mixtral-8x7b-32768` - Fast Mixtral model

**Mistral AI (2025)**
- `mistral-medium-3` - Best for coding and STEM
- `codestral-2` - Specialized code generation
- `mistral-small-3.1` - Multimodal, 128K context
- `magistral` - Multi-step reasoning

---

## 🐛 Troubleshooting

### Server won't start
- Check if port 3000 is available: `netstat -ano | findstr :3000`
- Ensure `.env` file exists
- Run `npm install` to install dependencies

### API requests failing
- Verify JWT token is valid: `GET /auth/verify`
- Check Authorization header format: `Bearer YOUR_TOKEN`
- Ensure API keys are set in `.env`
- Verify endpoint is in whitelist: `GET /api/:api/endpoints`

### CORS errors
- Add your client domain to `ALLOWED_ORIGINS` in `.env`
- For mobile apps, use `*` (not recommended for production)

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📬 Support

- 🐛 [Report a Bug](https://github.com/yourusername/safeapi-bridge/issues)
- 💡 [Request a Feature](https://github.com/yourusername/safeapi-bridge/issues)
- 💬 [Ask a Question](https://github.com/yourusername/safeapi-bridge/discussions)

---

## 🙏 Acknowledgments

- Built with [Express.js](https://expressjs.com/)
- Authentication with [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken)
- HTTP client with [axios](https://axios-http.com/)

---

<div align="center">

**Made with ❤️ for developers who care about security**

⭐ Star this repo if you find it helpful!

</div>
