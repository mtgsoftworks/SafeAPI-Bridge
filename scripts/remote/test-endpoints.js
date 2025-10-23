#!/usr/bin/env node
/*
 Queries allowed endpoints for supported APIs using the live service.
 It also verifies auth by obtaining a token first.

 Usage:
   node scripts/remote/test-endpoints.js --base https://your-app.onrender.com [--user cli-e2e]
*/

const axios = require('axios');

function arg(name, fallback) {
  const key = `--${name}`;
  const idx = process.argv.indexOf(key);
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

const BASE_URL = arg('base', process.env.BASE_URL || '').trim();
const USER_ID = arg('user', process.env.TEST_USER_ID || `cli-e2e-${Date.now()}`);

if (!BASE_URL) {
  console.error('Missing --base (BASE_URL). Example: --base https://safeapi-bridge-3zo9.onrender.com');
  process.exit(1);
}

async function main() {
  console.log(`Base: ${BASE_URL}`);
  console.log('1) Getting token...');
  const tokenResp = await axios.post(
    `${BASE_URL}/auth/token`,
    { userId: USER_ID, appId: 'cli' },
    { headers: { 'Content-Type': 'application/json' } }
  );
  const token = tokenResp.data.token;
  console.log(`Token length: ${token?.length}`);

  const headers = { Authorization: `Bearer ${token}` };
  const apis = ['openai', 'gemini', 'claude', 'groq', 'mistral'];

  console.log('2) Fetching allowed endpoints for each API...');
  for (const api of apis) {
    try {
      const r = await axios.get(`${BASE_URL}/api/${api}/endpoints`, { headers });
      console.log(`- ${api.toUpperCase()}: configured=${r.data.configured} count=${r.data.allowedEndpoints?.length || 0}`);
    } catch (e) {
      if (e.response) {
        console.log(`- ${api.toUpperCase()}: HTTP ${e.response.status}`);
      } else {
        console.log(`- ${api.toUpperCase()}: error ${e.message}`);
      }
    }
  }

  console.log('3) Verifying token...');
  const ver = await axios.get(`${BASE_URL}/auth/verify`, { headers });
  console.log(`Verify: valid=${!!ver.data?.valid}`);
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

