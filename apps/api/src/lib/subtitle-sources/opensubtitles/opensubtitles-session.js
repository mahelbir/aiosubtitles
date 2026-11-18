import {isNil, omitBy} from 'es-toolkit';
import {redis} from '../../../redis/index.js';

export const OPENSUBTITLES_TOKEN_TTL = 82800;

export const OPENSUBTITLES_QUOTA_TTL = 300;

const TOKEN_KEY_PREFIX = 'opensubtitles-token:v1:';
const QUOTA_KEY_PREFIX = 'opensubtitles-quota:v1:';

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
    typeof storedSession.baseUrl === 'string'
  );
}

export async function readOpensubtitlesSession(credentialId) {
  const storedSession = await readStoredJson(
    `${TOKEN_KEY_PREFIX}${credentialId}`,
  );
  return isSession(storedSession)
    ? {token: storedSession.token, baseUrl: storedSession.baseUrl}
    : null;
}

export async function storeOpensubtitlesSession(
  credentialId,
  {token, baseUrl},
) {
  await redis.set(
    `${TOKEN_KEY_PREFIX}${credentialId}`,
    JSON.stringify({token, baseUrl}),
    'EX',
    OPENSUBTITLES_TOKEN_TTL,
  );
}

export async function dropOpensubtitlesSession(credentialId) {
  await redis.del(`${TOKEN_KEY_PREFIX}${credentialId}`);
}

export async function readOpensubtitlesQuota(credentialId) {
  return readStoredJson(`${QUOTA_KEY_PREFIX}${credentialId}`);
}

export async function storeOpensubtitlesQuota(credentialId, quota) {
  await redis.mergeOpensubtitlesQuota(
    `${QUOTA_KEY_PREFIX}${credentialId}`,
    JSON.stringify(omitBy(quota, isNil)),
    OPENSUBTITLES_QUOTA_TTL,
  );
}
