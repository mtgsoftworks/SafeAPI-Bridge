#!/usr/bin/env node
/*
 Simple remote test runner:
 - Gets a JWT from /auth/token
 - Calls Gemini proxy at /api/gemini/proxy

 Usage:
   node scripts/remote/test-gemini.js --base https://your-app.onrender.com \
     --user tester-auto --message "Merhaba! Nasılsın?"

 Env vars (optional):
   BASE_URL, TEST_USER_ID, TEST_MESSAGE
*/

const axios = require('axios');

function arg(name, fallback) {
  const key = `--${name}`;
  const idx = process.argv.indexOf(key);
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

const BASE_URL = arg('base', process.env.BASE_URL || '').trim();
const USER_ID = arg('user', process.env.TEST_USER_ID || `tester-auto-${Date.now()}`);
const MESSAGE = arg('message', process.env.TEST_MESSAGE || 'Merhaba! Nasılsın?');

if (!BASE_URL) {
  console.error('Missing --base (BASE_URL). Example: --base https://safeapi-bridge-3zo9.onrender.com');
  process.exit(1);
}

async function main() {
  console.log(`Base: ${BASE_URL}`);
  console.log('1) Requesting token...');

  const tokenResp = await axios.post(`${BASE_URL}/auth/token`, {
    userId: USER_ID,
    appId: 'mobile-app'
  }, { headers: { 'Content-Type': 'application/json' } });

  if (!tokenResp.data || !tokenResp.data.token) {
    console.error('Token response missing token field:', tokenResp.data);
    process.exit(2);
  }

  const token = tokenResp.data.token;
  console.log(`✔ Token received (len=${token.length}) for userId=${USER_ID}`);

  console.log('2) Calling Gemini proxy...');
  const proxyResp = await axios.post(`${BASE_URL}/api/gemini/proxy`, {
    endpoint: '/models/gemini-2.5-flash:generateContent',
    contents: [
      { parts: [{ text: MESSAGE }] }
    ]
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    validateStatus: s => s < 600
  });

  console.log(`✔ Proxy status: ${proxyResp.status}`);
  // Print a concise summary
  const data = proxyResp.data;
  if (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text) {
    console.log('Response (first text part):');
    console.log(data.candidates[0].content.parts[0].text);
  } else {
    console.log('Response JSON:');
    console.log(typeof data === 'string' ? data : JSON.stringify(data));
  }
}

main().catch(err => {
  if (err.response) {
    console.error(`HTTP ${err.response.status}`);
    console.error(err.response.data);
  } else {
    console.error(err.message || err);
  }
  process.exit(1);
});
