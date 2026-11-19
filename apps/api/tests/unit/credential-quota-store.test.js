import {describe, expect, it, vi} from 'vitest';
import {CredentialStatus} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {MemoryStore} from '../../src/lib/memory-store.js';
import {
  CREDENTIAL_QUOTA_TTL,
  createCredentialQuotaReader,
} from '../../src/lib/subtitle-sources/credential-quota-store.js';

const API_KEY = 'fixture-quota-api-key';
const CREDENTIAL = {
  credentialId: 'fixture-credential',
  credentialKind: 'api-key',
  apiKey: API_KEY,
};
const QUOTA = {
  credentialStatus: CredentialStatus.VALID,
  quotaRemainingCount: 812,
  quotaAllowedCount: 1000,
  quotaResetAt: null,
};

function createReader({
  fetchQuota = vi.fn(async () => QUOTA),
  quotaStore = new MemoryStore({ttl: () => CREDENTIAL_QUOTA_TTL}),
} = {}) {
  const logger = {warn: vi.fn()};
  return {
    fetchQuota,
    quotaStore,
    logger,
    ...createCredentialQuotaReader({
      subtitleSource: SubtitleSource.WYZIE,
      fetchQuota,
      quotaStore,
      logger,
    }),
  };
}

describe('createCredentialQuotaReader', () => {
  it('keeps the quota for a short window', () => {
    expect(CREDENTIAL_QUOTA_TTL).toBeGreaterThan(0);
    expect(CREDENTIAL_QUOTA_TTL).toBeLessThanOrEqual(300);
  });

  it('reads the site once per credential within the window', async () => {
    const {readQuota, fetchQuota} = createReader();

    await expect(readQuota(CREDENTIAL)).resolves.toEqual(QUOTA);
    await expect(readQuota(CREDENTIAL)).resolves.toEqual(QUOTA);

    expect(fetchQuota).toHaveBeenCalledTimes(1);
  });

  it('hands the signal to the site read', async () => {
    const {readQuota, fetchQuota} = createReader();
    const signal = AbortSignal.timeout(60000);

    await readQuota(CREDENTIAL, {signal});

    expect(fetchQuota).toHaveBeenCalledWith(CREDENTIAL, signal);
  });

  it('reads the site again for a changed secret under the same credential', async () => {
    const {readQuota, fetchQuota} = createReader();

    await readQuota(CREDENTIAL);
    await readQuota({...CREDENTIAL, apiKey: 'fixture-replaced-api-key'});

    expect(fetchQuota).toHaveBeenCalledTimes(2);
  });

  it('keys the store by a fingerprint, never the secret', async () => {
    const quotaStore = new MemoryStore({ttl: () => CREDENTIAL_QUOTA_TTL});
    const setSpy = vi.spyOn(quotaStore, 'set');
    const {readQuota} = createReader({quotaStore});

    await readQuota(CREDENTIAL);

    const [[storeKey]] = setSpy.mock.calls;
    expect(storeKey).toContain(SubtitleSource.WYZIE);
    expect(storeKey).toContain(CREDENTIAL.credentialId);
    expect(storeKey).not.toContain(API_KEY);
  });

  it('reads the site again once a spend drops the stored quota', async () => {
    const {readQuota, dropQuota, fetchQuota} = createReader();

    await readQuota(CREDENTIAL);
    await dropQuota(CREDENTIAL);
    await readQuota(CREDENTIAL);

    expect(fetchQuota).toHaveBeenCalledTimes(2);
  });

  it('keeps the stored quota of another credential when one is dropped', async () => {
    const {readQuota, dropQuota, fetchQuota} = createReader();
    const otherCredential = {...CREDENTIAL, credentialId: 'other-credential'};

    await readQuota(CREDENTIAL);
    await readQuota(otherCredential);
    await dropQuota(CREDENTIAL);
    await readQuota(otherCredential);

    expect(fetchQuota).toHaveBeenCalledTimes(2);
  });

  it('stores no failed read', async () => {
    const fetchQuota = vi
      .fn()
      .mockRejectedValueOnce(new Error('The fixture site is down.'))
      .mockResolvedValueOnce(QUOTA);
    const {readQuota} = createReader({fetchQuota});

    await expect(readQuota(CREDENTIAL)).rejects.toThrow(
      'The fixture site is down.',
    );
    await expect(readQuota(CREDENTIAL)).resolves.toEqual(QUOTA);

    expect(fetchQuota).toHaveBeenCalledTimes(2);
  });

  it('reads the site when the store fails, and logs the failure by name', async () => {
    const quotaStore = {
      get: vi.fn(async () => {
        throw new TypeError('The fixture store is down.');
      }),
      set: vi.fn(async () => {
        throw new TypeError('The fixture store is down.');
      }),
    };
    const {readQuota, fetchQuota, logger} = createReader({quotaStore});

    await expect(readQuota(CREDENTIAL)).resolves.toEqual(QUOTA);

    expect(fetchQuota).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({storeErrorName: 'TypeError'}),
      expect.any(String),
    );
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(API_KEY);
  });
});
