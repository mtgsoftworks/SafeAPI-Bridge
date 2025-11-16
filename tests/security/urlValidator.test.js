const { validateURL, isPublicIP, isIPAddress } = require('../../src/utils/urlValidator');

describe('URL Validator - SSRF Protection', () => {
  describe('validateURL', () => {
    describe('Valid URLs', () => {
      test('should accept valid HTTPS URLs', () => {
        const result = validateURL('https://example.com/webhook');
        expect(result.valid).toBe(true);
        expect(result.error).toBeNull();
      });

      test('should accept HTTP URLs in development', () => {
        process.env.NODE_ENV = 'development';
        const result = validateURL('http://example.com/webhook');
        expect(result.valid).toBe(true);
      });

      test('should accept URLs with ports', () => {
        const result = validateURL('https://example.com:8080/webhook');
        expect(result.valid).toBe(true);
      });

      test('should accept URLs with paths and query params', () => {
        const result = validateURL('https://api.example.com/v1/hooks?token=abc123');
        expect(result.valid).toBe(true);
      });
    });

    describe('SSRF Prevention - Localhost', () => {
      test('should block localhost', () => {
        const result = validateURL('https://localhost/webhook');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Localhost');
      });

      test('should block 127.0.0.1', () => {
        const result = validateURL('https://127.0.0.1/webhook');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Localhost');
      });

      test('should block 0.0.0.0', () => {
        const result = validateURL('https://0.0.0.0/webhook');
        expect(result.valid).toBe(false);
      });

      test('should block IPv6 localhost', () => {
        const result = validateURL('https://[::1]/webhook');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Localhost');
      });
    });

    describe('SSRF Prevention - Private IPs', () => {
      test('should block 10.x.x.x (Class A private)', () => {
        const result = validateURL('https://10.0.0.1/webhook');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Private IP');
      });

      test('should block 192.168.x.x (Class C private)', () => {
        const result = validateURL('https://192.168.1.1/webhook');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Private IP');
      });

      test('should block 172.16.x.x - 172.31.x.x (Class B private)', () => {
        expect(validateURL('https://172.16.0.1/webhook').valid).toBe(false);
        expect(validateURL('https://172.31.255.255/webhook').valid).toBe(false);
      });

      test('should block link-local addresses (169.254.x.x)', () => {
        const result = validateURL('https://169.254.0.1/webhook');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Private IP');
      });
    });

    describe('SSRF Prevention - Cloud Metadata', () => {
      test('should block AWS metadata service', () => {
        const result = validateURL('http://169.254.169.254/latest/meta-data/');
        expect(result.valid).toBe(false);
      });

      test('should block GCP metadata service', () => {
        const result = validateURL('http://metadata.google.internal/');
        expect(result.valid).toBe(false);
      });

      test('should block Alibaba Cloud metadata', () => {
        const result = validateURL('http://100.100.100.200/latest/meta-data/');
        expect(result.valid).toBe(false);
      });
    });

    describe('Protocol Validation', () => {
      test('should reject file:// protocol', () => {
        const result = validateURL('file:///etc/passwd');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Protocol');
      });

      test('should reject ftp:// protocol', () => {
        const result = validateURL('ftp://example.com/file');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Protocol');
      });

      test('should reject gopher:// protocol', () => {
        const result = validateURL('gopher://example.com');
        expect(result.valid).toBe(false);
      });
    });

    describe('Input Validation', () => {
      test('should reject empty strings', () => {
        const result = validateURL('');
        expect(result.valid).toBe(false);
      });

      test('should reject null', () => {
        const result = validateURL(null);
        expect(result.valid).toBe(false);
      });

      test('should reject undefined', () => {
        const result = validateURL(undefined);
        expect(result.valid).toBe(false);
      });

      test('should reject non-string inputs', () => {
        expect(validateURL(123).valid).toBe(false);
        expect(validateURL({}).valid).toBe(false);
        expect(validateURL([]).valid).toBe(false);
      });

      test('should reject URLs longer than 2048 characters', () => {
        const longUrl = 'https://example.com/' + 'a'.repeat(2100);
        const result = validateURL(longUrl);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('too long');
      });

      test('should reject malformed URLs', () => {
        expect(validateURL('not-a-url').valid).toBe(false);
        expect(validateURL('http://').valid).toBe(false);
        expect(validateURL('://example.com').valid).toBe(false);
      });
    });

    describe('Suspicious Patterns', () => {
      test('should reject URLs with path traversal', () => {
        const result = validateURL('https://example..com/webhook');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Suspicious');
      });

      test('should reject URLs with null bytes', () => {
        const result = validateURL('https://example.com%00/webhook');
        expect(result.valid).toBe(false);
      });
    });
  });

  describe('isIPAddress', () => {
    test('should identify IPv4 addresses', () => {
      expect(isIPAddress('192.168.1.1')).toBe(true);
      expect(isIPAddress('10.0.0.1')).toBe(true);
      expect(isIPAddress('127.0.0.1')).toBe(true);
    });

    test('should identify IPv6 addresses', () => {
      expect(isIPAddress('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(true);
      expect(isIPAddress('::1')).toBe(true);
    });

    test('should reject non-IP addresses', () => {
      expect(isIPAddress('example.com')).toBe(false);
      expect(isIPAddress('localhost')).toBe(false);
      expect(isIPAddress('not-an-ip')).toBe(false);
    });
  });

  describe('isPublicIP', () => {
    test('should accept public IPv4 addresses', () => {
      expect(isPublicIP('8.8.8.8')).toBe(true); // Google DNS
      expect(isPublicIP('1.1.1.1')).toBe(true); // Cloudflare DNS
    });

    test('should reject private IP ranges', () => {
      expect(isPublicIP('10.0.0.1')).toBe(false);
      expect(isPublicIP('192.168.1.1')).toBe(false);
      expect(isPublicIP('172.16.0.1')).toBe(false);
    });

    test('should reject localhost', () => {
      expect(isPublicIP('127.0.0.1')).toBe(false);
      expect(isPublicIP('0.0.0.0')).toBe(false);
    });

    test('should reject metadata service IPs', () => {
      expect(isPublicIP('169.254.169.254')).toBe(false);
    });
  });
});
