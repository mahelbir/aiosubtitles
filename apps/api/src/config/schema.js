import * as path from 'node:path';
import {attempt, trimEnd} from 'es-toolkit';
import {splitTrim} from 'melperjs';
import proxyAddr from 'proxy-addr';
import {z} from 'zod';
import {getCrossFieldCheck, portField} from '@repo/shared/schemas/common.js';
import {DEFAULT_LOCALE, DEFAULT_TIMEZONE} from '@repo/shared/constants/app.js';
import {RateLimitPenalty} from '../lib/rate-limit.js';

const ADDRESS_LIST_MESSAGE =
  'Must list IP addresses, CIDR ranges or named ranges';
const BUNDLED_DB_HOST = 'network-alias-postgres';
const SUBTITLE_SEARCH_DEADLINE_MIN = 1000;
const SUBTITLE_SEARCH_DEADLINE_MAX = 9000;

const ttlField = z.coerce.number().int().nonnegative();
const positiveIntField = z.coerce.number().int().positive();
const shareField = z.coerce.number().min(0).max(1);

const rateLimitPenaltyField = z.preprocess(
  value => value?.trim() || undefined,
  z.enum(RateLimitPenalty.values).default(RateLimitPenalty.NONE),
);

export const basePathField = z
  .string()
  .trim()
  .overwrite(value => trimEnd(value, '/'))
  .regex(
    /^(\/(?!\.{1,2}(?:\/|$))[\w.~-]+)*$/,
    'Must be empty or a path such as /api',
  );

const isAddressList = list =>
  attempt(() => proxyAddr.compile(list))[0] === null;

const isBundledDb = env => env.DB_HOST === BUNDLED_DB_HOST;

function getDbCredentialCheck(key) {
  return getCrossFieldCheck(
    ['DB_HOST', key],
    env => isBundledDb(env) || env[key] !== '',
    {
      message: 'Required when DB_HOST points to an external database',
      path: [key],
    },
  );
}

function getSubtitleSearchCacheCheck() {
  return getCrossFieldCheck(
    ['SUBTITLE_SEARCH_CACHE_FRESH_TTL', 'SUBTITLE_SEARCH_CACHE_STALE_TTL'],
    env =>
      env.SUBTITLE_SEARCH_CACHE_STALE_TTL >=
      env.SUBTITLE_SEARCH_CACHE_FRESH_TTL,
    {
      message: 'Must be at least SUBTITLE_SEARCH_CACHE_FRESH_TTL',
      path: ['SUBTITLE_SEARCH_CACHE_STALE_TTL'],
    },
  );
}

function fillBundledDbCredentials(env) {
  if (!isBundledDb(env)) {
    return env;
  }
  return {
    ...env,
    DB_USER: env.DB_USER || env.DB_NAME,
    DB_PASS: env.DB_PASS || env.DB_NAME,
  };
}

export function getEnvSchema({appPath}) {
  const schema = z.object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: portField,
    HOST: z.string().trim().default('0.0.0.0'),
    API_BASE_PATH: basePathField.default(''),

    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
      .default('error'),
    REQUEST_TIMEOUT: z.coerce.number().int().nonnegative().default(120000),

    CORS_ORIGINS: z.string().transform(value => splitTrim(value, ',')),
    TRUST_PROXY: z
      .string()
      .trim()
      .default('false')
      .transform(value => {
        if (value === 'true' || value === 'false') {
          return value === 'true';
        }
        return /^\d+$/.test(value) ? Number(value) : splitTrim(value, ',');
      })
      .refine(
        value => !Array.isArray(value) || isAddressList(value),
        ADDRESS_LIST_MESSAGE,
      ),
    CLIENT_IP_HEADER: z
      .string()
      .default('')
      .transform(value => value.trim().toLowerCase()),
    CLIENT_IPV6_SUBNET: z.coerce.number().int().min(1).max(128).default(64),

    TIMEZONE: z.string().trim().default(DEFAULT_TIMEZONE),
    LOCALE: z.string().trim().default(DEFAULT_LOCALE),

    STORAGE_PATH: z
      .string()
      .trim()
      .refine(path.isAbsolute, 'Must be an absolute path')
      .default(path.join(appPath, 'storage')),

    SECRET_KEY: z.string().min(16),
    BCRYPT_STRENGTH: z.coerce.number().int().min(4).max(31).default(12),

    RATE_LIMIT_WINDOW: z.coerce.number().int().nonnegative().default(60000),
    RATE_LIMIT_IP_MAX: z.coerce.number().int().positive().default(3000),
    RATE_LIMIT_IP_PENALTY: rateLimitPenaltyField,
    RATE_LIMIT_ALLOW_LIST: z
      .string()
      .default('')
      .transform(value => splitTrim(value, ','))
      .refine(isAddressList, ADDRESS_LIST_MESSAGE),
    RATE_LIMIT_HEADERS: z.stringbool().default(false),

    DB_HOST: z.string().trim().default(BUNDLED_DB_HOST),
    DB_PORT: portField,
    DB_NAME: z.string().trim().min(1),
    DB_USER: z.string().default(''),
    DB_PASS: z.string().default(''),
    DB_POOL_MIN: z.coerce.number().int().positive().default(5),
    DB_POOL_MAX: z.coerce.number().int().positive().default(20),
    DB_POOL_ACQUIRE: z.coerce.number().int().positive().default(10000),

    REDIS_HOST: z.string().trim().default('network-alias-redis'),
    REDIS_PORT: portField,
    REDIS_USER: z.string().default(''),
    REDIS_PASS: z.string().default(''),
    REDIS_DB: z.coerce.number().int().nonnegative().default(0),
    REDIS_MAXMEMORY: z
      .string()
      .trim()
      .regex(/^\d+(?:[kmg]b?)?$/i, 'Must be a size such as 512mb or 1gb')
      .default('512mb'),

    OPENSUBTITLES_API_KEY: z.string().default(''),
    SUBTITLE_SEARCH_DEADLINE: z.coerce
      .number()
      .int()
      .min(SUBTITLE_SEARCH_DEADLINE_MIN)
      .max(SUBTITLE_SEARCH_DEADLINE_MAX)
      .default(7000),
    SUBTITLE_SEARCH_CACHE_FRESH_TTL: ttlField.default(21600),
    SUBTITLE_SEARCH_CACHE_STALE_TTL: positiveIntField.default(2592000),
    USER_CONFIG_CACHE_TTL: ttlField.default(60),
    USER_CONFIG_SESSION_TTL: positiveIntField.default(1800),
    SUBTITLE_SOURCE_BACKGROUND_SHARE: shareField.default(0.5),
    OPENSUBTITLES_QUOTA_CANDIDATE_MAX: positiveIntField.default(3),
    OPENSUBTITLES_QUOTA_VIEWER_SHARE: shareField.default(0.5),
    SUBTITLE_LIST_RATE_LIMIT_IP_MAX: positiveIntField.default(60),
    SUBTITLE_LIST_RATE_LIMIT_USER_CONFIG_MAX: positiveIntField.default(30),
    SUBTITLE_FILE_RATE_LIMIT_IP_MAX: positiveIntField.default(60),
    SUBTITLE_FILE_RATE_LIMIT_USER_CONFIG_MAX: positiveIntField.default(30),
    USER_CONFIG_PASSWORD_RATE_LIMIT_WINDOW: positiveIntField.default(900000),
    USER_CONFIG_PASSWORD_RATE_LIMIT_IP_MAX: positiveIntField.default(20),
    USER_CONFIG_PASSWORD_RATE_LIMIT_USER_CONFIG_MAX:
      positiveIntField.default(5),
  });

  return schema
    .check(
      getDbCredentialCheck('DB_USER'),
      getDbCredentialCheck('DB_PASS'),
      getSubtitleSearchCacheCheck(),
    )
    .overwrite(fillBundledDbCredentials);
}
