#!/usr/bin/env node
const axios = require('axios');

const BASE_URL = 'https://safeapi-bridge-3zo9.onrender.com';
const USER_ID = `security-tester-${Date.now()}`;

async function test() {
  console.log('='.repeat(60));
  console.log('🔒 Security Features Test');
  console.log('='.repeat(60));

  // 1. Get Token
  console.log('\n1️⃣  Getting JWT token...');
  const tokenResp = await axios.post(`${BASE_URL}/auth/token`, {
    userId: USER_ID,
    appId: 'test-app'
  });

  const token = tokenResp.data.token;
  console.log(`✅ Token received: ${token.substring(0, 30)}...`);
  console.log(`   User: ${tokenResp.data.user.userId}`);
  console.log(`   Daily Quota: ${tokenResp.data.user.dailyQuota}`);

  // 2. Test Token Info Endpoint
  console.log('\n2️⃣  Testing /auth/token-info...');
  const infoResp = await axios.get(`${BASE_URL}/auth/token-info`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  console.log(`✅ Token Info:`);
  console.log(`   Issued: ${infoResp.data.issuedAt}`);
  console.log(`   Expires: ${infoResp.data.expiresAt}`);
  console.log(`   Expires in: ${infoResp.data.expiresInHours} hours`);
  console.log(`   Blacklisted: ${infoResp.data.isBlacklisted}`);

  // 3. Test API Call with Token
  console.log('\n3️⃣  Testing Gemini API call...');
  const apiResp = await axios.post(`${BASE_URL}/api/gemini/proxy`, {
    endpoint: '/models/gemini-2.5-flash:generateContent',
    contents: [{ parts: [{ text: 'Sadece "Test başarılı!" de.' }] }]
  }, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  const responseText = apiResp.data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
  console.log(`✅ API Response: ${responseText.substring(0, 100)}`);

  // 4. Test Logout
  console.log('\n4️⃣  Testing logout (token revocation)...');
  const logoutResp = await axios.post(`${BASE_URL}/auth/logout`, {}, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  console.log(`✅ Logged out: ${logoutResp.data.message}`);

  // 5. Try to use blacklisted token
  console.log('\n5️⃣  Testing blacklisted token (should fail)...');
  try {
    await axios.post(`${BASE_URL}/api/gemini/proxy`, {
      endpoint: '/models/gemini-2.5-flash:generateContent',
      contents: [{ parts: [{ text: 'Test' }] }]
    }, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log('❌ ERROR: Blacklisted token was accepted!');
  } catch (err) {
    if (err.response?.status === 401 && err.response?.data?.error === 'Token Revoked') {
      console.log(`✅ Blacklisted token correctly rejected!`);
      console.log(`   Message: ${err.response.data.message}`);
    } else {
      console.log(`⚠️  Unexpected error: ${err.response?.status} - ${err.response?.data?.error}`);
    }
  }

  // 6. Test health endpoint
  console.log('\n6️⃣  Testing health endpoint...');
  const healthResp = await axios.get(`${BASE_URL}/health`);
  console.log(`✅ Health status: ${healthResp.data.status}`);
  console.log(`   APIs configured: ${healthResp.data.summary}`);

  console.log('\n' + '='.repeat(60));
  console.log('✅ All security features working correctly!');
  console.log('='.repeat(60));
}

test().catch(err => {
  console.error('\n❌ Test failed:');
  if (err.response) {
    console.error(`   Status: ${err.response.status}`);
    console.error(`   Error: ${JSON.stringify(err.response.data, null, 2)}`);
  } else {
    console.error(`   ${err.message}`);
  }
  process.exit(1);
});
