import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  CredentialKind,
  CredentialStatus,
} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {config} from '../../src/config/index.js';
import {Subtitle} from '../../src/db/models/subtitle.js';
import {markCredentialStatus} from '../../src/lib/credential-secret.js';
import {
  drainPendingSearches,
  searchSubtitleSource,
} from '../../src/lib/subtitle-search/search-subtitle-source.js';
import {
  acquireSearchLock,
  releaseSearchLock,
} from '../../src/lib/subtitle-search/subtitle-search-cache.js';
import {
  openSubtitleSourceBreaker,
  readSubtitleSourceBreaker,
} from '../../src/lib/subtitle-search/subtitle-source-breaker.js';
import {spendSubtitleSourceBudget} from '../../src/lib/subtitle-search/subtitle-source-budget.js';
import {jimakuClient} from '../../src/lib/subtitle-sources/jimaku/jimaku-client.js';
import {opensubtitlesClient} from '../../src/lib/subtitle-sources/opensubtitles/opensubtitles-client.js';
import {SubtitleSourceBudgetScope} from '../../src/lib/subtitle-sources/subtitle-source-contract.js';
import {
  SourceCredentialError,
  SourceRateLimitError,
  SourceUnavailableError,
} from '../../src/lib/subtitle-sources/subtitle-source-errors.js';
import {
  readSearchCredentials,
  readUsableCredentials,
} from '../../src/lib/subtitle-source-credentials.js';
import {userConfigCache} from '../../src/lib/user-config-cache.js';
import {redis} from '../../src/redis/index.js';
import {createUserConfig} from '../helpers/factories.js';
import {createFixtureSubtitleSourceClient} from '../helpers/fixture-subtitle-source.js';
import {
  makeSearchQuery,
  makeSubtitleSourceCredential,
  makeSubtitleSourceHit,
} from '../helpers/subtitle-source-factories.js';
import {readCredentialStatuses} from '../helpers/user-config-factories.js';

const SUBTITLE_SOURCE = SubtitleSource.THESUBTITLEDB;
const NOW_MS = Date.UTC(2026, 10, 18, 12, 0, 0);
const STALE_MS = NOW_MS + config.subtitleSearchCacheFreshTtl * 1000 + 1;
const BUDGET_WINDOW_MS = 60000;
const BUDGET_WINDOW = Math.floor(NOW_MS / BUDGET_WINDOW_MS);
const RETRY_AFTER_MS = 120000;
const WITHOUT_CREDENTIALS = {credentials: [], hasConfiguredCredential: false};

const subtitleSourceBudget = {
  budgetScope: SubtitleSourceBudgetScope.SUBTITLE_SOURCE,
  windowMs: BUDGET_WINDOW_MS,
  requestMax: 10,
};

const credentialBudget = {
  budgetScope: SubtitleSourceBudgetScope.CREDENTIAL,
  windowMs: BUDGET_WINDOW_MS,
  requestMax: 10,
};

function makeTurkishQuery(overrides = {}) {
  return makeSearchQuery({languageCodes: ['tur'], ...overrides});
}

function makeApiKeyCredential(apiKey) {
  return {
    subtitleSource: SUBTITLE_SOURCE,
    credentialKind: CredentialKind.API_KEY,
    credentialSecret: {apiKey},
  };
}

async function spendTimes(times, spendOptions) {
  const spends = [];
  for (let spendIndex = 0; spendIndex < times; spendIndex += 1) {
    spends.push(await spendSubtitleSourceBudget(spendOptions));
  }
  return spends;
}

afterEach(async () => {
  await drainPendingSearches();
});

describe('searchSubtitleSource', () => {
  it('uses a fresh cache without calling the source', async () => {
    const turkishHit = makeSubtitleSourceHit({languageCode: 'tur'});
    const client = createFixtureSubtitleSourceClient({
      searchSubtitles: vi.fn(async () => [turkishHit]),
    });
    const searchQuery = makeSearchQuery({languageCodes: ['tur', 'eng']});

    const liveHits = await searchSubtitleSource({
      client,
      searchQuery,
      ...WITHOUT_CREDENTIALS,
      nowMs: NOW_MS,
    });
    const cachedHits = await searchSubtitleSource({
      client,
      searchQuery,
      ...WITHOUT_CREDENTIALS,
      nowMs: NOW_MS + 1000,
    });
    await drainPendingSearches();

    expect(liveHits).toEqual([turkishHit]);
    expect(cachedHits).toEqual([]);
    expect(client.searchSubtitles).toHaveBeenCalledTimes(1);
    expect(await Subtitle.count()).toBe(1);
    expect(
      JSON.parse(
        await redis.get(
          `subtitle-search-cache:v1:${SUBTITLE_SOURCE}:tt0111161:eng`,
        ),
      ),
    ).toEqual({searchFetchedAt: NOW_MS});
  });

  it('answers stale hits and refreshes once in the background', async () => {
    const staleHit = makeSubtitleSourceHit();
    const refreshedHit = makeSubtitleSourceHit();
    const client = createFixtureSubtitleSourceClient({
      searchSubtitles: vi
        .fn()
        .mockResolvedValueOnce([staleHit])
        .mockResolvedValue([refreshedHit]),
    });
    const searchQuery = makeTurkishQuery();

    await searchSubtitleSource({
      client,
      searchQuery,
      ...WITHOUT_CREDENTIALS,
      nowMs: NOW_MS,
    });
    const staleAnswers = await Promise.all([
      searchSubtitleSource({
        client,
        searchQuery,
        ...WITHOUT_CREDENTIALS,
        nowMs: STALE_MS,
      }),
      searchSubtitleSource({
        client,
        searchQuery,
        ...WITHOUT_CREDENTIALS,
        nowMs: STALE_MS,
      }),
    ]);
    await drainPendingSearches();

    expect(staleAnswers).toEqual([[], []]);
    expect(client.searchSubtitles).toHaveBeenCalledTimes(2);
    expect(
      await Subtitle.count({where: {siteFileId: refreshedHit.siteFileId}}),
    ).toBe(1);
    expect(
      JSON.parse(
        await redis.get(
          `subtitle-search-cache:v1:${SUBTITLE_SOURCE}:tt0111161:tur`,
        ),
      ),
    ).toEqual({searchFetchedAt: STALE_MS});
    await searchSubtitleSource({
      client,
      searchQuery,
      ...WITHOUT_CREDENTIALS,
      nowMs: STALE_MS,
    });
    expect(client.searchSubtitles).toHaveBeenCalledTimes(2);
  });

  it('searches nothing for a key-requiring source without a credential', async () => {
    const cachedHit = makeSubtitleSourceHit();
    const client = createFixtureSubtitleSourceClient({
      credentialKinds: [CredentialKind.API_KEY],
      canSearchWithoutCredential: vi.fn(() => false),
      searchSubtitles: vi.fn(async () => [cachedHit]),
    });

    await searchSubtitleSource({
      client,
      searchQuery: makeTurkishQuery(),
      credentials: [makeSubtitleSourceCredential()],
      hasConfiguredCredential: true,
      nowMs: NOW_MS,
    });
    const staleHits = await searchSubtitleSource({
      client,
      searchQuery: makeTurkishQuery(),
      ...WITHOUT_CREDENTIALS,
      nowMs: STALE_MS,
    });
    const missingHits = await searchSubtitleSource({
      client,
      searchQuery: makeSearchQuery({languageCodes: ['eng']}),
      ...WITHOUT_CREDENTIALS,
      nowMs: STALE_MS,
    });
    await drainPendingSearches();

    expect(staleHits).toEqual([]);
    expect(missingHits).toEqual([]);
    expect(client.searchSubtitles).toHaveBeenCalledTimes(1);
  });

  it('searches a source once for two concurrent misses', async () => {
    const searchHit = makeSubtitleSourceHit();
    const sourceAnswer = Promise.withResolvers();
    const client = createFixtureSubtitleSourceClient({
      searchSubtitles: vi.fn(() => sourceAnswer.promise),
    });
    const searchQuery = makeTurkishQuery();

    const searches = [
      searchSubtitleSource({
        client,
        searchQuery,
        ...WITHOUT_CREDENTIALS,
        nowMs: NOW_MS,
      }),
      searchSubtitleSource({
        client,
        searchQuery,
        ...WITHOUT_CREDENTIALS,
        nowMs: NOW_MS,
      }),
    ];
    await vi.waitFor(() => {
      expect(client.searchSubtitles).toHaveBeenCalledTimes(1);
    });
    sourceAnswer.resolve([searchHit]);
    const answers = await Promise.all(searches);
    await drainPendingSearches();

    expect(
      answers.toSorted((left, right) => right.length - left.length),
    ).toEqual([[searchHit], []]);
    expect(client.searchSubtitles).toHaveBeenCalledTimes(1);
    await searchSubtitleSource({
      client,
      searchQuery,
      ...WITHOUT_CREDENTIALS,
      nowMs: NOW_MS,
    });
    expect(client.searchSubtitles).toHaveBeenCalledTimes(1);
  });

  it('opens the breaker on a source-wide 429 and skips the source until it closes', async () => {
    const searchHit = makeSubtitleSourceHit();
    const client = createFixtureSubtitleSourceClient({
      searchSubtitles: vi
        .fn()
        .mockRejectedValueOnce(
          new SourceRateLimitError({
            subtitleSource: SUBTITLE_SOURCE,
            retryAfterMs: RETRY_AFTER_MS,
          }),
        )
        .mockResolvedValue([searchHit]),
    });
    const searchQuery = makeTurkishQuery();

    const limitedHits = await searchSubtitleSource({
      client,
      searchQuery,
      ...WITHOUT_CREDENTIALS,
      nowMs: NOW_MS,
    });
    expect(limitedHits).toEqual([]);
    await expect(
      readSubtitleSourceBreaker(SUBTITLE_SOURCE, NOW_MS + 1000),
    ).resolves.toEqual({isOpen: true, budgetFactor: 0.5});

    const skippedHits = await searchSubtitleSource({
      client,
      searchQuery,
      ...WITHOUT_CREDENTIALS,
      nowMs: NOW_MS + 119000,
    });
    expect(skippedHits).toEqual([]);
    expect(client.searchSubtitles).toHaveBeenCalledTimes(1);

    const reopenedHits = await searchSubtitleSource({
      client,
      searchQuery,
      ...WITHOUT_CREDENTIALS,
      nowMs: NOW_MS + 121000,
    });
    expect(reopenedHits).toEqual([searchHit]);
    expect(client.searchSubtitles).toHaveBeenCalledTimes(2);
  });

  it('marks a rejected key invalid and tries the next one', async () => {
    const searchHit = makeSubtitleSourceHit();
    const {userConfig, userConfigCredentials} = await createUserConfig({
      credentials: [
        makeApiKeyCredential('rejected-api-key'),
        makeApiKeyCredential('working-api-key'),
      ],
    });
    const [rejectedCredential, workingCredential] = userConfigCredentials;
    const credentials = readUsableCredentials({
      cachedUserConfig: await userConfigCache.get(userConfig.id),
      subtitleSource: SUBTITLE_SOURCE,
      credentialKinds: [CredentialKind.API_KEY],
    });
    const client = createFixtureSubtitleSourceClient({
      credentialKinds: [CredentialKind.API_KEY],
      searchSubtitles: vi.fn(async (searchQuery, credential) => {
        if (credential.credentialId === rejectedCredential.id) {
          throw new SourceCredentialError({
            subtitleSource: SUBTITLE_SOURCE,
            credentialId: credential.credentialId,
          });
        }
        return [searchHit];
      }),
    });

    const searchHits = await searchSubtitleSource({
      client,
      searchQuery: makeTurkishQuery(),
      credentials,
      hasConfiguredCredential: true,
      nowMs: NOW_MS,
    });
    await drainPendingSearches();

    expect(searchHits).toEqual([searchHit]);
    expect(client.searchSubtitles).toHaveBeenCalledTimes(2);
    expect(client.searchSubtitles.mock.lastCall[1]).toMatchObject({
      credentialId: workingCredential.id,
      apiKey: 'working-api-key',
    });
    expect(
      await readCredentialStatuses([
        rejectedCredential.id,
        workingCredential.id,
      ]),
    ).toEqual({
      [rejectedCredential.id]: CredentialStatus.INVALID,
      [workingCredential.id]: CredentialStatus.UNCHECKED,
    });
  });

  it('never searches keyless for a user whose only key is invalid', async () => {
    const {userConfig, userConfigCredentials} = await createUserConfig({
      credentials: [makeApiKeyCredential('invalid-api-key')],
    });
    await markCredentialStatus({
      credentialId: userConfigCredentials[0].id,
      credentialStatus: CredentialStatus.INVALID,
    });
    const client = createFixtureSubtitleSourceClient({
      credentialKinds: [CredentialKind.API_KEY],
      searchSubtitles: vi.fn(async () => [makeSubtitleSourceHit()]),
    });

    const searchHits = await searchSubtitleSource({
      client,
      searchQuery: makeTurkishQuery(),
      ...readSearchCredentials({
        cachedUserConfig: await userConfigCache.get(userConfig.id),
        client,
      }),
      nowMs: NOW_MS,
    });
    await drainPendingSearches();

    expect(searchHits).toEqual([]);
    expect(client.searchSubtitles).not.toHaveBeenCalled();
  });

  it('searches keyless for a user without a key for the source', async () => {
    const searchHit = makeSubtitleSourceHit();
    const {userConfig} = await createUserConfig({
      credentials: [
        {
          subtitleSource: SubtitleSource.OPENSUBTITLES,
          credentialKind: CredentialKind.API_KEY,
          credentialSecret: {apiKey: 'other-source-api-key'},
        },
      ],
    });
    const client = createFixtureSubtitleSourceClient({
      credentialKinds: [CredentialKind.API_KEY],
      searchSubtitles: vi.fn(async () => [searchHit]),
    });

    const searchHits = await searchSubtitleSource({
      client,
      searchQuery: makeTurkishQuery(),
      ...readSearchCredentials({
        cachedUserConfig: await userConfigCache.get(userConfig.id),
        client,
      }),
      nowMs: NOW_MS,
    });
    await drainPendingSearches();

    expect(searchHits).toEqual([searchHit]);
    expect(client.searchSubtitles).toHaveBeenCalledTimes(1);
    expect(client.searchSubtitles.mock.calls[0][1]).toBeNull();
  });

  it('searches nothing when a caller leaves out whether the user configured a key', async () => {
    const client = createFixtureSubtitleSourceClient({
      searchSubtitles: vi.fn(async () => [makeSubtitleSourceHit()]),
    });

    const searchHits = await searchSubtitleSource({
      client,
      searchQuery: makeTurkishQuery(),
      credentials: [],
      nowMs: NOW_MS,
    });
    await drainPendingSearches();

    expect(searchHits).toEqual([]);
    expect(client.searchSubtitles).not.toHaveBeenCalled();
  });

  it('keeps every user config id out of the search keys', async () => {
    const {userConfig, userConfigCredentials} = await createUserConfig({
      credentials: [makeApiKeyCredential('viewer-api-key')],
    });
    const credentials = readUsableCredentials({
      cachedUserConfig: await userConfigCache.get(userConfig.id),
      subtitleSource: SUBTITLE_SOURCE,
      credentialKinds: [CredentialKind.API_KEY],
    });
    const client = createFixtureSubtitleSourceClient({
      credentialKinds: [CredentialKind.API_KEY],
      downloadBudgets: [subtitleSourceBudget, credentialBudget],
      searchSubtitles: vi.fn(async () => [makeSubtitleSourceHit()]),
    });

    await searchSubtitleSource({
      client,
      searchQuery: makeTurkishQuery(),
      credentials,
      hasConfiguredCredential: true,
      nowMs: NOW_MS,
    });
    await spendSubtitleSourceBudget({
      client,
      credentialId: userConfigCredentials[0].id,
      isBackground: false,
      nowMs: NOW_MS,
    });
    await openSubtitleSourceBreaker({
      subtitleSource: SUBTITLE_SOURCE,
      retryAfterMs: RETRY_AFTER_MS,
      nowMs: NOW_MS,
    });
    await drainPendingSearches();

    const searchKeys = (await redis.keys('*')).filter(
      redisKey =>
        !redisKey.startsWith('user-config-cache:v1:') &&
        !redisKey.startsWith('cache-generation:'),
    );
    expect(searchKeys).toEqual(
      expect.arrayContaining([
        `subtitle-search-cache:v1:${SUBTITLE_SOURCE}:tt0111161:tur`,
        `subtitle-source-breaker:v1:${SUBTITLE_SOURCE}`,
      ]),
    );
    const storedValues = await Promise.all(
      searchKeys.map(redisKey => redis.get(redisKey)),
    );
    for (const stored of [...searchKeys, ...storedValues]) {
      expect(stored).not.toContain(userConfig.id);
    }
  });

  it('stops waiting for a late search at the shutdown deadline', async () => {
    let finishSearch;
    const client = createFixtureSubtitleSourceClient({
      searchSubtitles: vi.fn(
        () =>
          new Promise(resolve => {
            finishSearch = () => resolve([]);
          }),
      ),
    });
    const lateSearch = searchSubtitleSource({
      client,
      searchQuery: makeTurkishQuery(),
      ...WITHOUT_CREDENTIALS,
      nowMs: NOW_MS,
    });
    await vi.waitFor(() => {
      expect(client.searchSubtitles).toHaveBeenCalledTimes(1);
    });

    const drainState = await Promise.race([
      drainPendingSearches({signal: AbortSignal.abort()}).then(() => 'drained'),
      new Promise(resolve => {
        setTimeout(resolve, 1000, 'waiting');
      }),
    ]);
    finishSearch();
    await lateSearch;

    expect(drainState).toBe('drained');
  });
});

describe('readUsableCredentials', () => {
  it('opens usable credentials in position order', async () => {
    const {userConfig, userConfigCredentials} = await createUserConfig({
      credentials: [
        makeApiKeyCredential('first-api-key'),
        makeApiKeyCredential('invalid-api-key'),
        makeApiKeyCredential('unopenable-api-key'),
        makeApiKeyCredential('last-api-key'),
        {
          subtitleSource: SubtitleSource.OPENSUBTITLES,
          credentialKind: CredentialKind.API_KEY,
          credentialSecret: {apiKey: 'other-source-api-key'},
        },
      ],
    });
    const [
      firstCredential,
      invalidCredential,
      unopenableCredential,
      lastCredential,
    ] = userConfigCredentials;
    await markCredentialStatus({
      credentialId: invalidCredential.id,
      credentialStatus: CredentialStatus.INVALID,
    });
    const cachedUserConfig = await userConfigCache.get(userConfig.id);

    const credentials = readUsableCredentials({
      cachedUserConfig: {
        ...cachedUserConfig,
        credentials: cachedUserConfig.credentials.map(credential =>
          credential.credentialId === unopenableCredential.id
            ? {...credential, sealedSecret: 'not-a-sealed-secret'}
            : credential,
        ),
      },
      subtitleSource: SUBTITLE_SOURCE,
      credentialKinds: [CredentialKind.API_KEY],
    });

    expect(credentials).toEqual([
      {
        credentialId: firstCredential.id,
        credentialKind: CredentialKind.API_KEY,
        apiKey: 'first-api-key',
      },
      {
        credentialId: lastCredential.id,
        credentialKind: CredentialKind.API_KEY,
        apiKey: 'last-api-key',
      },
    ]);
  });
});

describe('the subtitle source breaker', () => {
  it('reads a closed breaker at full budget', async () => {
    await expect(
      readSubtitleSourceBreaker(SUBTITLE_SOURCE, NOW_MS),
    ).resolves.toEqual({isOpen: false, budgetFactor: 1});
  });

  it('never halves the budget below an eighth', async () => {
    const budgetFactors = [];
    for (let openIndex = 0; openIndex < 4; openIndex += 1) {
      const openedAt = NOW_MS + openIndex * 1000;
      await openSubtitleSourceBreaker({
        subtitleSource: SUBTITLE_SOURCE,
        retryAfterMs: 1000,
        nowMs: openedAt,
      });
      const {budgetFactor} = await readSubtitleSourceBreaker(
        SUBTITLE_SOURCE,
        openedAt,
      );
      budgetFactors.push(budgetFactor);
    }

    expect(budgetFactors).toEqual([0.5, 0.25, 0.125, 0.125]);
  });

  it('halves once for 429s that arrive while the breaker is open', async () => {
    await openSubtitleSourceBreaker({
      subtitleSource: SUBTITLE_SOURCE,
      retryAfterMs: RETRY_AFTER_MS,
      nowMs: NOW_MS,
    });
    await openSubtitleSourceBreaker({
      subtitleSource: SUBTITLE_SOURCE,
      retryAfterMs: RETRY_AFTER_MS,
      nowMs: NOW_MS + 1000,
    });

    await expect(
      readSubtitleSourceBreaker(SUBTITLE_SOURCE, NOW_MS + 2000),
    ).resolves.toEqual({isOpen: true, budgetFactor: 0.5});
    await expect(
      readSubtitleSourceBreaker(SUBTITLE_SOURCE, NOW_MS + RETRY_AFTER_MS + 500),
    ).resolves.toEqual({isOpen: true, budgetFactor: 0.5});
  });

  it('doubles the budget after a full window without a 429', async () => {
    await openSubtitleSourceBreaker({
      subtitleSource: SUBTITLE_SOURCE,
      retryAfterMs: RETRY_AFTER_MS,
      nowMs: NOW_MS,
    });
    const closedAt = NOW_MS + RETRY_AFTER_MS;

    await expect(
      readSubtitleSourceBreaker(SUBTITLE_SOURCE, closedAt + 59999),
    ).resolves.toEqual({isOpen: false, budgetFactor: 0.5});
    await expect(
      readSubtitleSourceBreaker(SUBTITLE_SOURCE, closedAt + 60000),
    ).resolves.toEqual({isOpen: false, budgetFactor: 1});
    await expect(
      redis.pttl(`subtitle-source-breaker:v1:${SUBTITLE_SOURCE}`),
    ).resolves.toBeGreaterThan(RETRY_AFTER_MS);
  });
});

describe('the search lock', () => {
  const lockKey = `subtitle-search-lock:v1:${SUBTITLE_SOURCE}:tt0111161:tur`;
  const cacheKey = `subtitle-search-cache:v1:${SUBTITLE_SOURCE}:tt0111161:tur`;

  async function readLockCheckCount() {
    const commandStats = await redis.info('commandstats');
    return Number(commandStats.match(/cmdstat_exists:calls=(\d+)/)?.[1] ?? 0);
  }

  async function startWaitingSearch(client) {
    await redis.set(lockKey, 'other-holder', 'EX', 60);
    const lockChecksBefore = await readLockCheckCount();
    const waitingSearch = searchSubtitleSource({
      client,
      searchQuery: makeTurkishQuery(),
      ...WITHOUT_CREDENTIALS,
      nowMs: NOW_MS,
    });
    await vi.waitFor(async () => {
      expect(await readLockCheckCount()).toBeGreaterThan(lockChecksBefore);
    });
    return {waitingSearch};
  }

  it('waits for the holder to finish and searches nothing itself', async () => {
    const client = createFixtureSubtitleSourceClient();
    let isWaitOver = false;

    const {waitingSearch} = await startWaitingSearch(client);
    waitingSearch.then(() => {
      isWaitOver = true;
    });
    await readLockCheckCount();
    const isOverWhileHeld = isWaitOver;
    await redis.set(cacheKey, JSON.stringify({searchFetchedAt: NOW_MS}));
    await redis.del(lockKey);

    await expect(waitingSearch).resolves.toEqual([]);
    expect(isOverWhileHeld).toBe(false);
    expect(client.searchSubtitles).not.toHaveBeenCalled();
  });

  it('answers nothing when the holder releases without a result', async () => {
    const client = createFixtureSubtitleSourceClient();

    const {waitingSearch} = await startWaitingSearch(client);
    await redis.del(lockKey);

    await expect(waitingSearch).resolves.toEqual([]);
    expect(client.searchSubtitles).not.toHaveBeenCalled();
  });

  it('stops waiting at the caller deadline', async () => {
    const client = createFixtureSubtitleSourceClient();
    await redis.set(lockKey, 'other-holder', 'EX', 60);

    const searchHits = await searchSubtitleSource({
      client,
      searchQuery: makeTurkishQuery(),
      ...WITHOUT_CREDENTIALS,
      signal: AbortSignal.timeout(300),
      nowMs: NOW_MS,
    });

    expect(searchHits).toEqual([]);
    expect(client.searchSubtitles).not.toHaveBeenCalled();
    await expect(redis.get(lockKey)).resolves.toBe('other-holder');
  });
});

describe('spendSubtitleSourceBudget', () => {
  it('spends the background share of a budget and leaves the rest to the viewer', async () => {
    expect(config.subtitleBackgroundRateShare).toBe(0.5);
    const client = createFixtureSubtitleSourceClient({
      downloadBudgets: [subtitleSourceBudget],
    });

    const backgroundSpends = await spendTimes(6, {
      client,
      credentialId: null,
      isBackground: true,
      nowMs: NOW_MS,
    });
    const viewerSpend = await spendSubtitleSourceBudget({
      client,
      credentialId: null,
      isBackground: false,
      nowMs: NOW_MS,
    });

    expect(backgroundSpends).toEqual([true, true, true, true, true, false]);
    expect(viewerSpend).toBe(true);
  });

  it('halves the budget after a 429', async () => {
    const client = createFixtureSubtitleSourceClient({
      downloadBudgets: [subtitleSourceBudget],
    });
    await openSubtitleSourceBreaker({
      subtitleSource: SUBTITLE_SOURCE,
      retryAfterMs: RETRY_AFTER_MS,
      nowMs: NOW_MS,
    });

    const backgroundSpends = await spendTimes(3, {
      client,
      credentialId: null,
      isBackground: true,
      nowMs: NOW_MS,
    });

    expect(backgroundSpends).toEqual([true, true, false]);
  });

  it('keys nothing by user config id or video in the budget', async () => {
    const {userConfig, userConfigCredentials} = await createUserConfig({
      credentials: [makeApiKeyCredential('budget-api-key')],
    });
    const [credential] = userConfigCredentials;
    const client = createFixtureSubtitleSourceClient({
      downloadBudgets: [subtitleSourceBudget, credentialBudget],
    });

    const spends = await Promise.all(
      [credential.id, null].map(credentialId =>
        spendSubtitleSourceBudget({
          client,
          credentialId,
          isBackground: false,
          nowMs: NOW_MS,
        }),
      ),
    );

    expect(spends).toEqual([true, true]);
    const budgetKeys = await redis.keys('subtitle-source-budget:*');
    expect(budgetKeys.toSorted()).toEqual(
      [
        `subtitle-source-budget:v1:${SUBTITLE_SOURCE}:${BUDGET_WINDOW}`,
        `subtitle-source-budget:v1:${SUBTITLE_SOURCE}:credential:${credential.id}:${BUDGET_WINDOW}`,
      ].toSorted(),
    );
    for (const budgetKey of budgetKeys) {
      expect(budgetKey).not.toContain(userConfig.id);
      expect(budgetKey).not.toContain('tt0111161');
    }
  });

  it('shares one Jimaku server window between the keys of two users', async () => {
    const client = {
      subtitleSource: SubtitleSource.JIMAKU,
      downloadBudgets: jimakuClient.downloadBudgets,
    };
    const [serverBudget] = client.downloadBudgets;
    const credentialIds = [crypto.randomUUID(), crypto.randomUUID()];

    const spends = [];
    for (
      let spendIndex = 0;
      spendIndex <= serverBudget.requestMax;
      spendIndex++
    ) {
      spends.push(
        await spendSubtitleSourceBudget({
          client,
          credentialId: credentialIds[spendIndex % 2],
          isBackground: false,
          nowMs: NOW_MS,
        }),
      );
    }

    expect(serverBudget).toMatchObject({
      budgetScope: SubtitleSourceBudgetScope.SUBTITLE_SOURCE,
      windowMs: 60000,
      requestMax: 25,
    });
    expect(spends).toEqual([...Array(25).fill(true), false]);
    await expect(
      redis.keys(`subtitle-source-budget:v1:${SubtitleSource.JIMAKU}:*`),
    ).resolves.toEqual([
      `subtitle-source-budget:v1:${SubtitleSource.JIMAKU}:${BUDGET_WINDOW}`,
    ]);
  });

  it('never refuses an OpenSubtitles account download on the shared app-key budget', async () => {
    const client = {
      subtitleSource: SubtitleSource.OPENSUBTITLES,
      downloadBudgets: opensubtitlesClient.downloadBudgets,
    };
    const appKeyBudget = client.downloadBudgets.find(
      ({budgetScope}) =>
        budgetScope === SubtitleSourceBudgetScope.SUBTITLE_SOURCE,
    );

    const spends = await Promise.all(
      Array.from({length: appKeyBudget.requestMax + 1}, () =>
        spendSubtitleSourceBudget({
          client,
          credentialId: crypto.randomUUID(),
          isBackground: false,
          nowMs: NOW_MS,
        }),
      ),
    );

    expect(spends).toEqual(Array(appKeyBudget.requestMax + 1).fill(true));
    await expect(
      spendTimes(appKeyBudget.requestMax + 1, {
        client,
        credentialId: null,
        isBackground: false,
        nowMs: NOW_MS,
      }),
    ).resolves.toEqual([...Array(appKeyBudget.requestMax).fill(true), false]);
  });

  it('consumes nothing from either budget when one refuses', async () => {
    const credentialId = crypto.randomUUID();
    const dayBudget = {...credentialBudget, windowMs: 86400000, requestMax: 2};
    const client = createFixtureSubtitleSourceClient({
      downloadBudgets: [credentialBudget, dayBudget],
    });

    const spends = await spendTimes(3, {
      client,
      credentialId,
      isBackground: false,
      nowMs: NOW_MS,
    });

    expect(spends).toEqual([true, true, false]);
    await expect(
      redis.mget(
        `subtitle-source-budget:v1:${SUBTITLE_SOURCE}:credential:${credentialId}:${BUDGET_WINDOW}`,
        `subtitle-source-budget:v1:${SUBTITLE_SOURCE}:credential:${credentialId}:${Math.floor(NOW_MS / dayBudget.windowMs)}`,
      ),
    ).resolves.toEqual(['2', '2']);
  });

  it('leaves a refused budget at its count', async () => {
    const client = createFixtureSubtitleSourceClient({
      downloadBudgets: [subtitleSourceBudget],
    });

    await spendTimes(7, {
      client,
      credentialId: null,
      isBackground: true,
      nowMs: NOW_MS,
    });

    await expect(
      redis.get(
        `subtitle-source-budget:v1:${SUBTITLE_SOURCE}:${BUDGET_WINDOW}`,
      ),
    ).resolves.toBe('5');
    await expect(
      redis.pttl(
        `subtitle-source-budget:v1:${SUBTITLE_SOURCE}:${BUDGET_WINDOW}`,
      ),
    ).resolves.toBeGreaterThan(0);
  });

  it('limits a source that declares no budget to ten downloads a minute', async () => {
    const client = createFixtureSubtitleSourceClient({downloadBudgets: []});

    const spends = await spendTimes(11, {
      client,
      credentialId: null,
      isBackground: false,
      nowMs: NOW_MS,
    });

    expect(spends).toEqual([...Array(10).fill(true), false]);
  });

  it('spends only the key budgets of a key-only source for downloads with the user own keys', async () => {
    const client = createFixtureSubtitleSourceClient({
      downloadBudgets: [credentialBudget],
    });
    const credentialIds = [crypto.randomUUID(), crypto.randomUUID()];

    const spends = [
      ...(await spendTimes(6, {
        client,
        credentialId: credentialIds[0],
        isBackground: false,
        nowMs: NOW_MS,
      })),
      ...(await spendTimes(5, {
        client,
        credentialId: credentialIds[1],
        isBackground: false,
        nowMs: NOW_MS,
      })),
    ];

    expect(spends).toEqual(Array(11).fill(true));
    await expect(
      redis.exists(
        `subtitle-source-budget:v1:${SUBTITLE_SOURCE}:${BUDGET_WINDOW}`,
      ),
    ).resolves.toBe(0);
  });

  it('spends the default budget for a keyless download of a key-budgeted source', async () => {
    const client = createFixtureSubtitleSourceClient({
      downloadBudgets: [credentialBudget],
    });

    const spends = await spendTimes(11, {
      client,
      credentialId: null,
      isBackground: false,
      nowMs: NOW_MS,
    });

    expect(spends).toEqual([...Array(10).fill(true), false]);
  });
});

describe('the budget recovery window', () => {
  const RECOVERY_CHECK_MS = NOW_MS + 1000 + 120000;

  async function spendAfterSourceWide429(downloadBudgets, spendCount) {
    const client = createFixtureSubtitleSourceClient({
      downloadBudgets,
      searchSubtitles: vi.fn(async () => {
        throw new SourceRateLimitError({
          subtitleSource: SUBTITLE_SOURCE,
          retryAfterMs: 1000,
        });
      }),
    });
    await searchSubtitleSource({
      client,
      searchQuery: makeTurkishQuery(),
      ...WITHOUT_CREDENTIALS,
      nowMs: NOW_MS,
    });
    return spendTimes(spendCount, {
      client,
      credentialId: null,
      isBackground: true,
      nowMs: RECOVERY_CHECK_MS,
    });
  }

  it('restores a minute budget two minutes after the breaker closes', async () => {
    await expect(
      spendAfterSourceWide429([subtitleSourceBudget], 6),
    ).resolves.toEqual([true, true, true, true, true, false]);
  });

  it('keeps a daily budget halved for an hour after the breaker closes', async () => {
    await expect(
      spendAfterSourceWide429(
        [{...subtitleSourceBudget, windowMs: 86400000}],
        3,
      ),
    ).resolves.toEqual([true, true, false]);
  });

  it('restores a source without a budget over the default window', async () => {
    await expect(spendAfterSourceWide429([], 6)).resolves.toEqual([
      true,
      true,
      true,
      true,
      true,
      false,
    ]);
  });

  it('restores a daily budget once the hour has passed', async () => {
    const client = createFixtureSubtitleSourceClient({
      downloadBudgets: [{...subtitleSourceBudget, windowMs: 86400000}],
    });
    await openSubtitleSourceBreaker({
      subtitleSource: SUBTITLE_SOURCE,
      retryAfterMs: 1000,
      nowMs: NOW_MS,
      recoveryWindowMs: 3600000,
    });

    await expect(
      readSubtitleSourceBreaker(
        SUBTITLE_SOURCE,
        NOW_MS + 1000 + 3599999,
        3600000,
      ),
    ).resolves.toEqual({isOpen: false, budgetFactor: 0.5});
    await expect(
      spendTimes(6, {
        client,
        credentialId: null,
        isBackground: true,
        nowMs: NOW_MS + 1000 + 3600000,
      }),
    ).resolves.toEqual([true, true, true, true, true, false]);
  });
});

describe('a live search and its stored hits', () => {
  const cacheKey = `subtitle-search-cache:v1:${SUBTITLE_SOURCE}:tt0111161:tur`;

  it('stores the subtitle row before it answers', async () => {
    const searchHit = makeSubtitleSourceHit();
    const client = createFixtureSubtitleSourceClient({
      searchSubtitles: vi.fn(async () => [searchHit]),
    });

    const searchHits = await searchSubtitleSource({
      client,
      searchQuery: makeTurkishQuery(),
      ...WITHOUT_CREDENTIALS,
      nowMs: NOW_MS,
    });

    expect(searchHits).toEqual([searchHit]);
    expect(
      await Subtitle.count({where: {siteFileId: searchHit.siteFileId}}),
    ).toBe(1);
  });

  it('caches nothing when the hits cannot be stored', async () => {
    const client = createFixtureSubtitleSourceClient({
      searchSubtitles: vi.fn(async () => [
        makeSubtitleSourceHit(),
        makeSubtitleSourceHit({fileExtension: 'vtt'}),
      ]),
    });

    const searchHits = await searchSubtitleSource({
      client,
      searchQuery: makeTurkishQuery(),
      ...WITHOUT_CREDENTIALS,
      nowMs: NOW_MS,
    });
    await drainPendingSearches();

    expect(searchHits).toEqual([]);
    await expect(redis.get(cacheKey)).resolves.toBeNull();
    expect(await Subtitle.count()).toBe(0);
  });

  it('caches nothing when the source page can no longer be read', async () => {
    const client = createFixtureSubtitleSourceClient({
      searchSubtitles: vi.fn(async () => {
        throw new SourceUnavailableError({
          subtitleSource: SUBTITLE_SOURCE,
          cause: new Error('Subtitle rows unreadable.'),
        });
      }),
    });

    const searchHits = await searchSubtitleSource({
      client,
      searchQuery: makeTurkishQuery(),
      ...WITHOUT_CREDENTIALS,
      nowMs: NOW_MS,
    });
    await drainPendingSearches();

    expect(searchHits).toEqual([]);
    await expect(redis.get(cacheKey)).resolves.toBeNull();
  });

  it('caches only when the search ran, never the hits themselves', async () => {
    const client = createFixtureSubtitleSourceClient({
      searchSubtitles: vi.fn(async () => [makeSubtitleSourceHit()]),
    });

    await searchSubtitleSource({
      client,
      searchQuery: makeTurkishQuery(),
      ...WITHOUT_CREDENTIALS,
      nowMs: NOW_MS,
    });

    expect(JSON.parse(await redis.get(cacheKey))).toEqual({
      searchFetchedAt: NOW_MS,
    });
  });

  it('caches nothing when the source could not search', async () => {
    const client = createFixtureSubtitleSourceClient({
      searchSubtitles: vi.fn(async () => null),
    });

    await searchSubtitleSource({
      client,
      searchQuery: makeTurkishQuery(),
      ...WITHOUT_CREDENTIALS,
      nowMs: NOW_MS,
    });
    await drainPendingSearches();

    await expect(redis.get(cacheKey)).resolves.toBeNull();
  });

  it.each([
    ['the episode', {isEpisodeResolved: false}],
    ['the catalog', {isCatalogResolved: false}],
  ])(
    'searches live but caches and locks nothing when %s was not resolved',
    async (_, resolution) => {
      const searchHit = makeSubtitleSourceHit({languageCode: 'tur'});
      const client = createFixtureSubtitleSourceClient({
        searchSubtitles: vi.fn(async () => [searchHit]),
      });
      const searchQuery = makeTurkishQuery(resolution);
      const lockSpy = vi.spyOn(redis, 'set');

      for (const nowMs of [NOW_MS, NOW_MS + 1000]) {
        await searchSubtitleSource({
          client,
          searchQuery,
          ...WITHOUT_CREDENTIALS,
          nowMs,
        });
      }
      await drainPendingSearches();

      expect(client.searchSubtitles).toHaveBeenCalledTimes(2);
      await expect(redis.get(cacheKey)).resolves.toBeNull();
      expect(
        lockSpy.mock.calls.filter(([redisKey]) =>
          String(redisKey).startsWith('subtitle-search-lock:'),
        ),
      ).toEqual([]);
      expect(
        await Subtitle.count({where: {siteFileId: searchHit.siteFileId}}),
      ).toBe(1);
      lockSpy.mockRestore();
    },
  );

  it.each([
    [
      'a movie request for an episode id',
      {
        videoId: 'tt0111161:1:2',
        videoType: 'movie',
        catalogSeason: 1,
        catalogEpisode: 2,
      },
    ],
    [
      'a series request for a bare id',
      {videoId: 'tt0111161', videoType: 'series'},
    ],
  ])('searches and caches nothing for %s', async (_, queryOverrides) => {
    const client = createFixtureSubtitleSourceClient({
      searchSubtitles: vi.fn(async () => [makeSubtitleSourceHit()]),
    });
    const searchQuery = makeTurkishQuery(queryOverrides);

    const searchHits = await searchSubtitleSource({
      client,
      searchQuery,
      ...WITHOUT_CREDENTIALS,
      nowMs: NOW_MS,
    });
    await drainPendingSearches();

    expect(searchHits).toEqual([]);
    expect(client.searchSubtitles).not.toHaveBeenCalled();
    await expect(
      redis.keys(`subtitle-search-cache:v1:${SUBTITLE_SOURCE}:*`),
    ).resolves.toEqual([]);
  });

  it('answers an unresolved query from a fresh entry without a search', async () => {
    const client = createFixtureSubtitleSourceClient({
      searchSubtitles: vi.fn(async () => [makeSubtitleSourceHit()]),
    });

    await searchSubtitleSource({
      client,
      searchQuery: makeTurkishQuery(),
      ...WITHOUT_CREDENTIALS,
      nowMs: NOW_MS,
    });
    await searchSubtitleSource({
      client,
      searchQuery: makeTurkishQuery({isCatalogResolved: false}),
      ...WITHOUT_CREDENTIALS,
      nowMs: NOW_MS + 1000,
    });
    await drainPendingSearches();

    expect(client.searchSubtitles).toHaveBeenCalledTimes(1);
  });
});

describe('credential rotation', () => {
  it('marks a limited key and tries the next one', async () => {
    const searchHit = makeSubtitleSourceHit();
    const {userConfig, userConfigCredentials} = await createUserConfig({
      credentials: [
        makeApiKeyCredential('limited-api-key'),
        makeApiKeyCredential('fresh-api-key'),
      ],
    });
    const [limitedCredential, freshCredential] = userConfigCredentials;
    const client = createFixtureSubtitleSourceClient({
      credentialKinds: [CredentialKind.API_KEY],
      searchSubtitles: vi.fn(async (searchQuery, credential) => {
        if (credential.credentialId === limitedCredential.id) {
          throw new SourceRateLimitError({
            subtitleSource: SUBTITLE_SOURCE,
            retryAfterMs: RETRY_AFTER_MS,
            credentialId: credential.credentialId,
          });
        }
        return [searchHit];
      }),
    });

    const searchHits = await searchSubtitleSource({
      client,
      searchQuery: makeTurkishQuery(),
      ...readSearchCredentials({
        cachedUserConfig: await userConfigCache.get(userConfig.id),
        client,
      }),
      nowMs: NOW_MS,
    });

    expect(searchHits).toEqual([searchHit]);
    expect(
      await readCredentialStatuses([limitedCredential.id, freshCredential.id]),
    ).toEqual({
      [limitedCredential.id]: CredentialStatus.LIMITED,
      [freshCredential.id]: CredentialStatus.UNCHECKED,
    });
    await expect(
      readSubtitleSourceBreaker(SUBTITLE_SOURCE, NOW_MS + 1000),
    ).resolves.toEqual({isOpen: false, budgetFactor: 1});
  });

  it('never searches without a key once every key is rejected, even when the source allows it', async () => {
    const searchHit = makeSubtitleSourceHit();
    const rejectedCredential = makeSubtitleSourceCredential();
    const client = createFixtureSubtitleSourceClient({
      searchSubtitles: vi.fn(async (searchQuery, credential) => {
        if (credential) {
          throw new SourceCredentialError({
            subtitleSource: SUBTITLE_SOURCE,
            credentialId: credential.credentialId,
          });
        }
        return [searchHit];
      }),
    });

    const searchHits = await searchSubtitleSource({
      client,
      searchQuery: makeTurkishQuery(),
      credentials: [rejectedCredential],
      hasConfiguredCredential: true,
      nowMs: NOW_MS,
    });

    expect(searchHits).toEqual([]);
    expect(client.searchSubtitles).toHaveBeenCalledTimes(1);
    expect(client.searchSubtitles.mock.lastCall[1]).toBe(rejectedCredential);
  });
});

describe('OpenSubtitles search credentials', () => {
  function makeOpensubtitlesCredential(credentialKind, credentialSecret) {
    return {
      subtitleSource: SubtitleSource.OPENSUBTITLES,
      credentialKind,
      credentialSecret,
    };
  }

  const accountCredential = makeOpensubtitlesCredential(
    CredentialKind.ACCOUNT,
    {username: 'account-user', password: 'account-password'},
  );

  async function searchOpensubtitles(credentials) {
    const {userConfig, userConfigCredentials} = await createUserConfig({
      credentials,
    });
    return {
      userConfig,
      userConfigCredentials,
      runSearch: async () => {
        const client = createFixtureSubtitleSourceClient({
          subtitleSource: SubtitleSource.OPENSUBTITLES,
          credentialKinds: [CredentialKind.ACCOUNT, CredentialKind.API_KEY],
          searchSubtitles: vi.fn(async () => [
            makeSubtitleSourceHit({
              subtitleSource: SubtitleSource.OPENSUBTITLES,
            }),
          ]),
        });
        const searchHits = await searchSubtitleSource({
          client,
          searchQuery: makeTurkishQuery(),
          ...readSearchCredentials({
            cachedUserConfig: await userConfigCache.get(userConfig.id),
            client,
          }),
          nowMs: NOW_MS,
        });
        await drainPendingSearches();
        return {client, searchHits};
      },
    };
  }

  it('never searches with the app key when the user own key is invalid', async () => {
    const {userConfigCredentials, runSearch} = await searchOpensubtitles([
      accountCredential,
      makeOpensubtitlesCredential(CredentialKind.API_KEY, {
        apiKey: 'invalid-api-key',
      }),
    ]);
    await markCredentialStatus({
      credentialId: userConfigCredentials[1].id,
      credentialStatus: CredentialStatus.INVALID,
    });

    const {client, searchHits} = await runSearch();

    expect(searchHits).toEqual([]);
    expect(client.searchSubtitles).not.toHaveBeenCalled();
  });

  it('searches with the user own key before any account', async () => {
    const {userConfigCredentials, runSearch} = await searchOpensubtitles([
      accountCredential,
      makeOpensubtitlesCredential(CredentialKind.API_KEY, {
        apiKey: 'own-api-key',
      }),
    ]);

    const {client} = await runSearch();

    expect(client.searchSubtitles).toHaveBeenCalledTimes(1);
    expect(client.searchSubtitles.mock.calls[0][1]).toMatchObject({
      credentialId: userConfigCredentials[1].id,
      credentialKind: CredentialKind.API_KEY,
      apiKey: 'own-api-key',
    });
  });

  it('searches with an account when the user has no key', async () => {
    const {userConfigCredentials, runSearch} = await searchOpensubtitles([
      accountCredential,
    ]);

    const {client} = await runSearch();

    expect(client.searchSubtitles).toHaveBeenCalledTimes(1);
    expect(client.searchSubtitles.mock.calls[0][1]).toMatchObject({
      credentialId: userConfigCredentials[0].id,
      credentialKind: CredentialKind.ACCOUNT,
    });
  });
});

describe('the search lock owner', () => {
  it('leaves a lock another holder took after it expired', async () => {
    const searchCacheParts = `${SUBTITLE_SOURCE}:tt0111161:tur`;
    const lockKey = `subtitle-search-lock:v1:${searchCacheParts}`;
    const expiredToken = await acquireSearchLock(searchCacheParts);
    await redis.del(lockKey);
    const currentToken = await acquireSearchLock(searchCacheParts);

    await releaseSearchLock(searchCacheParts, expiredToken);

    expect(currentToken).not.toBe(expiredToken);
    await expect(redis.get(lockKey)).resolves.toBe(currentToken);
    await releaseSearchLock(searchCacheParts, currentToken);
    await expect(redis.get(lockKey)).resolves.toBeNull();
  });
});

describe('a credential-scoped search', () => {
  const ownToken = 'scs-fixture_token-0001-abcdEFGH';
  const otherToken = 'scs-other_token-0002-ijklMNOP';

  function makeScopedClient(searchSubtitles) {
    return createFixtureSubtitleSourceClient({
      subtitleSource: SubtitleSource.STREMIO_COMMUNITY_SUBTITLES,
      credentialKinds: [CredentialKind.ACCESS_TOKEN],
      isSearchHashSensitive: true,
      isSearchCredentialScoped: true,
      canSearchWithoutCredential: vi.fn(() => false),
      searchSubtitles,
    });
  }

  function makeTokenCredentials(accessToken) {
    return {
      credentials: [
        makeSubtitleSourceCredential({
          credentialKind: CredentialKind.ACCESS_TOKEN,
          apiKey: undefined,
          accessToken,
        }),
      ],
      hasConfiguredCredential: true,
    };
  }

  it('searches live for every user and writes nothing to the search cache', async () => {
    const ownHit = makeSubtitleSourceHit({
      subtitleSource: SubtitleSource.STREMIO_COMMUNITY_SUBTITLES,
      languageCode: 'tur',
    });
    const otherHit = makeSubtitleSourceHit({
      subtitleSource: SubtitleSource.STREMIO_COMMUNITY_SUBTITLES,
      languageCode: 'tur',
    });
    const client = makeScopedClient(
      vi.fn(async (_, {accessToken}) =>
        accessToken === ownToken ? [ownHit] : [otherHit],
      ),
    );

    const ownHits = await searchSubtitleSource({
      client,
      searchQuery: makeTurkishQuery(),
      ...makeTokenCredentials(ownToken),
      nowMs: NOW_MS,
    });
    const otherHits = await searchSubtitleSource({
      client,
      searchQuery: makeTurkishQuery(),
      ...makeTokenCredentials(otherToken),
      nowMs: NOW_MS + 1000,
    });
    const ownAgainHits = await searchSubtitleSource({
      client,
      searchQuery: makeTurkishQuery(),
      ...makeTokenCredentials(ownToken),
      nowMs: NOW_MS + 2000,
    });
    await drainPendingSearches();

    expect(ownHits).toEqual([ownHit]);
    expect(otherHits).toEqual([otherHit]);
    expect(ownAgainHits).toEqual([ownHit]);
    expect(client.searchSubtitles).toHaveBeenCalledTimes(3);
    expect(await Subtitle.count()).toBe(2);
    expect(await redis.keys('subtitle-search-cache:v1:*')).toEqual([]);
    expect(await redis.keys('subtitle-search-lock:v1:*')).toEqual([]);
  });

  it('searches nothing for a user without a token', async () => {
    const client = makeScopedClient(
      vi.fn(async () => [
        makeSubtitleSourceHit({
          subtitleSource: SubtitleSource.STREMIO_COMMUNITY_SUBTITLES,
          languageCode: 'tur',
        }),
      ]),
    );

    await searchSubtitleSource({
      client,
      searchQuery: makeTurkishQuery(),
      ...makeTokenCredentials(ownToken),
      nowMs: NOW_MS,
    });
    const tokenlessHits = await searchSubtitleSource({
      client,
      searchQuery: makeTurkishQuery(),
      ...WITHOUT_CREDENTIALS,
      nowMs: NOW_MS + 1000,
    });
    await drainPendingSearches();

    expect(tokenlessHits).toEqual([]);
    expect(client.searchSubtitles).toHaveBeenCalledTimes(1);
  });
});
