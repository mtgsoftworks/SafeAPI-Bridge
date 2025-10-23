#!/usr/bin/env node
// Polls GET /health until it responds or timeout

const axios = require('axios');

function arg(name, fallback) {
  const key = `--${name}`;
  const idx = process.argv.indexOf(key);
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

const BASE_URL = arg('base', process.env.BASE_URL || '').trim();
const TIMEOUT_MS = parseInt(arg('timeout', '120000'), 10);
const INTERVAL_MS = 4000;

if (!BASE_URL) {
  console.error('Missing --base');
  process.exit(1);
}

async function main() {
  const start = Date.now();
  let attempt = 0;
  while (Date.now() - start < TIMEOUT_MS) {
    attempt++;
    try {
      const r = await axios.get(`${BASE_URL}/health`, { timeout: 15000, validateStatus: s => s < 600 });
      if (r.status >= 200 && r.status < 300 && r.data && r.data.status) {
        console.log(`Health OK on attempt ${attempt}:`, JSON.stringify(r.data));
        return;
      }
      console.log(`Attempt ${attempt}: HTTP ${r.status}`);
    } catch (e) {
      const msg = e.response ? `HTTP ${e.response.status}` : (e.message || e);
      console.log(`Attempt ${attempt} failed: ${msg}`);
    }
    await new Promise(res => setTimeout(res, INTERVAL_MS));
  }
  console.error('Health check timeout');
  process.exit(2);
}

main();

