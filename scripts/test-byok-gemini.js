/* eslint-disable no-console */

/**
 * BYOK Gemini test script for SafeAPI-Bridge
 *
 * Steps:
 * 1) Get JWT via /auth/token
 * 2) Split Gemini API key via /api/split-key/split (NO keyId in body)
 * 3) Call /api/gemini/proxy using BYOK headers (non-streaming)
 *
 * Before running:
 *   - SafeAPI-Bridge server must be running (e.g. PORT=3003 npm run dev)
 *   - Set GEMINI_TEST_KEY env to a real Gemini API key:
 *       PowerShell:  $env:GEMINI_TEST_KEY="AIzaSy....."
 *       Bash:        export GEMINI_TEST_KEY="AIzaSy....."
 */

const axios = require('axios');

const BASE_URL = process.env.SAFEAPI_BASE_URL || 'http://localhost:3003';
const ORIGINAL_KEY = process.env.GEMINI_TEST_KEY;

if (!ORIGINAL_KEY) {
  console.error('ERROR: GEMINI_TEST_KEY environment variable is not set.');
  console.error('Example (PowerShell):  $env:GEMINI_TEST_KEY="AIzaSy..."');
  console.error('Example (bash):        export GEMINI_TEST_KEY="AIzaSy..."');
  process.exit(1);
}

async function main() {
  try {
    console.log('=== SafeAPI-Bridge BYOK Gemini Test ===');
    console.log(`BASE_URL: ${BASE_URL}`);
    console.log('');

    // 1) Get JWT token
    console.log('1) POST /auth/token -> getting JWT...');
    const authRes = await axios.post(`${BASE_URL}/auth/token`, {
      userId: 'byok-gemini-test-user',
      appId: 'byok-gemini-test-app'
    });

    const token = authRes.data.token;
    if (!token) {
      console.error('Failed to obtain JWT token. Response:', authRes.data);
      process.exit(1);
    }

    console.log('JWT token received.');
    console.log('Response (short):', {
      success: authRes.data.success,
      user: authRes.data.user
    });
    console.log('');

    // 2) Split Gemini API key (no keyId -> server will auto-generate one)
    console.log('2) POST /api/split-key/split -> splitting Gemini key (auto keyId)...');

    const splitRes = await axios.post(
      `${BASE_URL}/api/split-key/split`,
      {
        originalKey: ORIGINAL_KEY,
        apiProvider: 'gemini',
        description: 'BYOK Gemini test key (auto keyId)'
      },
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (!splitRes.data || !splitRes.data.data) {
      console.error('Split key response not in expected format:', splitRes.data);
      process.exit(1);
    }

    const { keyId, clientPart } = splitRes.data.data;

    console.log('Split key created.');
    console.log('keyId (auto-generated):', keyId);
    console.log('clientPart (first 32 chars):', clientPart.slice(0, 32) + '...');
    console.log('');

    // 3) Call Gemini via proxy using BYOK (non-streaming)
    console.log('3) POST /api/gemini/proxy -> calling Gemini via BYOK (no stream)...');

    const proxyRes = await axios.post(
      `${BASE_URL}/api/gemini/proxy`,
      {
        endpoint: '/models/gemini-2.5-flash:generateContent',
        contents: [
          {
            parts: [
              {
                text: 'Bu cevap SafeAPI-Bridge uzerinden BYOK (split key) ile gelen bir Gemini test cevabidir. Kisaca kendini tanit.'
              }
            ]
          }
        ]
        // stream: true is NOT sent -> streaming disabled
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Partial-Key-Id': keyId,
          'X-Partial-Key': clientPart
        }
      }
    );

    console.log('Gemini proxy request completed.');
    console.log('HTTP status:', proxyRes.status);

    // Try to extract and print the model text for convenience
    const top = proxyRes.data || {};
    const firstCandidate = Array.isArray(top.candidates) ? top.candidates[0] : null;
    const parts = firstCandidate && firstCandidate.content && Array.isArray(firstCandidate.content.parts)
      ? firstCandidate.content.parts
      : [];
    const text = parts
      .map(p => typeof p.text === 'string' ? p.text : '')
      .join('\n')
      .trim();

    console.log('--- Model raw response (top level) ---');
    console.dir(top, { depth: 1 });
    console.log('--------------------------------------');

    if (text) {
      console.log('\n=== Model answer (extracted text) ===');
      console.log(text);
      console.log('=====================================\n');
    } else {
      console.log('\n(No text field could be extracted from candidates; see raw response above.)\n');
    }

    console.log('Test finished successfully.');
  } catch (error) {
    console.error('\nTEST ERROR:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Headers:', error.response.headers);
      console.error('Body:', error.response.data);
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}

main();
