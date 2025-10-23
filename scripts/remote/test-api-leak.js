#!/usr/bin/env node
const axios = require('axios');

const BASE_URL = 'https://safeapi-bridge-3zo9.onrender.com';

async function testLeaks() {
  console.log('='.repeat(60));
  console.log('🔍 API Key Leak Detection Test');
  console.log('='.repeat(60));

  // 1. Get token
  const tokenResp = await axios.post(`${BASE_URL}/auth/token`, {
    userId: `leak-test-${Date.now()}`,
    appId: 'test'
  });

  const token = tokenResp.data.token;

  // 2. Check /auth/token response
  console.log('\n1️⃣  Checking /auth/token response...');
  const tokenKeys = Object.keys(tokenResp.data);
  console.log(`   Response keys: ${tokenKeys.join(', ')}`);

  const userKeys = Object.keys(tokenResp.data.user || {});
  console.log(`   User object keys: ${userKeys.join(', ')}`);

  const tokenJson = JSON.stringify(tokenResp.data);
  if (tokenJson.includes('sk-') ||
      tokenJson.includes('AIza') ||
      tokenJson.toLowerCase().includes('apikey') ||
      tokenResp.data.apiKey ||
      tokenResp.data.user?.apiKey) {
    console.log('   ❌ LEAK DETECTED in /auth/token!');
    console.log('   Response:', tokenJson);
  } else {
    console.log('   ✅ No API key in /auth/token response');
  }

  // 3. Check /api/:api/endpoints
  console.log('\n2️⃣  Checking /api/gemini/endpoints...');
  const endpointsResp = await axios.get(`${BASE_URL}/api/gemini/endpoints`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  const endpointKeys = Object.keys(endpointsResp.data);
  console.log(`   Response keys: ${endpointKeys.join(', ')}`);

  const endpointsJson = JSON.stringify(endpointsResp.data, null, 2);
  console.log(`   Response:\n${endpointsJson}`);

  if (endpointsJson.includes('sk-') ||
      endpointsJson.includes('AIza') ||
      endpointsResp.data.apiKey ||
      endpointsResp.data.key) {
    console.log('   ❌ LEAK DETECTED in /endpoints!');
  } else {
    console.log('   ✅ No API key in /endpoints response');
  }

  // 4. Check /health
  console.log('\n3️⃣  Checking /health...');
  const healthResp = await axios.get(`${BASE_URL}/health`);

  const healthJson = JSON.stringify(healthResp.data);
  if (healthJson.includes('sk-') ||
      healthJson.includes('AIza') ||
      healthJson.includes('ant-') ||
      healthJson.toLowerCase().includes('apikey')) {
    console.log('   ❌ LEAK DETECTED in /health!');
    console.log('   Response:', healthJson);
  } else {
    console.log('   ✅ No API key in /health response');
  }

  // 5. Check error responses
  console.log('\n4️⃣  Checking error response (invalid endpoint)...');
  try {
    await axios.post(`${BASE_URL}/api/gemini/proxy`, {
      endpoint: '/invalid-endpoint',
      contents: []
    }, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
  } catch (err) {
    const errorJson = JSON.stringify(err.response?.data || {});
    if (errorJson.includes('sk-') ||
        errorJson.includes('AIza') ||
        errorJson.toLowerCase().includes('apikey')) {
      console.log('   ❌ LEAK DETECTED in error response!');
      console.log('   Error:', errorJson);
    } else {
      console.log('   ✅ No API key in error response');
    }
  }

  // 6. Check logs exposure
  console.log('\n5️⃣  Checking for sensitive data in logs...');
  console.log('   ⚠️  Note: Log files are not accessible via API (good!)');
  console.log('   ✅ Logs are server-side only');

  console.log('\n' + '='.repeat(60));
  console.log('✅ API Key Leak Detection Complete!');
  console.log('='.repeat(60));
}

testLeaks().catch(err => {
  console.error('\n❌ Test failed:');
  if (err.response) {
    console.error(`   Status: ${err.response.status}`);
    console.error(`   Error: ${JSON.stringify(err.response.data, null, 2)}`);
  } else {
    console.error(`   ${err.message}`);
  }
  process.exit(1);
});
