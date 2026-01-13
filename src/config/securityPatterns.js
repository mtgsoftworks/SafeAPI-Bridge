/**
 * Security Patterns for Input Validation
 * Centralized patterns for detecting malicious input
 */

const SECURITY_PATTERNS = {
  // SQL Injection patterns
  SQL_INJECTION: [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|CREATE|ALTER|EXEC|EXECUTE)\b)/i,
    /(\'|\"|;|--|\/\*|\*\/|xp_|sp_)/i,
    /\b(OR|AND)\s+\d+\s*=\s*\d+/i,
    /\b(OR|AND)\s+['"]?[^'"]*['"]?\s*=\s*['"]?[^'"]*['"]?/i
  ],

  // XSS patterns
  XSS: [
    /<script[^>]*>.*?<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /<iframe[^>]*>.*?<\/iframe>/gi,
    /<object[^>]*>.*?<\/object>/gi,
    /<embed[^>]*>.*?<\/embed>/gi
  ],

  // Path traversal patterns
  PATH_TRAVERSAL: [
    /\.\.[\/\\]/g,
    /%2e%2e[\/\\]/gi,
    /\.\.%2f/gi,
    /\.\.%5c/gi,
    /\.\.%c0%af/gi,
    /\.\.%c1%9c/gi
  ],

  // Command injection patterns (relaxed for API proxy - no {} or [] blocking)
  COMMAND_INJECTION: [
    /[;&|`]+/g,
    /wget\s+http/gi,
    /curl\s+http/gi,
    /\bnetcat\b/gi,
    /\|\s*sh\b/gi,
    /\|\s*bash\b/gi
  ],

  // LDAP injection patterns
  LDAP_INJECTION: [
    /\*\)/,
    /\(\|/,
    /&\(/,
    /!\(/,
    /\/\*/,
    /\*\//
  ],

  // NoSQL injection patterns
  NOSQL_INJECTION: [
    /\$where/i,
    /\$ne/i,
    /\$in/i,
    /\$nin/i,
    /\$gt/i,
    /\$lt/i,
    /\$regex/i,
    /\$expr/i
  ],

  // File inclusion patterns
  FILE_INCLUSION: [
    /php:\/\/filter\//gi,
    /php:\/\/input/gi,
    /data:\/\/text\//gi,
    /expect:\/\//gi,
    /file:\/\/\/\//gi
  ],

  // Header injection patterns
  HEADER_INJECTION: [
    /[\r\n]\s*(From|To|Cc|Bcc|Subject|Reply-To|Return-Path):/i,
    /[\r\n]\s*(Content-Type|Content-Transfer-Encoding):/i
  ]
};

/**
 * Combined patterns for efficient checking
 */
const createMaliciousPatterns = () => {
  return [
    ...SECURITY_PATTERNS.SQL_INJECTION,
    ...SECURITY_PATTERNS.XSS,
    ...SECURITY_PATTERNS.PATH_TRAVERSAL,
    ...SECURITY_PATTERNS.COMMAND_INJECTION,
    ...SECURITY_PATTERNS.LDAP_INJECTION,
    ...SECURITY_PATTERNS.NOSQL_INJECTION,
    ...SECURITY_PATTERNS.FILE_INCLUSION,
    ...SECURITY_PATTERNS.HEADER_INJECTION
  ];
};

const MALICIOUS_PATTERNS = createMaliciousPatterns();

/**
 * Check if input contains malicious patterns
 */
const containsMaliciousPattern = (input) => {
  if (typeof input !== 'string') return false;

  const normalizedInput = input.toLowerCase();
  return MALICIOUS_PATTERNS.some(pattern => pattern.test(normalizedInput));
};

/**
 * Check specific pattern types
 */
const checkPatternType = (input, patternType) => {
  if (typeof input !== 'string' || !SECURITY_PATTERNS[patternType]) return false;

  const patterns = SECURITY_PATTERNS[patternType];
  if (!Array.isArray(patterns)) return false;

  return patterns.some(pattern => pattern.test(input));
};

module.exports = {
  SECURITY_PATTERNS,
  MALICIOUS_PATTERNS,
  containsMaliciousPattern,
  checkPatternType
};