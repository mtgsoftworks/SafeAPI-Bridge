jest.mock('../../src/utils/securityLogger', () => ({
  logSecurityEvent: jest.fn()
}));

const abuseGuardService = require('../../src/services/abuseGuard');
const abuseGuard = require('../../src/middleware/abuseGuard');
const { logSecurityEvent } = require('../../src/utils/securityLogger');

const makeReq = ({
  path = '/wp-blog.php',
  ip = '52.138.6.165',
  userAgent = '',
  authorization = ''
} = {}) => ({
  path,
  url: path,
  originalUrl: path,
  ip,
  headers: {
    ...(userAgent !== undefined && { 'user-agent': userAgent }),
    ...(authorization && { authorization })
  }
});

const makeRes = () => {
  const res = {
    headers: {},
    statusCode: null,
    setHeader: jest.fn((key, value) => {
      res.headers[key] = value;
    }),
    status: jest.fn((statusCode) => {
      res.statusCode = statusCode;
      return res;
    }),
    json: jest.fn((body) => {
      res.body = body;
      return res;
    }),
    end: jest.fn(() => res)
  };

  return res;
};

describe('abuseGuard', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    abuseGuardService.resetForTests();
    process.env = {
      ...originalEnv,
      ABUSE_GUARD_ENABLED: 'true',
      ABUSE_GUARD_STRIKE_THRESHOLD: '3',
      ABUSE_GUARD_WINDOW_MS: '600000',
      ABUSE_GUARD_BLOCK_MS: '3600000',
      ABUSE_GUARD_BLOCK_AUTHENTICATED: 'false'
    };
  });

  afterAll(() => {
    process.env = originalEnv;
    abuseGuardService.resetForTests();
  });

  test('classifies WordPress and PHP probes', () => {
    const result = abuseGuardService.classifyRequestPath('/wp-content/themes/index.php');

    expect(result.isProbe).toBe(true);
    expect(result.reasons).toEqual(expect.arrayContaining(['WORDPRESS_PROBE', 'PHP_PROBE']));
  });

  test('preserves double-slash WordPress probe paths', () => {
    const result = abuseGuardService.classifyRequestPath('//wp-includes/js/jquery/');

    expect(result.path).toBe('//wp-includes/js/jquery/');
    expect(result.isProbe).toBe(true);
    expect(result.reasons).toEqual(expect.arrayContaining(['WORDPRESS_PROBE', 'DOUBLE_SLASH_PATH']));
  });

  test('does not treat missing user-agent alone as a probe', () => {
    const req = makeReq({ path: '/api/openai/endpoints', userAgent: '' });
    const decision = abuseGuardService.checkRequest(req);

    expect(decision.action).toBe('allow');
    expect(decision.analysis.missingUserAgent).toBe(true);
    expect(decision.analysis.isProbe).toBe(false);
  });

  test('blocks scanner probes with minimal 404', () => {
    const req = makeReq({ path: '/wp-blog.php', userAgent: '' });
    const res = makeRes();
    const next = jest.fn();

    abuseGuard(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.end).toHaveBeenCalled();
    expect(logSecurityEvent).toHaveBeenCalledWith(
      'SCANNER_PROBE_DETECTED',
      expect.objectContaining({
        ip: '52.138.6.165',
        path: '/wp-blog.php',
        reasons: expect.arrayContaining(['WORDPRESS_PROBE', 'PHP_PROBE', 'MISSING_USER_AGENT'])
      })
    );
  });

  test('temporarily blocks an IP after repeated probes', () => {
    for (let i = 0; i < 3; i++) {
      abuseGuardService.checkRequest(makeReq({ path: `/wp-${i}.php` }));
    }

    const blocks = abuseGuardService.listBlocks();

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual(expect.objectContaining({
      ip: '52.138.6.165',
      reason: 'scanner_probe_threshold',
      strikes: 3
    }));
  });

  test('lets authenticated app paths bypass temporary blocks by default', () => {
    for (let i = 0; i < 3; i++) {
      abuseGuardService.checkRequest(makeReq({ path: `/wp-${i}.php` }));
    }

    const req = makeReq({
      path: '/api/openai/proxy',
      authorization: 'Bearer valid-looking-token',
      userAgent: ''
    });
    const decision = abuseGuardService.checkRequest(req);

    expect(decision.action).toBe('allow');
  });

  test('does not let bearer headers bypass scanner probe blocking', () => {
    for (let i = 0; i < 3; i++) {
      abuseGuardService.checkRequest(makeReq({ path: `/wp-${i}.php` }));
    }

    const req = makeReq({
      path: '/wp-content/admin.php',
      authorization: 'Bearer any-token',
      userAgent: ''
    });
    const decision = abuseGuardService.checkRequest(req);

    expect(decision.action).toBe('block');
    expect(decision.status).toBe(404);
  });

  test('can remove a temporary block', () => {
    for (let i = 0; i < 3; i++) {
      abuseGuardService.checkRequest(makeReq({ path: `/wp-${i}.php` }));
    }

    expect(abuseGuardService.unblockIp('52.138.6.165')).toBe(true);
    expect(abuseGuardService.listBlocks()).toHaveLength(0);
  });
});
