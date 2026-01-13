const compression = require('compression');
const { PERFORMANCE } = require('../config/constants');

/**
 * Response Compression Middleware
 * Optimizes response sizes for better performance
 */

// Compression configuration
const compressionConfig = {
  // Only compress responses larger than this threshold (bytes)
  threshold: 1024,

  // Compression level (1-9, where 9 is best compression but slowest)
  level: 6,

  // Enable compression for these content types
  filter: (req, res) => {
    // Don't compress already compressed content
    const contentType = res.getHeader('content-type');
    if (contentType) {
      const type = contentType.split(';')[0].toLowerCase();
      const compressedTypes = [
        'application/gzip',
        'application/zip',
        'image/jpeg',
        'image/png',
        'image/gif',
        'video/mp4',
        'audio/mpeg'
      ];

      if (compressedTypes.some(compressed => type.includes(compressed))) {
        return false;
      }
    }

    // Don't compress small responses (handled by threshold)
    // Always compress API responses that can benefit from it
    return true;
  },

  // Compressible MIME types
  compressible: {
    // Default compressible types plus custom ones
    'application/json': true,
    'text/javascript': true,
    'text/css': true,
    'text/html': true,
    'text/xml': true,
    'application/xml': true,
    'application/ld+json': true,
    'text/plain': true
  },

  // Chunk size for streaming compression
  chunkSize: 16 * 1024, // 16KB

  // Memory level for compression (1-9)
  memLevel: 8,

  // Window size for compression
  windowBits: 15
};

/**
 * Compression-aware middleware that adapts to response content
 */
const adaptiveCompression = compression({
  ...compressionConfig,
  // Custom filter function for intelligent compression
  filter: (req, res) => {
    // Skip compression in certain conditions
    if (shouldSkipCompression(req, res)) {
      return false;
    }

    // Use base filter logic
    return compressionConfig.filter(req, res);
  }
});

/**
 * Determine if compression should be skipped
 */
const shouldSkipCompression = (req, res) => {
  // Skip compression for certain requests
  const skipConditions = [
    // Health checks (should be fast)
    req.path === '/health' || req.path === '/',

    // Already compressed responses
    req.headers['accept-encoding']?.includes('br'), // Brotli already handled

    // Very small requests
    req.headers['content-length'] && parseInt(req.headers['content-length']) < 512,

    // WebSocket connections
    req.upgrade,

    // Server-sent events
    req.headers['accept']?.includes('text/event-stream'),

    // Streaming responses
    res.getHeader('content-type')?.includes('application/octet-stream'),

    // Development mode with light debugging
    process.env.NODE_ENV === 'development' && process.env.DISABLE_COMPRESSION === 'true'
  ];

  return skipConditions.some(condition => condition);
};

/**
 * Enhanced compression middleware with metrics
 */
const compressionWithMetrics = (req, res, next) => {
  const startTime = Date.now();
  const originalWrite = res.write;
  const originalEnd = res.end;
  let originalSize = 0;
  let compressedSize = 0;

  // Track response size
  res.write = function(chunk, encoding) {
    if (chunk) {
      originalSize += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, encoding);
    }
    return originalWrite.call(this, chunk, encoding);
  };

  res.end = function(chunk, encoding) {
    if (chunk) {
      originalSize += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, encoding);
    }

    // Get final compressed size from content-length header if available
    const contentLength = res.getHeader('content-length');
    if (contentLength) {
      compressedSize = parseInt(contentLength);
    }

    return originalEnd.call(this, chunk, encoding);
  };

  // Add compression metrics to response headers
  res.on('finish', () => {
    const processingTime = Date.now() - startTime;

    if (originalSize > compressionConfig.threshold) {
      const compressionRatio = compressedSize > 0 ? (originalSize / compressedSize).toFixed(2) : 'N/A';
      const bytesSaved = originalSize - compressedSize;

      // Note: Cannot set headers after response is finished
      // Log compression stats instead of setting headers in finish event

      // Log significant compression achievements
      if (bytesSaved > 1024) { // More than 1KB saved
        console.log(`🗜️  Compression: ${req.path} - ${bytesSaved} bytes saved (${compressionRatio}x) in ${processingTime}ms`);
      }
    }
  });

  next();
};

/**
 * Static asset compression middleware
 */
const staticCompression = compression({
  ...compressionConfig,
  threshold: 512, // Lower threshold for static assets
  level: 9, // Maximum compression for static assets
  filter: (req, res) => {
    // Only compress static assets
    const staticAssetPatterns = [
      '/css/',
      '/js/',
      '/assets/',
      '/static/',
      '/public/'
    ];

    return staticAssetPatterns.some(pattern => req.path.startsWith(pattern));
  }
});

/**
 * API response compression middleware
 */
const apiCompression = compression({
  ...compressionConfig,
  level: 6, // Balanced compression for API responses
  threshold: 1024, // Standard threshold for API responses
  filter: (req, res) => {
    // Only compress API routes
    return req.path.startsWith('/api/') || req.path.startsWith('/auth/');
  }
});

/**
 * Smart compression middleware that chooses the best strategy
 */
const smartCompression = (req, res, next) => {
  // Apply pre-compression metrics
  compressionWithMetrics(req, res, () => {
    // Apply smart compression based on route and content type
    if (req.path.startsWith('/api/') || req.path.startsWith('/auth/')) {
      return apiCompression(req, res, next);
    } else {
      return adaptiveCompression(req, res, next);
    }
  });
};

module.exports = {
  smartCompression,
  adaptiveCompression,
  apiCompression,
  staticCompression,
  compressionConfig,
  shouldSkipCompression
};