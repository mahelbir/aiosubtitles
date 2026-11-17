import {describe, expect, it} from 'vitest';
import {getEnvSchema} from '../../src/config/schema.js';

const schema = getEnvSchema({appPath: '/app'});
const {shape} = schema;

const DB_NAME = 'app';
const DB_CREDENTIALS = {DB_USER: 'owner', DB_PASS: 'secret'};
const EXTERNAL_DB = {DB_HOST: 'db.example.com', ...DB_CREDENTIALS};

const parseEnv = env =>
  schema.safeParse({
    PORT: '3001',
    CORS_ORIGINS: '',
    SECRET_KEY: 'secret-key-of-the-app',
    SECURITY_KEY: 'security-key',
    DB_PORT: '5432',
    DB_NAME,
    REDIS_PORT: '6379',
    ...env,
  });

describe('service keys', () => {
  it('refuses an empty security key', () => {
    expect(shape.SECURITY_KEY.safeParse('').success).toBe(false);
  });

  it('accepts any non-empty security key', () => {
    expect(shape.SECURITY_KEY.safeParse('service-key').success).toBe(true);
  });

  it('refuses an empty secret key', () => {
    expect(shape.SECRET_KEY.safeParse('').success).toBe(false);
  });
});

describe('the database credentials', () => {
  const bundledHost = shape.DB_HOST.parse(undefined);

  it.each([
    ['left unset', {}],
    ['passed empty', {DB_HOST: bundledHost, DB_USER: '', DB_PASS: ''}],
  ])(
    'fall back to the database name on the bundled server when %s',
    (_, env) => {
      expect(parseEnv(env).data).toMatchObject({
        DB_HOST: bundledHost,
        DB_USER: DB_NAME,
        DB_PASS: DB_NAME,
      });
    },
  );

  it('keep what is given for the bundled server', () => {
    expect(parseEnv(DB_CREDENTIALS).data).toMatchObject(DB_CREDENTIALS);
  });

  it('keep what is given for an external server', () => {
    expect(parseEnv(EXTERNAL_DB).data).toMatchObject(EXTERNAL_DB);
  });

  it.each(['DB_USER', 'DB_PASS'])(
    'are required by an external server, so a missing %s fails the boot',
    key => {
      const {success, error} = parseEnv({...EXTERNAL_DB, [key]: ''});
      expect(success).toBe(false);
      expect(error.issues.map(issue => issue.path)).toEqual([[key]]);
    },
  );
});

describe('the API base path', () => {
  const basePath = shape.API_BASE_PATH;

  it('mounts at the root when left unset or set to a bare slash', () => {
    expect(basePath.parse(undefined)).toBe('');
    expect(basePath.parse('/')).toBe('');
  });

  it('drops the trailing slash, so every path joins it the same way', () => {
    expect(basePath.parse(' /api/ ')).toBe('/api');
    expect(basePath.parse('/v1/api')).toBe('/v1/api');
  });

  it('takes a segment that only starts with a dot', () => {
    expect(basePath.parse('/.well-known')).toBe('/.well-known');
  });

  it.each(['api', '/a b', '/a//b', '/api?x=1', '/..', '/./api', '/api/..'])(
    'refuses %j, so a bad path fails the boot',
    value => {
      expect(basePath.safeParse(value).success).toBe(false);
    },
  );
});

describe('the rate limit allow-list', () => {
  const allowList = shape.RATE_LIMIT_ALLOW_LIST;

  it('trusts nobody when left unset', () => {
    expect(allowList.parse(undefined)).toEqual([]);
  });

  it('takes exact addresses and CIDR ranges of either family', () => {
    expect(
      allowList.parse(' 10.9.9.9 , 198.51.100.0/24,2001:db8::1,2001:db8::/48'),
    ).toEqual(['10.9.9.9', '198.51.100.0/24', '2001:db8::1', '2001:db8::/48']);
  });

  it('takes the named ranges the proxy trust setting knows', () => {
    expect(allowList.parse('loopback,uniquelocal')).toEqual([
      'loopback',
      'uniquelocal',
    ]);
  });

  it.each(['10.9.9.9,example.com', '10.9.9.300', '10.0.0.0/33', '::1/129'])(
    'refuses %j, so a bad entry fails the boot',
    value => {
      expect(allowList.safeParse(value).success).toBe(false);
    },
  );
});

describe('the proxy trust setting', () => {
  const trustProxy = shape.TRUST_PROXY;

  it('keeps the boolean and hop-count forms', () => {
    expect(trustProxy.parse(undefined)).toBe(false);
    expect(trustProxy.parse('true')).toBe(true);
    expect(trustProxy.parse('1')).toBe(1);
  });

  it('takes a list of addresses, ranges and named ranges', () => {
    expect(trustProxy.parse('10.0.0.1, 172.16.0.0/12,loopback')).toEqual([
      '10.0.0.1',
      '172.16.0.0/12',
      'loopback',
    ]);
  });

  it('refuses a list with an entry that is no address, so the boot fails', () => {
    expect(trustProxy.safeParse('10.0.0.1,proxy.internal').success).toBe(false);
  });
});
