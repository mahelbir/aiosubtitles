import {isNil, omitBy, pick} from 'es-toolkit';
import {redis} from '../../../redis/index.js';
import {deriveSecretKey, fingerprintSecret} from '../../crypto.js';

export const OPENSUBTITLES_TOKEN_TTL = 82800;

export const OPENSUBTITLES_QUOTA_TTL = 300;

const TOKEN_KEY_PREFIX = 'opensubtitles-token:v1:';
const QUOTA_KEY_PREFIX = 'opensubtitles-quota:v1:';
const SESSION_FIELDS = ['token', 'baseUrl', 'appKeyFingerprint'];

const accountFingerprintKey = deriveSecretKey('opensubtitles-account');

const appKeyFingerprintKey = deriveSecretKey('opensubtitles-app-key');

export function toOpensubtitlesSessionKey({credentialId, username, password}) {
  const accountFingerprint = fingerprintSecret(
    JSON.stringify([username, password]),
    accountFingerprintKey,
  );
  return `${credentialId}:${accountFingerprint}`;
}

export function toOpensubtitlesAppKeyFingerprint(apiKey) {
  return fingerprintSecret(apiKey, appKeyFingerprintKey);
}

redis.defineCommand('mergeOpensubtitlesQuota', {
  numberOfKeys: 1,
  lua: `
    local storedText = redis.call('GET', KEYS[1])
    local quota = storedText and cjson.decode(storedText) or {}
    for fieldName, fieldValue in pairs(cjson.decode(ARGV[1])) do
      quota[fieldName] = fieldValue
    end
    return redis.call('SET', KEYS[1], cjson.encode(quota), 'EX', ARGV[2])
  `,
});

async function readStoredJson(storeKey) {
  const storedText = await redis.get(storeKey);
  if (storedText === null) {
    return null;
  }
  try {
    return JSON.parse(storedText);
  } catch {
    return null;
  }
}

function isSession(storedSession) {
  return (
    typeof storedSession?.token === 'string' &&
    typeof storedSession.baseUrl === 'string' &&
    typeof storedSession.appKeyFingerprint === 'string'
  );
}

export async function readOpensubtitlesSession(sessionKey) {
  const storedSession = await readStoredJson(
    `${TOKEN_KEY_PREFIX}${sessionKey}`,
  );
  return isSession(storedSession) ? pick(storedSession, SESSION_FIELDS) : null;
}

export async function storeOpensubtitlesSession(sessionKey, session) {
  await redis.set(
    `${TOKEN_KEY_PREFIX}${sessionKey}`,
    JSON.stringify(pick(session, SESSION_FIELDS)),
    'EX',
    OPENSUBTITLES_TOKEN_TTL,
  );
}

export async function dropOpensubtitlesSession(sessionKey) {
  await redis.del(`${TOKEN_KEY_PREFIX}${sessionKey}`);
}

export async function readOpensubtitlesQuota(sessionKey) {
  return readStoredJson(`${QUOTA_KEY_PREFIX}${sessionKey}`);
}

export async function storeOpensubtitlesQuota(sessionKey, quota) {
  await redis.mergeOpensubtitlesQuota(
    `${QUOTA_KEY_PREFIX}${sessionKey}`,
    JSON.stringify(omitBy(quota, isNil)),
    OPENSUBTITLES_QUOTA_TTL,
  );
}
