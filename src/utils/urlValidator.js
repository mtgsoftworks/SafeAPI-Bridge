const { logSSRFAttempt } = require('./securityLogger');

/**
 * URL Validator for SSRF Protection
 * Prevents Server-Side Request Forgery attacks via webhook URLs
 */

// Private IP ranges (RFC 1918 + others)
const PRIVATE_IP_RANGES = [
  /^127\./,                    // Loopback
  /^10\./,                     // Private Class A
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Private Class B
  /^192\.168\./,               // Private Class C
  /^169\.254\./,               // Link-local
  /^::1$/,                     // IPv6 loopback
  /^fe80:/,                    // IPv6 link-local
  /^fc00:/,                    // IPv6 unique local
  /^fd00:/,                    // IPv6 unique local
  /^::ffff:127\./,             // IPv4-mapped IPv6 loopback
  /^::ffff:10\./,              // IPv4-mapped IPv6 private
  /^::ffff:192\.168\./         // IPv4-mapped IPv6 private
];

// Localhost variations
const LOCALHOST_PATTERNS = [
  'localhost',
  '0.0.0.0',
  '127.0.0.1',
  '[::1]',
  '[::]'
];

// Cloud metadata service IPs (AWS, GCP, Azure, etc.)
const METADATA_IPS = [
  '169.254.169.254',           // AWS/Azure/GCP metadata
  '169.254.170.2',             // AWS ECS metadata
  'metadata.google.internal',  // GCP metadata
  '100.100.100.200'            // Alibaba Cloud metadata
];

/**
 * Validate URL for SSRF protection
 * @param {string} url - URL to validate
 * @param {string} ip - Client IP (for logging)
 * @returns {object} { valid: boolean, error: string|null }
 */
const validateURL = (url, ip = 'unknown') => {
  try {
    // Basic validation
    if (!url || typeof url !== 'string') {
      return {
        valid: false,
        error: 'URL must be a non-empty string'
      };
    }

    // Length check (prevent buffer attacks)
    if (url.length > 2048) {
      return {
        valid: false,
        error: 'URL too long (max 2048 characters)'
      };
    }

    // Parse URL
    let parsed;
    try {
      parsed = new URL(url);
    } catch (error) {
      return {
        valid: false,
        error: 'Invalid URL format'
      };
    }

    // Protocol whitelist (only HTTPS for production security)
    const allowedProtocols = ['https:'];
    // Allow HTTP for development
    if (process.env.NODE_ENV === 'development') {
      allowedProtocols.push('http:');
    }

    if (!allowedProtocols.includes(parsed.protocol)) {
      logSSRFAttempt(url, ip, `Invalid protocol: ${parsed.protocol}`);
      return {
        valid: false,
        error: `Protocol must be one of: ${allowedProtocols.join(', ')}`
      };
    }

    const hostname = parsed.hostname.toLowerCase();

    // Check localhost patterns
    if (LOCALHOST_PATTERNS.includes(hostname)) {
      logSSRFAttempt(url, ip, `Localhost access blocked: ${hostname}`);
      return {
        valid: false,
        error: 'Localhost URLs are not allowed'
      };
    }

    // Check metadata service IPs
    if (METADATA_IPS.includes(hostname)) {
      logSSRFAttempt(url, ip, `Metadata service access blocked: ${hostname}`);
      return {
        valid: false,
        error: 'Cloud metadata service URLs are not allowed'
      };
    }

    // Check private IP ranges
    for (const pattern of PRIVATE_IP_RANGES) {
      if (pattern.test(hostname)) {
        logSSRFAttempt(url, ip, `Private IP access blocked: ${hostname}`);
        return {
          valid: false,
          error: 'Private IP addresses are not allowed'
        };
      }
    }

    // Additional checks for IP address format
    if (isIPAddress(hostname)) {
      // Allow only public IPs
      if (!isPublicIP(hostname)) {
        logSSRFAttempt(url, ip, `Non-public IP blocked: ${hostname}`);
        return {
          valid: false,
          error: 'Only public IP addresses are allowed'
        };
      }
    }

    // Check for suspicious patterns
    if (hostname.includes('..') || hostname.includes('%00')) {
      logSSRFAttempt(url, ip, `Suspicious pattern in hostname: ${hostname}`);
      return {
        valid: false,
        error: 'Suspicious URL pattern detected'
      };
    }

    // Success
    return {
      valid: true,
      error: null
    };

  } catch (error) {
    return {
      valid: false,
      error: `URL validation error: ${error.message}`
    };
  }
};

/**
 * Check if string is an IP address
 */
const isIPAddress = (hostname) => {
  // IPv4 pattern
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  // IPv6 pattern (simplified)
  const ipv6Pattern = /^([0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}$/i;

  return ipv4Pattern.test(hostname) || ipv6Pattern.test(hostname);
};

/**
 * Check if IP is public (not private/reserved)
 */
const isPublicIP = (ip) => {
  // Check against private ranges
  for (const pattern of PRIVATE_IP_RANGES) {
    if (pattern.test(ip)) {
      return false;
    }
  }

  // Check against localhost
  if (LOCALHOST_PATTERNS.includes(ip)) {
    return false;
  }

  // Check against metadata IPs
  if (METADATA_IPS.includes(ip)) {
    return false;
  }

  // IPv4 reserved ranges
  const reservedRanges = [
    /^0\./,           // Current network
    /^100\.6[4-9]\./,  // Shared address space (100.64.0.0/10)
    /^100\.[7-9]\d\./, // Shared address space
    /^100\.1[0-2]\d\./, // Shared address space
    /^192\.0\.0\./,   // IETF protocol assignments
    /^192\.0\.2\./,   // TEST-NET-1
    /^198\.18\./,     // Benchmarking
    /^198\.19\./,     // Benchmarking
    /^198\.51\.100\./, // TEST-NET-2
    /^203\.0\.113\./,  // TEST-NET-3
    /^22[4-9]\./,     // Multicast (224-239)
    /^23[0-9]\./,     // Multicast
    /^24[0-9]\./,     // Reserved
    /^25[0-5]\./      // Reserved
  ];

  for (const pattern of reservedRanges) {
    if (pattern.test(ip)) {
      return false;
    }
  }

  return true;
};

/**
 * Validate multiple URLs (for batch operations)
 */
const validateURLs = (urls, ip = 'unknown') => {
  if (!Array.isArray(urls)) {
    return {
      valid: false,
      error: 'URLs must be an array'
    };
  }

  const results = urls.map(url => validateURL(url, ip));
  const invalid = results.filter(r => !r.valid);

  if (invalid.length > 0) {
    return {
      valid: false,
      error: `${invalid.length} invalid URL(s)`,
      details: invalid
    };
  }

  return {
    valid: true,
    error: null
  };
};

/**
 * Middleware for URL validation
 */
const validateURLMiddleware = (fieldName = 'url') => {
  return (req, res, next) => {
    const url = req.body[fieldName];
    const ip = req.clientIp || req.ip || req.headers['x-forwarded-for'] || 'unknown';

    const result = validateURL(url, ip);

    if (!result.valid) {
      return res.status(400).json({
        error: 'Invalid URL',
        message: result.error,
        field: fieldName
      });
    }

    next();
  };
};

module.exports = {
  validateURL,
  validateURLs,
  validateURLMiddleware,
  isIPAddress,
  isPublicIP
};
