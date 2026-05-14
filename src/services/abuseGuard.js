const { logSecurityEvent } = require('../utils/securityLogger');

/**
 * In-memory abuse guard for unauthenticated scanner traffic.
 * Keeps client API contracts unchanged while cutting noisy probe requests early.
 */

const strikes = new Map();
const blocks = new Map();

const DEFAULTS = {
  enabled: true,
  strikeThreshold: 5,
  windowMs: 10 * 60 * 1000,
  blockMs: 60 * 60 * 1000,
  blockAuthenticated: false
};

const parseBoolean = (value, defaultValue) => {
  if (value === undefined) return defaultValue;
  return value !== 'false';
};

const parsePositiveInt = (value, defaultValue) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
};

const getSettings = () => ({
  enabled: parseBoolean(process.env.ABUSE_GUARD_ENABLED, DEFAULTS.enabled),
  strikeThreshold: parsePositiveInt(process.env.ABUSE_GUARD_STRIKE_THRESHOLD, DEFAULTS.strikeThreshold),
  windowMs: parsePositiveInt(process.env.ABUSE_GUARD_WINDOW_MS, DEFAULTS.windowMs),
  blockMs: parsePositiveInt(process.env.ABUSE_GUARD_BLOCK_MS, DEFAULTS.blockMs),
  blockAuthenticated: parseBoolean(process.env.ABUSE_GUARD_BLOCK_AUTHENTICATED, DEFAULTS.blockAuthenticated)
});

const cleanIp = (ip) => String(ip || '')
  .split(',')[0]
  .trim()
  .replace('::ffff:', '') || 'unknown';

const getClientIp = (req) => cleanIp(
  req.clientIp ||
  req.ip ||
  req.headers?.['x-forwarded-for'] ||
  req.socket?.remoteAddress ||
  req.connection?.remoteAddress
);

const normalizePath = (input) => {
  const raw = String(input || '/');

  if (raw.startsWith('/')) {
    return raw.split('?')[0] || '/';
  }

  try {
    return new URL(raw, 'http://safeapi.local').pathname || '/';
  } catch {
    return raw.split('?')[0] || '/';
  }
};

const getRequestPath = (req) => normalizePath(req.originalUrl || req.url || req.path || '/');

const isHealthOrRoot = (path) => path === '/' || path === '/health';

const hasBearerAuth = (req) => /^Bearer\s+\S+/i.test(req.headers?.authorization || '');

const isAppPath = (path) => (
  path === '/' ||
  path === '/health' ||
  path.startsWith('/api') ||
  path.startsWith('/auth') ||
  path.startsWith('/admin') ||
  path.startsWith('/analytics') ||
  path.startsWith('/api-docs')
);

const addReason = (signals, reason, score, detail = null) => {
  signals.reasons.push(reason);
  signals.score += score;
  if (detail) {
    signals.details[reason] = detail;
  }
};

const classifyRequestPath = (pathInput, userAgent = '') => {
  const path = normalizePath(pathInput);
  const signals = {
    path,
    score: 0,
    reasons: [],
    details: {}
  };

  if (/^\/+(?:wp(?:-|\/|$)|wp-content(?:\/|$)|wp-includes(?:\/|$))/i.test(path)) {
    addReason(signals, 'WORDPRESS_PROBE', 3);
  }

  if (/^\/+(?:xmlrpc|wp-login)\.php$/i.test(path)) {
    addReason(signals, 'WORDPRESS_PHP_PROBE', 3);
  }

  if (/\.php(?:$|[/?#])/i.test(path)) {
    addReason(signals, 'PHP_PROBE', 2);
  }

  if (path.startsWith('//') || /\/{2,}/.test(path)) {
    addReason(signals, 'DOUBLE_SLASH_PATH', 1);
  }

  if (/\.\.[/\\]|%2e%2e|%252e%252e/i.test(path)) {
    addReason(signals, 'PATH_TRAVERSAL_PROBE', 3);
  }

  if (
    userAgent &&
    !isHealthOrRoot(path) &&
    /(?:sqlmap|nikto|acunetix|masscan|zgrab|nmap|wpscan|dirbuster|gobuster|python-requests|go-http-client|curl|wget)/i.test(userAgent)
  ) {
    addReason(signals, 'SCANNER_USER_AGENT', 2, userAgent);
  }

  signals.isProbe = signals.reasons.length > 0;
  return signals;
};

const analyzeRequest = (req) => {
  const path = getRequestPath(req);
  const userAgent = req.headers?.['user-agent'] || '';
  const pathSignals = classifyRequestPath(path, userAgent);
  const missingUserAgent = !userAgent && !isHealthOrRoot(path);
  const reasons = [...pathSignals.reasons];
  let score = pathSignals.score;

  if (missingUserAgent && pathSignals.isProbe) {
    reasons.push('MISSING_USER_AGENT');
    score += 1;
  }

  return {
    ip: getClientIp(req),
    path,
    userAgent,
    missingUserAgent,
    hasBearerAuth: hasBearerAuth(req),
    isAppPath: isAppPath(path),
    isProbe: pathSignals.isProbe,
    reasons,
    score
  };
};

const getActiveBlock = (ip) => {
  const block = blocks.get(ip);
  if (!block) return null;

  if (Date.now() >= block.expiresAtMs) {
    blocks.delete(ip);
    return null;
  }

  return block;
};

const shouldBypassBlock = (analysis, settings) => (
  !settings.blockAuthenticated &&
  analysis.hasBearerAuth &&
  analysis.isAppPath
);

const trimArray = (items, max) => items.slice(Math.max(0, items.length - max));

const blockIp = (ip, data, settings) => {
  const now = Date.now();
  const block = {
    ip,
    blockedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + settings.blockMs).toISOString(),
    expiresAtMs: now + settings.blockMs,
    reason: data.reason,
    strikes: data.strikes,
    lastPath: data.lastPath,
    reasons: data.reasons || []
  };

  blocks.set(ip, block);

  logSecurityEvent('IP_TEMP_BLOCKED', {
    ip,
    reason: block.reason,
    strikes: block.strikes,
    lastPath: block.lastPath,
    expiresAt: block.expiresAt,
    severity: 'high'
  });

  return block;
};

const registerStrike = (analysis, settings) => {
  const now = Date.now();
  const existing = strikes.get(analysis.ip);
  const current = existing && (now - existing.firstSeenMs) <= settings.windowMs
    ? existing
    : {
      ip: analysis.ip,
      count: 0,
      firstSeenMs: now,
      firstSeen: new Date(now).toISOString(),
      paths: [],
      reasons: []
    };

  current.count += 1;
  current.lastSeenMs = now;
  current.lastSeen = new Date(now).toISOString();
  current.paths = trimArray([...current.paths, analysis.path], 10);
  current.reasons = trimArray([...new Set([...current.reasons, ...analysis.reasons])], 20);
  strikes.set(analysis.ip, current);

  logSecurityEvent('SCANNER_PROBE_DETECTED', {
    ip: analysis.ip,
    path: analysis.path,
    reasons: analysis.reasons,
    strikeCount: current.count,
    threshold: settings.strikeThreshold,
    userAgent: analysis.userAgent || null,
    severity: 'medium'
  });

  let block = getActiveBlock(analysis.ip);
  if (!block && current.count >= settings.strikeThreshold) {
    block = blockIp(analysis.ip, {
      reason: 'scanner_probe_threshold',
      strikes: current.count,
      lastPath: analysis.path,
      reasons: current.reasons
    }, settings);
  }

  return {
    count: current.count,
    blocked: !!block,
    block
  };
};

const checkRequest = (req) => {
  const settings = getSettings();
  const analysis = analyzeRequest(req);

  if (!settings.enabled) {
    return { action: 'allow', analysis, settings };
  }

  const activeBlock = getActiveBlock(analysis.ip);
  if (activeBlock && !shouldBypassBlock(analysis, settings)) {
    logSecurityEvent('BLOCKED_REQUEST', {
      ip: analysis.ip,
      path: analysis.path,
      reason: activeBlock.reason,
      expiresAt: activeBlock.expiresAt,
      severity: 'high'
    });

    return {
      action: 'block',
      status: analysis.isProbe ? 404 : 429,
      analysis,
      block: activeBlock,
      settings
    };
  }

  if (analysis.isProbe) {
    const strike = registerStrike(analysis, settings);
    return {
      action: 'block',
      status: 404,
      analysis,
      strike,
      settings
    };
  }

  return { action: 'allow', analysis, settings };
};

const listBlocks = () => {
  const now = Date.now();
  const active = [];

  for (const [ip, block] of blocks.entries()) {
    if (now >= block.expiresAtMs) {
      blocks.delete(ip);
      continue;
    }

    active.push({
      ip,
      blockedAt: block.blockedAt,
      expiresAt: block.expiresAt,
      expiresInMs: block.expiresAtMs - now,
      reason: block.reason,
      strikes: block.strikes,
      lastPath: block.lastPath,
      reasons: block.reasons
    });
  }

  return active.sort((a, b) => a.expiresInMs - b.expiresInMs);
};

const unblockIp = (ip) => {
  const clean = cleanIp(ip);
  const existed = blocks.delete(clean);
  strikes.delete(clean);
  return existed;
};

const resetForTests = () => {
  strikes.clear();
  blocks.clear();
};

module.exports = {
  checkRequest,
  analyzeRequest,
  classifyRequestPath,
  listBlocks,
  unblockIp,
  resetForTests,
  getSettings
};
