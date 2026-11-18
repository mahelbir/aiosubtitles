import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import {deepFreeze} from 'melperjs';
import {configureZodLocale} from '@repo/shared/lib/locale.js';
import {loadWorkspaceEnv} from '@repo/tooling/env.js';
import {getAppVersion} from '@repo/tooling/workspace.js';
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
  appVersion: getAppVersion(),
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
  publicStoragePath: path.join(env.STORAGE_PATH, 'public'),

  port: env.PORT,
  host: env.HOST,
  apiBasePath: env.API_BASE_PATH,

  logLevel: env.LOG_LEVEL,
  requestTimeout: env.REQUEST_TIMEOUT,

  corsOrigins: env.CORS_ORIGINS,
  trustProxy: env.TRUST_PROXY,
  clientIpHeader: env.CLIENT_IP_HEADER,
  clientIpv6Subnet: env.CLIENT_IPV6_SUBNET,

  timezone: env.TIMEZONE,
  locale: env.LOCALE,

  rateLimitWindow: env.RATE_LIMIT_WINDOW,
  rateLimitIpMax: env.RATE_LIMIT_IP_MAX,
  rateLimitIpPenalty: env.RATE_LIMIT_IP_PENALTY,
  rateLimitAllowList: env.RATE_LIMIT_ALLOW_LIST,
  isRateLimitHeadersEnabled: env.RATE_LIMIT_HEADERS,

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

  opensubtitlesApiKey: env.OPENSUBTITLES_API_KEY,
  stremioCommunitySubtitlesToken: env.STREMIO_COMMUNITY_SUBTITLES_TOKEN,
  subtitleSearchDeadline: env.SUBTITLE_SEARCH_DEADLINE,
  subtitleSearchCacheFreshTtl: env.SUBTITLE_SEARCH_CACHE_FRESH_TTL,
  subtitleSearchCacheStaleTtl: env.SUBTITLE_SEARCH_CACHE_STALE_TTL,
  userConfigCacheTtl: env.USER_CONFIG_CACHE_TTL,
  userConfigSessionTtl: env.USER_CONFIG_SESSION_TTL,
  subtitleSourceBackgroundShare: env.SUBTITLE_SOURCE_BACKGROUND_SHARE,
  opensubtitlesQuotaCandidateMax: env.OPENSUBTITLES_QUOTA_CANDIDATE_MAX,
  opensubtitlesQuotaViewerShare: env.OPENSUBTITLES_QUOTA_VIEWER_SHARE,
  subtitleListRateLimitIpMax: env.SUBTITLE_LIST_RATE_LIMIT_IP_MAX,
  subtitleListRateLimitUserConfigMax:
    env.SUBTITLE_LIST_RATE_LIMIT_USER_CONFIG_MAX,
  subtitleFileRateLimitIpMax: env.SUBTITLE_FILE_RATE_LIMIT_IP_MAX,
  subtitleFileRateLimitUserConfigMax:
    env.SUBTITLE_FILE_RATE_LIMIT_USER_CONFIG_MAX,
  userConfigPasswordRateLimitWindow: env.USER_CONFIG_PASSWORD_RATE_LIMIT_WINDOW,
  userConfigPasswordRateLimitIpMax: env.USER_CONFIG_PASSWORD_RATE_LIMIT_IP_MAX,
  userConfigPasswordRateLimitUserConfigMax:
    env.USER_CONFIG_PASSWORD_RATE_LIMIT_USER_CONFIG_MAX,
});
