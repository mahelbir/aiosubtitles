import {afterEach, describe, expect, it, vi} from 'vitest';
import {config} from '../../src/config/index.js';
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
    DB_PORT: '5432',
    DB_NAME,
    REDIS_PORT: '6379',
    ...env,
  });

describe('service keys', () => {
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

describe('the subtitle service keys', () => {
  it('fall back to their defaults when left unset', () => {
    expect(parseEnv({}).data).toMatchObject({
      OPENSUBTITLES_API_KEY: '',
      SUBTITLE_SEARCH_DEADLINE: 7000,
      SUBTITLE_SEARCH_CACHE_FRESH_TTL: 21600,
      SUBTITLE_SEARCH_CACHE_STALE_TTL: 2592000,
      USER_CONFIG_CACHE_TTL: 60,
      USER_CONFIG_SESSION_TTL: 1800,
      SUBTITLE_SOURCE_BACKGROUND_SHARE: 0.5,
      LIST_IMPROVEMENT_CANDIDATE_MAX: 3,
      LIST_IMPROVEMENT_VIEWER_SHARE: 0.5,
      SUBTITLE_LIST_RATE_LIMIT_IP_MAX: 60,
      SUBTITLE_LIST_RATE_LIMIT_USER_CONFIG_MAX: 30,
      SUBTITLE_FILE_RATE_LIMIT_IP_MAX: 60,
      SUBTITLE_FILE_RATE_LIMIT_USER_CONFIG_MAX: 30,
      USER_CONFIG_PASSWORD_RATE_LIMIT_WINDOW: 900000,
      USER_CONFIG_PASSWORD_RATE_LIMIT_IP_MAX: 20,
      USER_CONFIG_PASSWORD_RATE_LIMIT_USER_CONFIG_MAX: 5,
    });
  });

  it.each(['9001', '999'])(
    'refuse a search deadline of %s ms, so the boot fails',
    deadline => {
      const {success, error} = parseEnv({SUBTITLE_SEARCH_DEADLINE: deadline});
      expect(success).toBe(false);
      expect(error.issues.map(issue => issue.path)).toEqual([
        ['SUBTITLE_SEARCH_DEADLINE'],
      ]);
    },
  );

  it('take a search deadline at either end of its range', () => {
    expect(parseEnv({SUBTITLE_SEARCH_DEADLINE: '1000'}).data).toMatchObject({
      SUBTITLE_SEARCH_DEADLINE: 1000,
    });
    expect(parseEnv({SUBTITLE_SEARCH_DEADLINE: '9000'}).data).toMatchObject({
      SUBTITLE_SEARCH_DEADLINE: 9000,
    });
  });

  it('refuse a stale search cache that ends before the fresh one', () => {
    const {success, error} = parseEnv({SUBTITLE_SEARCH_CACHE_STALE_TTL: '10'});
    expect(success).toBe(false);
    expect(error.issues.map(issue => issue.path)).toEqual([
      ['SUBTITLE_SEARCH_CACHE_STALE_TTL'],
    ]);
  });

  it('refuse a stale search cache of zero seconds, even beside a zero fresh one', () => {
    const {success, error} = parseEnv({
      SUBTITLE_SEARCH_CACHE_FRESH_TTL: '0',
      SUBTITLE_SEARCH_CACHE_STALE_TTL: '0',
    });
    expect(success).toBe(false);
    expect(error.issues.map(issue => issue.path)).toEqual([
      ['SUBTITLE_SEARCH_CACHE_STALE_TTL'],
    ]);
  });

  it('refuse a background share above one', () => {
    const {success, error} = parseEnv({
      SUBTITLE_SOURCE_BACKGROUND_SHARE: '1.5',
    });
    expect(success).toBe(false);
    expect(error.issues.map(issue => issue.path)).toEqual([
      ['SUBTITLE_SOURCE_BACKGROUND_SHARE'],
    ]);
  });

  it('know no shared Community Subtitles token', () => {
    expect(
      parseEnv({STREMIO_COMMUNITY_SUBTITLES_TOKEN: 'shared-token'}).data,
    ).not.toHaveProperty('STREMIO_COMMUNITY_SUBTITLES_TOKEN');
    expect(config).not.toHaveProperty('stremioCommunitySubtitlesToken');
  });

  it('keep the OpenSubtitles API key untrimmed, since a secret may end in a space', () => {
    expect(parseEnv({OPENSUBTITLES_API_KEY: ' k '}).data).toMatchObject({
      OPENSUBTITLES_API_KEY: ' k ',
    });
  });

  it('read no OpenSubtitles-only list improvement key, keeping the defaults', () => {
    const {data} = parseEnv({
      OPENSUBTITLES_QUOTA_CANDIDATE_MAX: '9',
      OPENSUBTITLES_QUOTA_VIEWER_SHARE: '0.12',
    });

    expect(data).toMatchObject({
      LIST_IMPROVEMENT_CANDIDATE_MAX: 3,
      LIST_IMPROVEMENT_VIEWER_SHARE: 0.5,
    });
    expect(data).not.toHaveProperty('OPENSUBTITLES_QUOTA_CANDIDATE_MAX');
    expect(data).not.toHaveProperty('OPENSUBTITLES_QUOTA_VIEWER_SHARE');
  });

  it('reach the config object under their camelCase names', () => {
    expect(Object.keys(config)).toEqual(
      expect.arrayContaining([
        'opensubtitlesApiKey',
        'subtitleSearchDeadline',
        'subtitleSearchCacheFreshTtl',
        'subtitleSearchCacheStaleTtl',
        'userConfigCacheTtl',
        'userConfigSessionTtl',
        'subtitleSourceBackgroundShare',
        'listImprovementCandidateMax',
        'listImprovementViewerShare',
        'subtitleListRateLimitIpMax',
        'subtitleListRateLimitUserConfigMax',
        'subtitleFileRateLimitIpMax',
        'subtitleFileRateLimitUserConfigMax',
        'userConfigPasswordRateLimitWindow',
        'userConfigPasswordRateLimitIpMax',
        'userConfigPasswordRateLimitUserConfigMax',
      ]),
    );
  });

  describe('when each key holds a value of its own', () => {
    const distinctEnv = {
      OPENSUBTITLES_API_KEY: 'distinct-opensubtitles-api-key',
      SUBTITLE_SEARCH_DEADLINE: '1001',
      SUBTITLE_SEARCH_CACHE_FRESH_TTL: '1002',
      SUBTITLE_SEARCH_CACHE_STALE_TTL: '1003',
      USER_CONFIG_CACHE_TTL: '1004',
      USER_CONFIG_SESSION_TTL: '1005',
      SUBTITLE_SOURCE_BACKGROUND_SHARE: '0.11',
      LIST_IMPROVEMENT_CANDIDATE_MAX: '1006',
      LIST_IMPROVEMENT_VIEWER_SHARE: '0.12',
      SUBTITLE_LIST_RATE_LIMIT_IP_MAX: '1007',
      SUBTITLE_LIST_RATE_LIMIT_USER_CONFIG_MAX: '1008',
      SUBTITLE_FILE_RATE_LIMIT_IP_MAX: '1009',
      SUBTITLE_FILE_RATE_LIMIT_USER_CONFIG_MAX: '1010',
      USER_CONFIG_PASSWORD_RATE_LIMIT_WINDOW: '1011',
      USER_CONFIG_PASSWORD_RATE_LIMIT_IP_MAX: '1012',
      USER_CONFIG_PASSWORD_RATE_LIMIT_USER_CONFIG_MAX: '1013',
    };

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.resetModules();
    });

    it('map each one to its own camelCase name', async () => {
      for (const [envKey, envValue] of Object.entries(distinctEnv)) {
        vi.stubEnv(envKey, envValue);
      }
      vi.resetModules();

      const {config: distinctConfig} =
        await import('../../src/config/index.js');

      expect(distinctConfig).toMatchObject({
        opensubtitlesApiKey: 'distinct-opensubtitles-api-key',
        subtitleSearchDeadline: 1001,
        subtitleSearchCacheFreshTtl: 1002,
        subtitleSearchCacheStaleTtl: 1003,
        userConfigCacheTtl: 1004,
        userConfigSessionTtl: 1005,
        subtitleSourceBackgroundShare: 0.11,
        listImprovementCandidateMax: 1006,
        listImprovementViewerShare: 0.12,
        subtitleListRateLimitIpMax: 1007,
        subtitleListRateLimitUserConfigMax: 1008,
        subtitleFileRateLimitIpMax: 1009,
        subtitleFileRateLimitUserConfigMax: 1010,
        userConfigPasswordRateLimitWindow: 1011,
        userConfigPasswordRateLimitIpMax: 1012,
        userConfigPasswordRateLimitUserConfigMax: 1013,
      });
    });
  });
});

describe('the Valkey memory cap', () => {
  const redisMaxmemory = shape.REDIS_MAXMEMORY;

  it('caps the bundled server at 512 MB when left unset', () => {
    expect(redisMaxmemory.parse(undefined)).toBe('512mb');
  });

  it.each(['1gb', '256MB', '100000000', '2g'])(
    'takes %j, a size Valkey reads',
    size => {
      expect(redisMaxmemory.safeParse(size).success).toBe(true);
    },
  );

  it.each(['', 'lots', '1.5gb', '-1gb', '1tb'])(
    'refuses %j, so the boot fails',
    size => {
      expect(redisMaxmemory.safeParse(size).success).toBe(false);
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
