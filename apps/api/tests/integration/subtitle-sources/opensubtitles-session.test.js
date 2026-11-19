import crypto from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {
  OPENSUBTITLES_QUOTA_TTL,
  OPENSUBTITLES_TOKEN_TTL,
  dropOpensubtitlesSession,
  readOpensubtitlesQuota,
  readOpensubtitlesSession,
  storeOpensubtitlesQuota,
  storeOpensubtitlesSession,
  toOpensubtitlesAppKeyFingerprint,
} from '../../../src/lib/subtitle-sources/opensubtitles/opensubtitles-session.js';
import {redis} from '../../../src/redis/index.js';

const RESET_AT = '2026-11-19T00:00:00.000Z';
const APP_KEY = 'fixture-opensubtitles-app-key';
const session = {
  token: 'fixture-opensubtitles-token',
  baseUrl: 'https://vip-api.opensubtitles.com/api/v1',
  appKeyFingerprint: toOpensubtitlesAppKeyFingerprint(APP_KEY),
};

function toTokenKey(credentialId) {
  return `opensubtitles-token:v1:${credentialId}`;
}

function toQuotaKey(credentialId) {
  return `opensubtitles-quota:v1:${credentialId}`;
}

async function readStoredJson(storeKey) {
  return JSON.parse(await redis.get(storeKey));
}

describe('the OpenSubtitles session store', () => {
  it('keeps a token just under a day', () => {
    expect(OPENSUBTITLES_TOKEN_TTL).toBe(82800);
  });

  it('stores a session under the credential with the token lifetime', async () => {
    const credentialId = crypto.randomUUID();

    await storeOpensubtitlesSession(credentialId, session);

    expect(await readStoredJson(toTokenKey(credentialId))).toEqual(session);
    const tokenTtl = await redis.ttl(toTokenKey(credentialId));
    expect(tokenTtl).toBeGreaterThan(OPENSUBTITLES_TOKEN_TTL - 60);
    expect(tokenTtl).toBeLessThanOrEqual(OPENSUBTITLES_TOKEN_TTL);
    expect(await readOpensubtitlesSession(credentialId)).toEqual(session);
  });

  it('keeps a fingerprint of the app key that logged the session in, never the key', async () => {
    const credentialId = crypto.randomUUID();

    await storeOpensubtitlesSession(credentialId, session);

    expect(await redis.get(toTokenKey(credentialId))).not.toContain(APP_KEY);
    expect(session.appKeyFingerprint).not.toBe(
      toOpensubtitlesAppKeyFingerprint('another-app-key'),
    );
  });

  it('reads a session stored without its app key fingerprint as none', async () => {
    const credentialId = crypto.randomUUID();
    await redis.set(
      toTokenKey(credentialId),
      JSON.stringify({token: session.token, baseUrl: session.baseUrl}),
    );

    expect(await readOpensubtitlesSession(credentialId)).toBeNull();
  });

  it('reads no session for a credential that never logged in', async () => {
    expect(await readOpensubtitlesSession(crypto.randomUUID())).toBeNull();
  });

  it('drops one credential session and leaves the others', async () => {
    const credentialId = crypto.randomUUID();
    const otherCredentialId = crypto.randomUUID();
    await Promise.all([
      storeOpensubtitlesSession(credentialId, session),
      storeOpensubtitlesSession(otherCredentialId, session),
    ]);

    await dropOpensubtitlesSession(credentialId);

    expect(await redis.exists(toTokenKey(credentialId))).toBe(0);
    expect(await readOpensubtitlesSession(credentialId)).toBeNull();
    expect(await readOpensubtitlesSession(otherCredentialId)).toEqual(session);
  });
});

describe('the OpenSubtitles quota store', () => {
  it('keeps a quota for five minutes', () => {
    expect(OPENSUBTITLES_QUOTA_TTL).toBe(300);
  });

  it('stores the quota a download reports', async () => {
    const credentialId = crypto.randomUUID();

    await storeOpensubtitlesQuota(credentialId, {
      quotaRemainingCount: 17,
      quotaResetAt: RESET_AT,
    });

    expect(await readStoredJson(toQuotaKey(credentialId))).toMatchObject({
      quotaRemainingCount: 17,
      quotaResetAt: RESET_AT,
    });
    const quotaTtl = await redis.ttl(toQuotaKey(credentialId));
    expect(quotaTtl).toBeGreaterThan(0);
    expect(quotaTtl).toBeLessThanOrEqual(OPENSUBTITLES_QUOTA_TTL);
  });

  it('merges a download report into the quota read before it', async () => {
    const credentialId = crypto.randomUUID();
    await storeOpensubtitlesQuota(credentialId, {
      quotaRemainingCount: 20,
      quotaAllowedCount: 20,
      quotaResetAt: null,
    });

    await storeOpensubtitlesQuota(credentialId, {
      quotaRemainingCount: 17,
      quotaResetAt: RESET_AT,
    });

    expect(await readOpensubtitlesQuota(credentialId)).toEqual({
      quotaRemainingCount: 17,
      quotaAllowedCount: 20,
      quotaResetAt: RESET_AT,
    });
  });

  it('keeps a stored count that a later report leaves out', async () => {
    const credentialId = crypto.randomUUID();
    await storeOpensubtitlesQuota(credentialId, {
      quotaRemainingCount: 17,
      quotaAllowedCount: 20,
      quotaResetAt: RESET_AT,
    });

    await storeOpensubtitlesQuota(credentialId, {
      quotaRemainingCount: null,
      quotaResetAt: undefined,
    });

    expect(await readOpensubtitlesQuota(credentialId)).toEqual({
      quotaRemainingCount: 17,
      quotaAllowedCount: 20,
      quotaResetAt: RESET_AT,
    });
  });

  it('merges two reports written together', async () => {
    const credentialId = crypto.randomUUID();

    await Promise.all([
      storeOpensubtitlesQuota(credentialId, {quotaAllowedCount: 20}),
      storeOpensubtitlesQuota(credentialId, {quotaRemainingCount: 17}),
      storeOpensubtitlesQuota(credentialId, {quotaResetAt: RESET_AT}),
    ]);

    expect(await readOpensubtitlesQuota(credentialId)).toEqual({
      quotaRemainingCount: 17,
      quotaAllowedCount: 20,
      quotaResetAt: RESET_AT,
    });
  });

  it('keeps a spent quota at zero', async () => {
    const credentialId = crypto.randomUUID();

    await storeOpensubtitlesQuota(credentialId, {
      quotaRemainingCount: 0,
      quotaResetAt: RESET_AT,
    });

    expect(await readOpensubtitlesQuota(credentialId)).toMatchObject({
      quotaRemainingCount: 0,
      quotaResetAt: RESET_AT,
    });
  });

  it('reads no quota for a credential with none stored', async () => {
    expect(await readOpensubtitlesQuota(crypto.randomUUID())).toBeNull();
  });
});
