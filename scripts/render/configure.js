#!/usr/bin/env node
/**
 * Configure Render.com service environment variables
 *
 * Usage:
 *   RENDER_API_KEY=xxxx node scripts/render/configure.js --service safeapi-bridge \
 *     --set JWT_SECRET=random --set ADMIN_API_KEY=random --set NODE_ENV=production
 *
 * If a value is 'random', a secure random string is generated.
 */

const axios = require('axios');
const crypto = require('crypto');

function parseArgs(argv) {
  const args = { set: [], service: process.env.RENDER_SERVICE_NAME || 'safeapi-bridge' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--service' && argv[i + 1]) {
      args.service = argv[++i];
    } else if (a === '--set' && argv[i + 1]) {
      args.set.push(argv[++i]);
    }
  }
  return args;
}

function genRandom(len = 48) {
  return crypto.randomBytes(len).toString('base64url');
}

async function main() {
  const token = process.env.RENDER_API_KEY;
  if (!token) {
    console.error('RENDER_API_KEY is required');
    process.exit(1);
  }

  const { service, set } = parseArgs(process.argv);
  const api = axios.create({
    baseURL: 'https://api.render.com/v1',
    headers: { Authorization: `Bearer ${token}` }
  });

  // Find service by name
  const services = (await api.get('/services')).data;
  const svc = services.find(s => (s.service || s).name === service || s.name === service);
  if (!svc) {
    console.error(`Service '${service}' not found in your Render account.`);
    console.error('Tip: ensure the service is created and the name matches render.yaml');
    process.exit(2);
  }

  const serviceId = svc.id || (svc.service && svc.service.id);

  // Build env var list to set
  const pairs = {};
  for (const entry of set) {
    const [k, v = ''] = entry.split('=');
    if (!k) continue;
    pairs[k] = v === 'random' ? genRandom(32) : v;
  }

  // Ensure some sensible defaults if not provided
  if (!pairs.NODE_ENV) pairs.NODE_ENV = 'production';

  const envVars = Object.entries(pairs).map(([key, value]) => ({ key, value }));

  // Update env vars (PUT replaces entire set; use PATCH-like by merging existing)
  const existing = (await api.get(`/services/${serviceId}/env-vars`)).data;
  const mergedMap = new Map(existing.envVars.map(ev => [ev.key, ev.value]));
  for (const { key, value } of envVars) mergedMap.set(key, value);
  const merged = Array.from(mergedMap.entries()).map(([key, value]) => ({ key, value }));

  await api.put(`/services/${serviceId}/env-vars`, { envVars: merged });

  console.log(`Updated env vars for service '${service}' (${serviceId}).`);
}

main().catch(err => {
  console.error('Render configure error:', err.response?.data || err.message);
  process.exit(1);
});

