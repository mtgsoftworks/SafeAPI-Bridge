/* eslint-disable no-console */

/**
 * Full integration test script for SafeAPI-Bridge.
 *
 * Bu script aşağıdaki adımları uçtan uca test eder:
 *  1) /auth/token  -> JWT üretimi
 *  2) /auth/verify -> JWT doğrulama
 *  3) /auth/token-info -> token bilgisi
 *  4) (Varsa) Server Key ile Gemini proxy isteği
 *  5) /api/split-key/split -> BYOK split key oluşturma (Gemini)
 *  6) /api/gemini/proxy -> BYOK ile Gemini isteği
 *  7) /api/split-key -> split key listeleme
 *  8) /api/split-key/{keyId} -> split key detay
 *  9) /api/split-key/validate -> header doğrulama
 * 10) /analytics/my-stats -> mevcut kullanıcının istatistikleri
 *
 * Çalıştırmadan önce:
 *   - SAFEAPI_BASE_URL env ile çalışacak server URL'ini ver:
 *       PowerShell:  $env:SAFEAPI_BASE_URL="https://safeapi-bridge-production.up.railway.app"
 *       Bash:        export SAFEAPI_BASE_URL="https://safeapi-bridge-production.up.railway.app"
 *   - GEMINI_TEST_KEY env'e gerçek bir Gemini API key koy:
 *       PowerShell:  $env:GEMINI_TEST_KEY="AIzaSy..."
 *       Bash:        export GEMINI_TEST_KEY="AIzaSy..."
 */

const axios = require('axios');

const BASE_URL = process.env.SAFEAPI_BASE_URL || 'http://localhost:3003';
const ORIGINAL_GEMINI_KEY = process.env.GEMINI_TEST_KEY || process.env.GEMINI_API_KEY;

if (!ORIGINAL_GEMINI_KEY) {
  console.error('ERROR: GEMINI_TEST_KEY (veya GEMINI_API_KEY) environment variable is not set.');
  console.error('Example (PowerShell):  $env:GEMINI_TEST_KEY="AIzaSy..."');
  console.error('Example (bash):        export GEMINI_TEST_KEY="AIzaSy..."');
  process.exit(1);
}

async function main() {
  let token;
  let keyId;
  let clientPart;

  try {
    console.log('=== SafeAPI-Bridge FULL TEST ===');
    console.log(`BASE_URL: ${BASE_URL}`);
    console.log('');

    // 1) JWT üretimi
    console.log('1) POST /auth/token -> JWT üretimi...');
    const authRes = await axios.post(`${BASE_URL}/auth/token`, {
      userId: 'full-test-user',
      appId: 'full-test-app'
    });

    token = authRes.data.token;
    if (!token) {
      console.error('JWT token alınamadı. Cevap:', authRes.data);
      process.exit(1);
    }

    console.log('JWT token alındı.');
    console.log('Kullanıcı:', authRes.data.user);
    console.log('');

    // 2) /auth/verify
    console.log('2) GET /auth/verify -> token doğrulama...');
    const verifyRes = await axios.get(`${BASE_URL}/auth/verify`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    console.log('Verify response:', verifyRes.data);
    console.log('');

    // 3) /auth/token-info
    console.log('3) GET /auth/token-info -> token bilgisi...');
    const infoRes = await axios.get(`${BASE_URL}/auth/token-info`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    console.log('Token info (özet):', {
      user: infoRes.data.user,
      expiresAt: infoRes.data.expiresAt,
      isBlacklisted: infoRes.data.isBlacklisted
    });
    console.log('');

    // 4) Server Key ile Gemini proxy (sadece GEMINI_API_KEY tanımlıysa)
    if (process.env.GEMINI_API_KEY) {
      console.log('4) POST /api/gemini/proxy -> Server Key ile Gemini isteği (stream yok)...');
      const serverKeyRes = await axios.post(
        `${BASE_URL}/api/gemini/proxy`,
        {
          endpoint: '/models/gemini-2.5-flash:generateContent',
          contents: [
            {
              parts: [
                { text: 'Bu cevap SafeAPI-Bridge uzerinden Server Key ile gelen bir test cevabidir. Kisaca kendini tanit.' }
              ]
            }
          ]
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('Server Key Gemini status:', serverKeyRes.status);
      console.log('');
    } else {
      console.log('4) GEMINI_API_KEY tanımlı değil, Server Key testi atlandı.');
      console.log('');
    }

    // 5) BYOK split (Gemini)
    console.log('5) POST /api/split-key/split -> Gemini key split (BYOK, auto keyId)...');
    const splitRes = await axios.post(
      `${BASE_URL}/api/split-key/split`,
      {
        originalKey: ORIGINAL_GEMINI_KEY,
        apiProvider: 'gemini',
        description: 'Full-test Gemini BYOK key (auto keyId)'
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!splitRes.data || !splitRes.data.data) {
      console.error('Split key cevabı beklenen formatta değil:', splitRes.data);
      process.exit(1);
    }

    ({ keyId, clientPart } = splitRes.data.data);

    console.log('Split key oluşturuldu.');
    console.log('keyId (auto-generated):', keyId);
    console.log('clientPart (full):', clientPart);
    console.log('');

    // 6) BYOK ile Gemini proxy isteği
    console.log('6) POST /api/gemini/proxy -> BYOK ile Gemini isteği (stream yok)...');
    const byokRes = await axios.post(
      `${BASE_URL}/api/gemini/proxy`,
      {
        endpoint: '/models/gemini-2.5-flash:generateContent',
        contents: [
          {
            parts: [
              {
                text: 'Bu cevap SafeAPI-Bridge uzerinden BYOK (split key) ile gelen bir full test cevabidir. Kisaca sistemi acikla.'
              }
            ]
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Partial-Key-Id': keyId,
          'X-Partial-Key': clientPart,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('BYOK Gemini status:', byokRes.status);
    const top = byokRes.data || {};
    console.log('BYOK Gemini response (top level):', Object.keys(top));
    console.log('');

    // 7) Split key listesi
    console.log('7) GET /api/split-key -> split key listesi...');
    const listRes = await axios.get(`${BASE_URL}/api/split-key`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    console.log('Split keys count:', listRes.data.count);
    console.log('');

    // 8) Belirli split key detay
    console.log(`8) GET /api/split-key/${keyId} -> split key detay...`);
    const detailRes = await axios.get(`${BASE_URL}/api/split-key/${encodeURIComponent(keyId)}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    console.log('Split key detail (özet):', {
      keyId: detailRes.data.data.keyId,
      apiProvider: detailRes.data.data.apiProvider,
      active: detailRes.data.data.active,
      usageCount: detailRes.data.data.usageCount
    });
    console.log('');

    // 9) Split key validate (header üzerinden)
    console.log('9) POST /api/split-key/validate -> header ile BYOK doğrulama...');
    const validateRes = await axios.post(
      `${BASE_URL}/api/split-key/validate`,
      {},
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Partial-Key-Id': keyId,
          'X-Partial-Key': clientPart
        }
      }
    );
    console.log('Validate response:', validateRes.data);
    console.log('');

    // 10) Kullanıcı istatistikleri
    console.log('10) GET /analytics/my-stats -> kullanıcının istatistikleri...');
    const statsRes = await axios.get(`${BASE_URL}/analytics/my-stats`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    console.log('My stats (özet):', {
      totalRequests: statsRes.data.totalRequests,
      totalCost: statsRes.data.totalCost,
      perApi: statsRes.data.byApi ? Object.keys(statsRes.data.byApi) : []
    });
    console.log('');

    console.log('=== FULL TEST BAŞARIYLA TAMAMLANDI ===');
  } catch (error) {
    console.error('\nFULL TEST HATASI:');
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

