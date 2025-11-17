# BYOK (Bring Your Own Key) Integration Guide

This guide explains how to integrate with SafeAPI-Bridge using the BYOK Split Key method, which allows users to bring their own API keys while maintaining maximum security.

## Overview

SafeAPI-Bridge supports two authentication methods:

1. **Server Key Method**: API keys are stored on the server in `.env` files
2. **BYOK Split Key Method**: Users split their API keys and only store parts on the server

The BYOK method provides the highest level of security by ensuring that the complete API key never exists in a single location.

## Architecture

### Key Splitting Process

1. **User splits their API key** using the `/api/split-key/split` endpoint
2. **Server stores Part A** (encrypted with a unique secret)
3. **User receives Part B** (client-side component)
4. **Both parts combine temporarily** in server memory during API requests

### Security Benefits

- ✅ **Complete API key never stored** in database
- ✅ **Server breach doesn't expose** full API keys
- ✅ **Client part alone is useless** without server part
- ✅ **Each request reconstructs** key in memory only
- ✅ **Automatic key rotation** and versioning support

## Quick Start

### 1. Split Your API Key

```bash
curl -X POST 'https://your-domain.com/api/split-key/split' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -d '{
    "originalKey": "sk-your-openai-api-key-here",
    "apiProvider": "openai",
    "keyId": "my-production-key",
    "description": "Production OpenAI API key"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "keyId": "my-production-key",
    "apiProvider": "openai",
    "clientPart": "a1b2c3d4e5f6...",
    "algorithm": "AES-256-GCM",
    "createdAt": "2024-01-15T10:30:00Z",
    "instructions": {
      "method": "BYOK_SPLIT_KEY",
      "headers": {
        "Authorization": "Bearer <JWT_TOKEN>",
        "X-Partial-Key-Id": "my-production-key",
        "X-Partial-Key": "a1b2c3d4e5f6..."
      },
      "securityNote": "Store the client part (X-Partial-Key) securely in your application code. Never expose it in client-side code or logs."
    }
  }
}
```

### 2. Store Client Part Securely

Store the `clientPart` value in your application environment variables:

```bash
# .env file
OPENAI_CLIENT_PART=a1b2c3d4e5f6...
OPENAI_KEY_ID=my-production-key
```

### 3. Make API Requests with Split Key

```bash
curl -X POST 'https://your-domain.com/api/openai/proxy' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'X-Partial-Key-Id: my-production-key' \
  -H 'X-Partial-Key: a1b2c3d4e5f6...' \
  -d '{
    "endpoint": "/chat/completions",
    "model": "gpt-3.5-turbo",
    "messages": [
      {
        "role": "user",
        "content": "Hello, world!"
      }
    ]
  }'
```

## Integration Examples

### Node.js Integration

```javascript
const axios = require('axios');

class SafeAPIBridge {
  constructor(jwtToken, keyId, clientPart) {
    this.jwtToken = jwtToken;
    this.keyId = keyId;
    this.clientPart = clientPart;
    this.baseURL = 'https://your-domain.com';
  }

  async makeRequest(apiProvider, endpoint, data) {
    try {
      const response = await axios.post(
        `${this.baseURL}/api/${apiProvider}/proxy`,
        {
          endpoint,
          ...data
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.jwtToken}`,
            'X-Partial-Key-Id': this.keyId,
            'X-Partial-Key': this.clientPart
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('API request failed:', error.response?.data || error.message);
      throw error;
    }
  }

  async chatCompletion(messages, model = 'gpt-3.5-turbo') {
    return this.makeRequest('openai', '/chat/completions', {
      model,
      messages,
      max_tokens: 1000,
      temperature: 0.7
    });
  }
}

// Usage
const bridge = new SafeAPIBridge(
  process.env.JWT_TOKEN,
  process.env.OPENAI_KEY_ID,
  process.env.OPENAI_CLIENT_PART
);

// Make a chat request
bridge.chatCompletion([
  { role: 'user', content: 'Explain quantum computing' }
]).then(response => {
  console.log('Response:', response.choices[0].message.content);
});
```

### Python Integration

```python
import requests
import os
from typing import Dict, Any, List

class SafeAPIBridge:
    def __init__(self, jwt_token: str, key_id: str, client_part: str):
        self.jwt_token = jwt_token
        self.key_id = key_id
        self.client_part = client_part
        self.base_url = 'https://your-domain.com'

    def make_request(self, api_provider: str, endpoint: str, data: Dict[str, Any]) -> Dict[str, Any]:
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {self.jwt_token}',
            'X-Partial-Key-Id': self.key_id,
            'X-Partial-Key': self.client_part
        }

        response = requests.post(
            f'{self.base_url}/api/{api_provider}/proxy',
            json={
                'endpoint': endpoint,
                **data
            },
            headers=headers
        )

        response.raise_for_status()
        return response.json()

    def chat_completion(self, messages: List[Dict[str, str]], model: str = 'gpt-3.5-turbo') -> Dict[str, Any]:
        return self.make_request('openai', '/chat/completions', {
            'model': model,
            'messages': messages,
            'max_tokens': 1000,
            'temperature': 0.7
        })

# Usage
bridge = SafeAPIBridge(
    os.getenv('JWT_TOKEN'),
    os.getenv('OPENAI_KEY_ID'),
    os.getenv('OPENAI_CLIENT_PART')
)

response = bridge.chat_completion([
    {'role': 'user', 'content': 'Explain machine learning'}
])
print(response['choices'][0]['message']['content'])
```

## API Reference

### Split Key Management

#### Split API Key
```http
POST /api/split-key/split
```

**Headers:**
- `Authorization: Bearer <JWT_TOKEN>`

**Body:**
```json
{
  "originalKey": "sk-your-api-key",
  "apiProvider": "openai|gemini|claude|groq|mistral|zai|deepseek|perplexity|together|openrouter|fireworks|github|replicate|stability|fal|elevenlabs|brave|deepl|openmeteo",
  "keyId": "unique-key-identifier",
  "description": "Optional description"
}
```

#### List Split Keys
```http
GET /api/split-key
```

**Headers:**
- `Authorization: Bearer <JWT_TOKEN>`

#### Get Split Key Info
```http
GET /api/split-key/:keyId
```

**Headers:**
- `Authorization: Bearer <JWT_TOKEN>`

#### Deactivate Split Key
```http
DELETE /api/split-key/:keyId
```

**Headers:**
- `Authorization: Bearer <JWT_TOKEN>`

#### Validate Split Key
```http
POST /api/split-key/validate
```

**Headers:**
- `Authorization: Bearer <JWT_TOKEN>`
- `X-Partial-Key-Id: <KEY_ID>`
- `X-Partial-Key: <CLIENT_PART>`

### Proxy Requests

#### Make API Request with BYOK
```http
POST /api/:provider/proxy
```

**Headers:**
- `Authorization: Bearer <JWT_TOKEN>`
- `X-Partial-Key-Id: <KEY_ID>`
- `X-Partial-Key: <CLIENT_PART>`

**Body:**
```json
{
  "endpoint": "/chat/completions",
  "model": "gpt-3.5-turbo",
  "messages": [...]
}
```

## Security Best Practices

### 1. Secure Client Part Storage

```bash
# ✅ Good: Environment variables
OPENAI_CLIENT_PART=a1b2c3d4e5f6...

# ✅ Good: Secret management systems
# AWS Secrets Manager, HashiCorp Vault, etc.

# ❌ Bad: Hardcoded in source code
const clientPart = 'a1b2c3d4e5f6...';

# ❌ Bad: Committed to version control
# Never commit .env files with secrets
```

### 2. Key Rotation Strategy

1. **Create new split key:**
```bash
curl -X POST '/api/split-key/split' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -d '{
    "originalKey": "sk-new-api-key",
    "apiProvider": "openai",
    "keyId": "my-production-key-v2"
  }'
```

2. **Update your application** with new client part

3. **Test new key** works correctly

4. **Deactivate old key:**
```bash
curl -X DELETE '/api/split-key/my-production-key-v1' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'
```

### 3. Monitoring and Auditing

- Monitor key usage in analytics
- Set up alerts for unusual activity
- Regular audits of active split keys
- Implement key expiration policies

## Supported Providers

| Provider | Key Format | Example |
|----------|------------|---------|
| OpenAI | `sk-*` | `sk-proj-123...` |
| Gemini | AIzaSy* | `AIzaSyABC123...` |
| Claude | `sk-ant-*` | `sk-ant-api03-123...` |
| Groq | `gsk_*` | `gsk_123...` |
| Mistral | Variable | Custom format |

## Troubleshooting

### Common Issues

#### 401 Unauthorized - Split Key Authentication Failed
**Cause:** Invalid or mismatched split key parts
**Solution:** Verify key ID and client part are correct

```bash
# Validate your split key
curl -X POST '/api/split-key/validate' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'X-Partial-Key-Id: YOUR_KEY_ID' \
  -H 'X-Partial-Key: YOUR_CLIENT_PART'
```

#### 403 Forbidden - Access Denied
**Cause:** Trying to access another user's split key
**Solution:** Use the JWT token of the key creator

#### 429 Too Many Requests
**Cause:** Rate limiting on split key operations
**Solution:** Implement exponential backoff and reduce request frequency

### Debug Mode

For development, you can enable additional logging:

```bash
# Set environment variable
export DEBUG=safeapi-bridge:*

# Or add to your .env file
DEBUG=safeapi-bridge:*
```

## Migration from Server Key to BYOK

### Step 1: Keep Server Key Running
Don't disable server key method immediately. Run both methods in parallel.

### Step 2: Create Split Keys
Split your existing API keys using the split endpoint.

### Step 3: Update Applications
Update your applications to use split key headers.

### Step 4: Test Thoroughly
Ensure all functionality works with BYOK method.

### Step 5: Decommission Server Keys
Once confident in BYOK setup, you can remove API keys from server environment.

## Support

For questions or issues with BYOK integration:

1. Check this guide for common solutions
2. Review the API documentation
3. Check server logs for detailed error messages
4. Contact support with key ID (never with actual API keys)

---

**Important:** Never share your JWT tokens or split key components. Always use secure communication channels when discussing key management.
