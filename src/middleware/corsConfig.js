const cors = require('cors');
const config = require('../config/env');

/**
 * CORS Configuration
 * Allows requests from specified origins (Android app, web clients, etc.)
 */

const corsOptions = {
  origin: function (origin, callback) {
    // Native mobile apps and some tools send no Origin header
    if (!origin) {
      return callback(null, !!config.allowMobileNoOrigin);
    }

    // Strict exact-match check; ignore wildcard "*" for production hardening
    if (config.allowedOrigins && config.allowedOrigins.length > 0) {
      if (config.allowedOrigins.indexOf(origin) !== -1) {
        return callback(null, true);
      }
    }

    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'X-Admin-Key'
  ]
};

module.exports = cors(corsOptions);
