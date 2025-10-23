#!/usr/bin/env node
/*
 Reads the mobile app .env to get REACT_APP_SAFEAPI_BASE
 and performs a smoke test against SafeAPI-Bridge:
  - GET /health
  - POST /auth/token
  - GET /auth/verify
  - POST /api/gemini/proxy (simple prompt)

 Usage:
   node scripts/remote/test-from-mobile-env.js \
     --env "C:\\Users\\mtg\\Desktop\\legalease_mobile_v0.4\\.env"
*/

const fs = require('fs');
const path = require('path');
const axios = require('axios');

function arg(name, fallback) {
  const key = `--${name}`;
  const idx = process.argv.indexOf(key);
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

async function main() {
  const envPath = arg('env', 'C:/Users/mtg/Desktop/legalease_mobile_v0.4/.env');
  if (!fs.existsSync(envPath)) {
    console.error(`.env not found at: ${envPath}`);
    process.exit(1);
  }

  const envText = fs.readFileSync(envPath, 'utf8');
  const match = envText.match(/^REACT_APP_SAFEAPI_BASE\s*=\s*(.+)$/m);
  if (!match) {
    console.error('REACT_APP_SAFEAPI_BASE not found in .env');
    process.exit(1);
  }
  const BASE_URL = match[1].trim();
  console.log('Base from mobile .env:', BASE_URL);

  // 1) Health
  const health = await axios.get(`${BASE_URL}/health`, { timeout: 20000 });
  console.log('Health:', health.status, health.data.summary);

  // 2) Token
  const userId = `mobile-smoke-${Date.now()}`;
  const tokenResp = await axios.post(`${BASE_URL}/auth/token`, {
    userId,
    appId: 'mobile-app'
  }, { headers: { 'Content-Type': 'application/json' }, timeout: 20000 });
  const token = tokenResp.data.token;
  console.log('Token len:', token?.length);

  // 3) Verify
  const ver = await axios.get(`${BASE_URL}/auth/verify`, { headers: { Authorization: `Bearer ${token}` }, timeout: 20000 });
  console.log('Verify valid:', ver.data?.valid === true);

  // 4) Gemini
  const proxyResp = await axios.post(`${BASE_URL}/api/gemini/proxy`, {
    endpoint: '/models/gemini-2.5-flash:generateContent',
    contents: [{ parts: [{ text: 'Mobil smoke test: merhaba!' }] }]
  }, { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, timeout: 30000, validateStatus: s => s < 600 });

  console.log('Gemini status:', proxyResp.status);
  const data = proxyResp.data;
  let summary = null;
  try {
    summary = data?.candidates?.[0]?.content?.parts?.[0]?.text || data?.output_text || null;
  } catch (_) {}
  console.log('Gemini summary:', summary ? (summary.slice(0, 140) + (summary.length > 140 ? '…' : '')) : JSON.stringify(data).slice(0, 140));
}

main().catch(err => {
  if (err.response) {
    console.error('HTTP', err.response.status);
    console.error(err.response.data);
  } else {
    console.error(err.message || err);
  }
  process.exit(1);
});

