import {range} from 'es-toolkit';
import {describe, expect, it, vi} from 'vitest';
import {CredentialStatus} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {
  createQuotaShareCheck,
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

describe('createQuotaShareCheck', () => {
  it.each([SubtitleSource.OPENSUBTITLES, SubtitleSource.WYZIE])(
    'spends only the background share of a %s quota',
    async subtitleSource => {
      const canSpendAtShare = createQuotaShareCheck({
        client: makeQuotaClient(subtitleSource, 10),
        credentials: [CREDENTIAL],
      });
      const canSpendBeforeShare = createQuotaShareCheck({
        client: makeQuotaClient(subtitleSource, 11),
        credentials: [CREDENTIAL],
      });

      await expect(canSpendAtShare()).resolves.toBe(false);
      await expect(canSpendBeforeShare()).resolves.toBe(true);
    },
  );

  it('reads the quota of every credential it is given', async () => {
    const client = makeQuotaClient(SubtitleSource.WYZIE, 15);
    const secondCredential = {...CREDENTIAL, credentialId: 'second'};

    await createQuotaShareCheck({
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
      createQuotaShareCheck({
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
      createQuotaShareCheck({client, credentials: [CREDENTIAL]})(),
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
      createQuotaShareCheck({client, credentials: [CREDENTIAL]})(),
    ).resolves.toBe(false);
  });
});

function makeQuotaCheck(quotaRemainingCount, quotaAllowedCount) {
  return {quotaRemainingCount, quotaAllowedCount};
}

describe('isQuotaSpendAllowed', () => {
  it('refuses once the background has spent its share', () => {
    expect(
      isQuotaSpendAllowed({
        quotaChecks: [makeQuotaCheck(10, 20)],
        quotaShare: 0.5,
      }),
    ).toBe(false);
  });

  it('allows while the background share is not yet spent', () => {
    expect(
      isQuotaSpendAllowed({
        quotaChecks: [makeQuotaCheck(11, 20)],
        quotaShare: 0.5,
      }),
    ).toBe(true);
  });

  it.each([
    [0.25, 15, false],
    [0.25, 16, true],
    [0.75, 5, false],
    [0.75, 6, true],
    [0.9, 2, false],
    [0.9, 3, true],
  ])(
    'at a share of %f with %i of 20 left, allows: %s',
    (quotaShare, quotaRemainingCount, isAllowed) => {
      expect(
        isQuotaSpendAllowed({
          quotaChecks: [makeQuotaCheck(quotaRemainingCount, 20)],
          quotaShare,
        }),
      ).toBe(isAllowed);
    },
  );

  it.each([
    [93, false],
    [94, true],
  ])(
    'at a share of 0.07 with %i of 100 left, allows: %s',
    (quotaRemainingCount, isAllowed) => {
      expect(
        isQuotaSpendAllowed({
          quotaChecks: [makeQuotaCheck(quotaRemainingCount, 100)],
          quotaShare: 0.07,
        }),
      ).toBe(isAllowed);
    },
  );

  it('matches exact integer arithmetic at every share in hundredths', () => {
    const mismatches = [];
    for (const shareHundredths of range(0, 101)) {
      const quotaShare = shareHundredths / 100;
      for (const quotaAllowedCount of range(1, 201)) {
        for (const quotaSpentCount of range(0, quotaAllowedCount + 1)) {
          const isAllowed = isQuotaSpendAllowed({
            quotaChecks: [
              makeQuotaCheck(
                quotaAllowedCount - quotaSpentCount,
                quotaAllowedCount,
              ),
            ],
            quotaShare,
          });
          if (
            isAllowed !==
            quotaSpentCount * 100 < shareHundredths * quotaAllowedCount
          ) {
            mismatches.push({
              shareHundredths,
              quotaAllowedCount,
              quotaSpentCount,
            });
          }
        }
      }
    }

    expect(mismatches).toEqual([]);
  });

  it('never spends a quota whose allowance is zero', () => {
    expect(
      isQuotaSpendAllowed({
        quotaChecks: [makeQuotaCheck(0, 0)],
        quotaShare: 1,
      }),
    ).toBe(false);
  });

  it('never spends at a share of zero, even with the whole allowance left', () => {
    expect(
      isQuotaSpendAllowed({
        quotaChecks: [makeQuotaCheck(20, 20)],
        quotaShare: 0,
      }),
    ).toBe(false);
  });

  it('spends down to the last download at a share of one', () => {
    expect(
      isQuotaSpendAllowed({
        quotaChecks: [makeQuotaCheck(1, 20)],
        quotaShare: 1,
      }),
    ).toBe(true);
    expect(
      isQuotaSpendAllowed({
        quotaChecks: [makeQuotaCheck(0, 20)],
        quotaShare: 1,
      }),
    ).toBe(false);
  });

  it('sums every account before comparing', () => {
    expect(
      isQuotaSpendAllowed({
        quotaChecks: [makeQuotaCheck(5, 20), makeQuotaCheck(30, 1000)],
        quotaShare: 0.5,
      }),
    ).toBe(false);
  });

  it('allows the summed accounts while their background share is not yet spent', () => {
    expect(
      isQuotaSpendAllowed({
        quotaChecks: [makeQuotaCheck(15, 20), makeQuotaCheck(500, 1000)],
        quotaShare: 0.5,
      }),
    ).toBe(true);
  });
});
