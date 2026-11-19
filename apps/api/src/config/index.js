import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import {deepFreeze} from 'melperjs';
import {configureZodLocale} from '@repo/shared/lib/locale.js';
import {loadWorkspaceEnv} from '@repo/tooling/env.js';
import {getEnvSchema} from './schema.js';

const appPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const workspacePath = loadWorkspaceEnv(appPath);

const parsed = getEnvSchema({appPath}).safeParse(process.env);
if (!parsed.success) {
  console.error(
    `Invalid environment configuration:\n${z.prettifyError(parsed.error)}`,
  );
  process.exit(1);
}
const env = parsed.data;

configureZodLocale(env.LOCALE);

export const config = deepFreeze({
  env: env.NODE_ENV,
  isDev: env.NODE_ENV === 'development',
  isTest: env.NODE_ENV === 'test',
  isErrorDetailsExposed: env.NODE_ENV !== 'production',

  appPath,
  workspacePath,
  srcPath: path.join(appPath, 'src'),
  clientExportRoot: path.join(appPath, 'public-client'),
  storagePath: env.STORAGE_PATH,
  privateStoragePath: path.join(env.STORAGE_PATH, 'private'),

  port: env.PORT,
  host: env.HOST,
  apiBasePath: env.API_BASE_PATH,

  logLevel: env.LOG_LEVEL,
  requestTimeout: env.REQUEST_TIMEOUT,

  corsOrigins: env.CORS_ORIGINS,
  trustProxy: env.TRUST_PROXY,
  clientIpHeader: env.CLIENT_IP_HEADER,
  clientIpv6Subnet: env.CLIENT_IPV6_SUBNET,

  locale: env.LOCALE,

  rateLimitWindow: env.RATE_LIMIT_WINDOW,
  rateLimitIpMax: env.RATE_LIMIT_IP_MAX,
  rateLimitIpPenalty: env.RATE_LIMIT_IP_PENALTY,
  rateLimitAllowList: env.RATE_LIMIT_ALLOW_LIST,
  isRateLimitHeadersEnabled: env.RATE_LIMIT_HEADERS,
  rateLimitSubtitleListIpMax: env.RATE_LIMIT_SUBTITLE_LIST_IP_MAX,
  rateLimitSubtitleListUserConfigMax:
    env.RATE_LIMIT_SUBTITLE_LIST_USER_CONFIG_MAX,
  rateLimitSubtitleFileIpMax: env.RATE_LIMIT_SUBTITLE_FILE_IP_MAX,
  rateLimitSubtitleFileUserConfigMax:
    env.RATE_LIMIT_SUBTITLE_FILE_USER_CONFIG_MAX,
  rateLimitUserConfigPasswordWindow: env.RATE_LIMIT_USER_CONFIG_PASSWORD_WINDOW,
  rateLimitUserConfigPasswordIpMax: env.RATE_LIMIT_USER_CONFIG_PASSWORD_IP_MAX,
  rateLimitUserConfigPasswordUserConfigMax:
    env.RATE_LIMIT_USER_CONFIG_PASSWORD_USER_CONFIG_MAX,

  secretKey: env.SECRET_KEY,
  bcryptStrength: env.BCRYPT_STRENGTH,

  dbHost: env.DB_HOST,
  dbPort: env.DB_PORT,
  dbName: env.DB_NAME,
  dbUser: env.DB_USER,
  dbPass: env.DB_PASS,
  dbPoolMin: env.DB_POOL_MIN,
  dbPoolMax: env.DB_POOL_MAX,
  dbPoolAcquire: env.DB_POOL_ACQUIRE,

  redisHost: env.REDIS_HOST,
  redisPort: env.REDIS_PORT,
  redisUser: env.REDIS_USER,
  redisPass: env.REDIS_PASS,
  redisDb: env.REDIS_DB,

  subtitleSearchDeadline: env.SUBTITLE_SEARCH_DEADLINE,
  subtitleSearchCacheFreshTtl: env.SUBTITLE_SEARCH_CACHE_FRESH_TTL,
  subtitleSearchCacheStaleTtl: env.SUBTITLE_SEARCH_CACHE_STALE_TTL,
  subtitleBackgroundRateShare: env.SUBTITLE_BACKGROUND_RATE_SHARE,
  subtitleBackgroundQuotaShare: env.SUBTITLE_BACKGROUND_QUOTA_SHARE,
  subtitleBackgroundCandidateMax: env.SUBTITLE_BACKGROUND_CANDIDATE_MAX,
  userConfigCacheTtl: env.USER_CONFIG_CACHE_TTL,
  userConfigSessionTtl: env.USER_CONFIG_SESSION_TTL,
});
