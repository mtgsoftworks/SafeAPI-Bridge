#!/usr/bin/env node
/**
 * Reset user request counters (daily/monthly)
 *
 * Usage:
 *   node scripts/scheduler/reset-quotas.js --daily
 *   node scripts/scheduler/reset-quotas.js --monthly
 *   node scripts/scheduler/reset-quotas.js --daily --monthly
 */

const UserModel = require('../../src/models/User');

function hasFlag(name) {
  const key = `--${name}`;
  return process.argv.includes(key);
}

async function main() {
  const doDaily = hasFlag('daily');
  const doMonthly = hasFlag('monthly');

  if (!doDaily && !doMonthly) {
    console.error('Specify at least one: --daily or --monthly');
    process.exit(1);
  }

  try {
    if (doDaily) {
      await UserModel.resetDailyCounters();
      console.log('✅ Daily counters reset');
    }
    if (doMonthly) {
      await UserModel.resetMonthlyCounters();
      console.log('✅ Monthly counters reset');
    }
  } catch (err) {
    console.error('Reset error:', err.message || err);
    process.exit(2);
  } finally {
    // Ensure Prisma disconnect
    try { await require('../../src/db/client').$disconnect(); } catch (_) {}
  }
}

main();

