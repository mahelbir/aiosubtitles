import {describe, expect, it, vi} from 'vitest';
import {CredentialStatus} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {
  createViewerShareCheck,
  isQuotaSpendAllowed,
} from '../../src/lib/subtitle-background/quota-spending.js';

function makeQuotaClient(subtitleSource, quotaRemainingCount) {
  return {
    subtitleSource,
    readQuota: vi.fn(async () => ({
      credentialStatus: CredentialStatus.VALID,
      quotaRemainingCount,
      quotaAllowedCount: 20,
      quotaResetAt: null,
    })),
  };
}

const CREDENTIAL = {credentialId: 'fixture-credential', apiKey: 'fixture-key'};

describe('createViewerShareCheck', () => {
  it.each([SubtitleSource.OPENSUBTITLES, SubtitleSource.WYZIE])(
    'keeps the viewer share of a %s quota',
    async subtitleSource => {
      const canSpendAtShare = createViewerShareCheck({
        client: makeQuotaClient(subtitleSource, 10),
        credentials: [CREDENTIAL],
      });
      const canSpendAboveShare = createViewerShareCheck({
        client: makeQuotaClient(subtitleSource, 11),
        credentials: [CREDENTIAL],
      });

      await expect(canSpendAtShare()).resolves.toBe(false);
      await expect(canSpendAboveShare()).resolves.toBe(true);
    },
  );

  it('reads the quota of every credential it is given', async () => {
    const client = makeQuotaClient(SubtitleSource.WYZIE, 15);
    const secondCredential = {...CREDENTIAL, credentialId: 'second'};

    await createViewerShareCheck({
      client,
      credentials: [CREDENTIAL, secondCredential],
    })();

    expect(
      client.readQuota.mock.calls.map(([credential]) => credential),
    ).toEqual([CREDENTIAL, secondCredential]);
  });

  it('refuses once the signal is aborted, without reading the quota', async () => {
    const client = makeQuotaClient(SubtitleSource.WYZIE, 20);

    await expect(
      createViewerShareCheck({
        client,
        credentials: [CREDENTIAL],
        signal: AbortSignal.abort(),
      })(),
    ).resolves.toBe(false);
    expect(client.readQuota).not.toHaveBeenCalled();
  });

  it('refuses a key whose daily allowance the site does not report', async () => {
    const client = {
      subtitleSource: SubtitleSource.WYZIE,
      readQuota: vi.fn(async () => ({
        credentialStatus: CredentialStatus.VALID,
        quotaRemainingCount: 5000,
        quotaAllowedCount: null,
        quotaResetAt: null,
      })),
    };

    await expect(
      createViewerShareCheck({client, credentials: [CREDENTIAL]})(),
    ).resolves.toBe(false);
  });

  it('refuses when no quota can be read', async () => {
    const client = {
      subtitleSource: SubtitleSource.WYZIE,
      readQuota: vi.fn(async () => {
        throw new Error('The fixture site is down.');
      }),
    };

    await expect(
      createViewerShareCheck({client, credentials: [CREDENTIAL]})(),
    ).resolves.toBe(false);
  });
});

function makeQuotaCheck(quotaRemainingCount, quotaAllowedCount) {
  return {quotaRemainingCount, quotaAllowedCount};
}

describe('isQuotaSpendAllowed', () => {
  it('refuses when the remaining quota equals the viewer share', () => {
    expect(
      isQuotaSpendAllowed({
        quotaChecks: [makeQuotaCheck(10, 20)],
        viewerShare: 0.5,
      }),
    ).toBe(false);
  });

  it('allows when the remaining quota is above the viewer share', () => {
    expect(
      isQuotaSpendAllowed({
        quotaChecks: [makeQuotaCheck(11, 20)],
        viewerShare: 0.5,
      }),
    ).toBe(true);
  });

  it('sums every account before comparing', () => {
    expect(
      isQuotaSpendAllowed({
        quotaChecks: [makeQuotaCheck(5, 20), makeQuotaCheck(30, 1000)],
        viewerShare: 0.5,
      }),
    ).toBe(false);
  });

  it('allows the summed accounts once they pass the viewer share', () => {
    expect(
      isQuotaSpendAllowed({
        quotaChecks: [makeQuotaCheck(15, 20), makeQuotaCheck(500, 1000)],
        viewerShare: 0.5,
      }),
    ).toBe(true);
  });
});
