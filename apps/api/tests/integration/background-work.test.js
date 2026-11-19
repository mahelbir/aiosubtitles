import {strToU8} from 'fflate';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {
  CredentialKind,
  CredentialStatus,
} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {parseReleaseName} from '@repo/subtitle-core/release-name/parse-release-name.js';
import {COMPARISON_METHOD_VERSION} from '@repo/subtitle-core/timing/compare-cue-timings.js';
import {
  SubtitleFile,
  SubtitleFileOrigin,
} from '../../src/db/models/subtitle-file.js';
import {SubtitleReferenceComparison} from '../../src/db/models/subtitle-reference-comparison.js';
import {UserConfig} from '../../src/db/models/user-config.js';
import {markCredentialStatus} from '../../src/lib/credential-secret.js';
import {SHUTDOWN_DRAIN_WINDOW_MS} from '../../src/lib/shutdown-deadline.js';
import {
  BACKGROUND_QUEUE_SIZE_MAX,
  drainBackgroundQueues,
  enqueueBackgroundJob,
} from '../../src/lib/subtitle-background/background-queues.js';
import {
  compareWithReferences,
  downloadFreeCandidates,
  scheduleListBackgroundWork,
} from '../../src/lib/subtitle-background/background-jobs.js';
import {spendOpensubtitlesQuota} from '../../src/lib/subtitle-background/quota-spending.js';
import {openSubtitleSourceBreaker} from '../../src/lib/subtitle-search/subtitle-source-breaker.js';
import {spendSubtitleSourceBudget} from '../../src/lib/subtitle-search/subtitle-source-budget.js';
import {
  readDownloadCredentials,
  readUsableCredentials,
} from '../../src/lib/subtitle-source-credentials.js';
import {stremioCommunitySubtitlesMapping} from '../../src/lib/subtitle-sources/stremio-community-subtitles/stremio-community-subtitles-mapping.js';
import {SubtitleAliasSource} from '../../src/lib/subtitle-sources/subtitle-alias-source.js';
import {createSubtitleSourceRegistry} from '../../src/lib/subtitle-sources/subtitle-source-clients.js';
import {SubtitleSourceBudgetScope} from '../../src/lib/subtitle-sources/subtitle-source-contract.js';
import {SourceUnavailableError} from '../../src/lib/subtitle-sources/subtitle-source-errors.js';
import {persistSearchHits} from '../../src/lib/subtitle-store/persist-search-hits.js';
import {readVideoCandidates} from '../../src/lib/subtitle-store/read-video-candidates.js';
import {storeSubtitleFile} from '../../src/lib/subtitle-store/store-subtitle-file.js';
import {userConfigCache} from '../../src/lib/user-config-cache.js';
import {redis} from '../../src/redis/index.js';
import {
  getTestApp,
  getTestAppBasePath,
  setTestAppOptions,
} from '../helpers/app.js';
import {createUserConfig} from '../helpers/factories.js';
import {createFixtureSubtitleSourceClient} from '../helpers/fixture-subtitle-source.js';
import {makeSubtitleSourceHit} from '../helpers/subtitle-source-factories.js';
import {makeSwitchStatesOnly} from '../helpers/user-config-factories.js';

const MOVIE_ID = 'tt0133093';
const VIDEO_HASH = '8e245d9679d31e12';
const DAY_MS = 86400000;
const STRONG_NAME = 'Fixture.Movie.2024.1080p.BluRay.x264-GROUPA';
const WEAK_NAME = 'Fixture.Movie.2024.720p.HDTV.x265-OTHER';
const V3_FILE_URL = 'https://subs5.strem.io/en/download/file/123456';
const USER_CONFIG_CACHE_PREFIX = 'user-config-cache:';
const OPENSUBTITLES_IMPROVEMENT_ON = Object.freeze({
  [SubtitleSource.OPENSUBTITLES]: true,
});

const MOVIE_SRT = [
  '1\n00:00:01,000 --> 00:00:03,000\nMerhaba dünya.\n',
  '2\n00:00:04,000 --> 00:00:06,000\nNasılsın bugün?\n',
].join('\n');

const REFERENCE_CUE_STARTS_MS = Array.from(
  {length: 12},
  (_, cueIndex) => 4000 * (cueIndex + 1) + (cueIndex % 3) * 700,
);

const yifyClient = createFixtureSubtitleSourceClient({
  subtitleSource: SubtitleSource.YIFY,
  downloadBudgets: [
    {
      budgetScope: SubtitleSourceBudgetScope.SUBTITLE_SOURCE,
      windowMs: DAY_MS,
      requestMax: 10,
    },
  ],
  searchSubtitles: vi.fn(),
  downloadSubtitle: vi.fn(),
});

const altyazidbClient = createFixtureSubtitleSourceClient({
  subtitleSource: SubtitleSource.ALTYAZIDB,
  credentialKinds: [CredentialKind.API_KEY],
  downloadBudgets: [
    {
      budgetScope: SubtitleSourceBudgetScope.CREDENTIAL,
      windowMs: DAY_MS,
      requestMax: 4,
    },
    {
      budgetScope: SubtitleSourceBudgetScope.SUBTITLE_SOURCE,
      windowMs: DAY_MS,
      requestMax: 100,
    },
  ],
  canSearchWithoutCredential: vi.fn(() => false),
  canDownloadWithoutCredential: vi.fn(() => false),
  downloadSubtitle: vi.fn(),
});

const OPENSUBTITLES_FIXTURE_BUDGETS = [
  {
    budgetScope: SubtitleSourceBudgetScope.CREDENTIAL,
    windowMs: DAY_MS,
    requestMax: 100,
  },
  {
    budgetScope: SubtitleSourceBudgetScope.SUBTITLE_SOURCE,
    windowMs: DAY_MS,
    requestMax: 100,
  },
];

const SHIPPED_ACCOUNT_BUDGETS = [
  {
    budgetScope: SubtitleSourceBudgetScope.CREDENTIAL,
    windowMs: 5000,
    requestMax: 1,
  },
];

const opensubtitlesClient = createFixtureSubtitleSourceClient({
  subtitleSource: SubtitleSource.OPENSUBTITLES,
  credentialKinds: [CredentialKind.ACCOUNT, CredentialKind.API_KEY],
  downloadBudgets: OPENSUBTITLES_FIXTURE_BUDGETS,
  canDownloadWithoutCredential: vi.fn(() => false),
  downloadSubtitle: vi.fn(),
  readQuota: vi.fn(),
});

const opensubtitlesV3Client = createFixtureSubtitleSourceClient({
  subtitleSource: SubtitleSource.OPENSUBTITLES_V3,
  downloadSubtitle: vi.fn(),
});

const communityClient = createFixtureSubtitleSourceClient({
  subtitleSource: SubtitleSource.STREMIO_COMMUNITY_SUBTITLES,
  credentialKinds: [CredentialKind.ACCESS_TOKEN],
  downloadBudgets: [
    {
      budgetScope: SubtitleSourceBudgetScope.CREDENTIAL,
      windowMs: 60000,
      requestMax: 10,
    },
  ],
  canSearchWithoutCredential: vi.fn(() => false),
  canDownloadWithoutCredential: vi.fn(() => false),
  downloadSubtitle: vi.fn(),
});

const fixtureClients = [
  yifyClient,
  communityClient,
  altyazidbClient,
  opensubtitlesClient,
  opensubtitlesV3Client,
];

const subtitleSourceRegistry = createSubtitleSourceRegistry(fixtureClients);

setTestAppOptions({
  subtitleSourceRegistry,
  videoCatalog: {
    readCatalogMeta: async () => null,
    resolveKitsuVideo: async () => null,
  },
});

beforeEach(() => {
  for (const client of fixtureClients) {
    client.isAvailable.mockReset().mockReturnValue(true);
    client.downloadSubtitle
      .mockReset()
      .mockImplementation(async () => toDownload(MOVIE_SRT));
  }
  yifyClient.searchSubtitles.mockReset().mockResolvedValue([]);
  opensubtitlesClient.downloadBudgets = OPENSUBTITLES_FIXTURE_BUDGETS;
  opensubtitlesClient.readQuota.mockReset().mockImplementation(async () => ({
    credentialStatus: CredentialStatus.VALID,
    quotaRemainingCount: 1000,
    quotaAllowedCount: 1000,
    quotaResetAt: null,
  }));
});

afterEach(async () => {
  await drainBackgroundQueues();
});

function toDownload(fileText) {
  return {
    fileBytes: strToU8(fileText),
    fileNameHint: null,
    extractedEntryPath: null,
  };
}

function makeVideoContext(overrides = {}) {
  return {
    videoId: MOVIE_ID,
    catalogSeason: null,
    catalogEpisode: null,
    videoHash: VIDEO_HASH,
    videoRelease: parseReleaseName(STRONG_NAME),
    catalogDurationMs: null,
    ...overrides,
  };
}

function makeYifyHit(hitOverrides = {}) {
  return makeSubtitleSourceHit({
    subtitleSource: SubtitleSource.YIFY,
    ...hitOverrides,
  });
}

function makeHits(hitCount, hitOverrides = {}) {
  return Array.from({length: hitCount}, () => makeYifyHit(hitOverrides));
}

function makeOpensubtitlesHit(hitOverrides = {}) {
  return makeSubtitleSourceHit({
    subtitleSource: SubtitleSource.OPENSUBTITLES,
    isQuotaCostly: true,
    releaseNames: [STRONG_NAME],
    ...hitOverrides,
  });
}

function makeAccountCredential(username) {
  return {
    subtitleSource: SubtitleSource.OPENSUBTITLES,
    credentialKind: CredentialKind.ACCOUNT,
    credentialSecret: {username, password: `${username}-password`},
  };
}

function makeCommunityCredential(accessToken) {
  return {
    subtitleSource: SubtitleSource.STREMIO_COMMUNITY_SUBTITLES,
    credentialKind: CredentialKind.ACCESS_TOKEN,
    credentialSecret: {accessToken},
  };
}

function makeApiKeyCredential(subtitleSource, apiKey) {
  return {
    subtitleSource,
    credentialKind: CredentialKind.API_KEY,
    credentialSecret: {apiKey},
  };
}

function toTimedSrt(cueStartsMs) {
  return cueStartsMs
    .map((startMs, cueIndex) =>
      [
        String(cueIndex + 1),
        `${toSrtTime(startMs)} --> ${toSrtTime(startMs + 1500)}`,
        `Satır numarası ${cueIndex + 1} burada.`,
        '',
      ].join('\n'),
    )
    .join('\n');
}

function toSrtTime(timeMs) {
  const hours = Math.floor(timeMs / 3600000);
  const minutes = Math.floor(timeMs / 60000) % 60;
  const seconds = Math.floor(timeMs / 1000) % 60;
  const milliseconds = timeMs % 1000;
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)},${pad(milliseconds, 3)}`;
}

function pad(number, width) {
  return String(number).padStart(width, '0');
}

async function storeCandidates(searchHits, videoContext = makeVideoContext()) {
  await persistSearchHits({videoId: MOVIE_ID, searchHits});
  return readVideoCandidates({videoId: MOVIE_ID, videoContext});
}

function findCandidate(candidates, {subtitleSource, siteFileId}) {
  return candidates.find(
    candidate =>
      candidate.subtitleSource === subtitleSource &&
      candidate.siteFileId === siteFileId &&
      candidate.archiveEntryPath === '',
  );
}

function candidatesOf(candidates, subtitleSource) {
  return candidates.filter(
    candidate => candidate.subtitleSource === subtitleSource,
  );
}

async function storeFile(subtitleId, fileText = MOVIE_SRT) {
  await storeSubtitleFile({
    subtitleId,
    fileBytes: strToU8(fileText),
    fileNameHint: null,
    fileOrigin: SubtitleFileOrigin.DIRECT,
    expectedLanguageCode: 'tur',
    fallbackFrameRate: null,
  });
}

async function storeReference(hitOverrides = {}) {
  const referenceHit = makeYifyHit({
    releaseNames: [STRONG_NAME],
    hashMatchVideoHashes: [VIDEO_HASH],
    ...hitOverrides,
  });
  const candidates = await storeCandidates([referenceHit]);
  const reference = findCandidate(candidates, referenceHit);
  await storeFile(reference.subtitleId, toTimedSrt(REFERENCE_CUE_STARTS_MS));
  return reference;
}

async function readJobUser({
  listImprovementSwitchStates = OPENSUBTITLES_IMPROVEMENT_ON,
  ...userConfigOptions
} = {}) {
  const {userConfig, userConfigCredentials} = await createUserConfig({
    ...userConfigOptions,
    listImprovementSwitchStates,
  });
  return {
    userConfig,
    userConfigCredentials,
    cachedUserConfig: await userConfigCache.get(userConfig.id),
  };
}

async function runFreeDownloads({client, candidates, cachedUserConfig}) {
  return downloadFreeCandidates({
    client,
    candidates: candidatesOf(candidates, client.subtitleSource),
    videoContext: makeVideoContext(),
    credentials: await readDownloadCredentials({cachedUserConfig, client}),
    cachedUserConfig,
    subtitleSourceRegistry,
  });
}

function runQuotaSpending({candidates, cachedUserConfig, videoContext}) {
  return spendOpensubtitlesQuota({
    candidates,
    videoContext: videoContext ?? makeVideoContext(),
    accounts: readUsableCredentials({
      cachedUserConfig,
      subtitleSource: SubtitleSource.OPENSUBTITLES,
      credentialKinds: [CredentialKind.ACCOUNT],
    }),
    cachedUserConfig,
    subtitleSourceRegistry,
  });
}

async function runListBackgroundWork({candidates, cachedUserConfig}) {
  scheduleListBackgroundWork({
    cachedUserConfig,
    videoContext: makeVideoContext(),
    candidates,
    credentialsBySource: await readCredentialsBySource(cachedUserConfig),
    subtitleSourceRegistry,
  });
  await drainBackgroundQueues();
}

async function readCredentialsBySource(cachedUserConfig) {
  return Object.fromEntries(
    await Promise.all(
      fixtureClients.map(async client => [
        client.subtitleSource,
        await readDownloadCredentials({
          cachedUserConfig,
          client,
          isBackground: true,
        }),
      ]),
    ),
  );
}

function downloadedSiteFileIds(client) {
  return client.downloadSubtitle.mock.calls.map(
    ([subtitleRef]) => subtitleRef.siteFileId,
  );
}

function downloadCredentialIds(client) {
  return client.downloadSubtitle.mock.calls.map(
    ([, credential]) => credential?.credentialId ?? null,
  );
}

function siteFileIdsOf(searchHits) {
  return searchHits.map(({siteFileId}) => siteFileId);
}

async function readStoredSubtitleIds(subtitleIds) {
  const subtitleFiles = await SubtitleFile.findAll({
    attributes: ['subtitleId'],
    where: {subtitleId: subtitleIds},
    raw: true,
  });
  return subtitleFiles.map(({subtitleId}) => subtitleId);
}

async function readValkeyEntries() {
  const valkeyKeys = await redis.keys('*');
  return Promise.all(
    valkeyKeys.map(async valkeyKey => ({
      valkeyKey,
      valkeyText: JSON.stringify(await readValkeyValue(valkeyKey)),
    })),
  );
}

async function readValkeyValue(valkeyKey) {
  const valkeyType = await redis.type(valkeyKey);
  if (valkeyType === 'string') {
    return redis.get(valkeyKey);
  }
  if (valkeyType === 'hash') {
    return redis.hgetall(valkeyKey);
  }
  if (valkeyType === 'list') {
    return redis.lrange(valkeyKey, 0, -1);
  }
  if (valkeyType === 'set') {
    return redis.smembers(valkeyKey);
  }
  if (valkeyType === 'zset') {
    return redis.zrange(valkeyKey, 0, -1);
  }
  return null;
}

async function runOnFakeClock(runWork) {
  vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout', 'Date']});
  try {
    let isDone = false;
    const work = runWork().finally(() => {
      isDone = true;
    });
    while (!isDone) {
      await new Promise(resolve => {
        setImmediate(resolve);
      });
      if (vi.getTimerCount() > 0) {
        await vi.advanceTimersToNextTimerAsync();
      }
    }
    return await work;
  } finally {
    vi.useRealTimers();
  }
}

function createGate() {
  let openGate;
  const gate = new Promise(resolve => {
    openGate = resolve;
  });
  return {gate, openGate};
}

describe('the background queues', () => {
  it('drops jobs beyond the queue cap', async () => {
    const {gate, openGate} = createGate();
    let runCount = 0;
    const countRun = async () => {
      runCount += 1;
    };
    try {
      expect(BACKGROUND_QUEUE_SIZE_MAX).toBe(500);
      expect(
        enqueueBackgroundJob({
          subtitleSource: SubtitleSource.YIFY,
          runJob: async () => {
            await gate;
            await countRun();
          },
        }),
      ).toBe(true);
      const waitingAnswers = Array.from(
        {length: BACKGROUND_QUEUE_SIZE_MAX},
        () =>
          enqueueBackgroundJob({
            subtitleSource: SubtitleSource.YIFY,
            runJob: countRun,
          }),
      );

      expect(waitingAnswers.every(isAccepted => isAccepted === true)).toBe(
        true,
      );
      expect(
        enqueueBackgroundJob({
          subtitleSource: SubtitleSource.YIFY,
          runJob: countRun,
        }),
      ).toBe(false);
      expect(
        enqueueBackgroundJob({
          subtitleSource: SubtitleSource.ALTYAZIDB,
          runJob: countRun,
        }),
      ).toBe(true);
    } finally {
      openGate();
    }
    await drainBackgroundQueues();

    expect(runCount).toBe(BACKGROUND_QUEUE_SIZE_MAX + 2);
  });

  it('runs one job at a time per subtitle source', async () => {
    const {gate, openGate} = createGate();
    const runOrder = [];
    try {
      enqueueBackgroundJob({
        subtitleSource: SubtitleSource.YIFY,
        runJob: async () => {
          await gate;
          runOrder.push('first');
        },
      });
      enqueueBackgroundJob({
        subtitleSource: SubtitleSource.YIFY,
        runJob: async () => {
          runOrder.push('second');
        },
      });
      enqueueBackgroundJob({
        subtitleSource: SubtitleSource.ALTYAZIDB,
        runJob: async () => {
          runOrder.push('other source');
        },
      });
      await vi.waitFor(() => {
        expect(runOrder).toEqual(['other source']);
      });
    } finally {
      openGate();
    }
    await drainBackgroundQueues();

    expect(runOrder).toEqual(['other source', 'first', 'second']);
  });

  it('stops waiting for a stuck job after the shutdown window', async () => {
    const {gate, openGate} = createGate();
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
    try {
      enqueueBackgroundJob({
        subtitleSource: SubtitleSource.YIFY,
        runJob: () => gate,
      });
      let isDrained = false;
      const drain = drainBackgroundQueues().then(() => {
        isDrained = true;
      });

      await vi.advanceTimersByTimeAsync(SHUTDOWN_DRAIN_WINDOW_MS - 1000);
      expect(isDrained).toBe(false);
      await vi.advanceTimersByTimeAsync(1000);
      await drain;

      expect(isDrained).toBe(true);
    } finally {
      vi.useRealTimers();
      openGate();
    }
  });
});

describe('free background downloads', () => {
  it('downloads free candidates in name-score order within the background share', async () => {
    const {cachedUserConfig} = await readJobUser();
    const weakHits = makeHits(3, {releaseNames: [WEAK_NAME]});
    const strongHits = makeHits(5, {releaseNames: [STRONG_NAME]});
    const candidates = await storeCandidates([...weakHits, ...strongHits]);

    await runFreeDownloads({
      client: yifyClient,
      candidates,
      cachedUserConfig,
    });

    const downloadedIds = downloadedSiteFileIds(yifyClient);
    expect(downloadedIds).toHaveLength(5);
    expect(downloadedIds.toSorted()).toEqual(
      siteFileIdsOf(strongHits).toSorted(),
    );
    const strongSubtitleIds = strongHits.map(
      hit => findCandidate(candidates, hit).subtitleId,
    );
    expect((await readStoredSubtitleIds(strongSubtitleIds)).toSorted()).toEqual(
      strongSubtitleIds.toSorted(),
    );
  });

  it('downloads each file once', async () => {
    const {cachedUserConfig} = await readJobUser();
    const [storedHit, freshHit] = makeHits(2, {releaseNames: [STRONG_NAME]});
    const storedCandidates = await storeCandidates([storedHit, freshHit]);
    await storeFile(findCandidate(storedCandidates, storedHit).subtitleId);
    const candidates = await readVideoCandidates({
      videoId: MOVIE_ID,
      videoContext: makeVideoContext(),
    });

    await runFreeDownloads({
      client: yifyClient,
      candidates,
      cachedUserConfig,
    });
    await runFreeDownloads({
      client: yifyClient,
      candidates,
      cachedUserConfig,
    });

    expect(downloadedSiteFileIds(yifyClient)).toEqual([freshHit.siteFileId]);
  });

  it("never spends a user's key budget past the background share", async () => {
    const {userConfigCredentials, cachedUserConfig} = await readJobUser({
      credentials: [
        makeApiKeyCredential(SubtitleSource.ALTYAZIDB, 'altyazidb-share-key'),
      ],
    });
    const [credential] = userConfigCredentials;
    const candidates = await storeCandidates(
      makeHits(5, {
        subtitleSource: SubtitleSource.ALTYAZIDB,
        releaseNames: [STRONG_NAME],
      }),
    );

    await runFreeDownloads({
      client: altyazidbClient,
      candidates,
      cachedUserConfig,
    });

    expect(downloadCredentialIds(altyazidbClient)).toEqual([
      credential.id,
      credential.id,
    ]);
    const viewerSpends = [];
    for (let spendIndex = 0; spendIndex < 3; spendIndex += 1) {
      viewerSpends.push(
        await spendSubtitleSourceBudget({
          client: altyazidbClient,
          credentialId: credential.id,
          isBackground: false,
        }),
      );
    }
    expect(viewerSpends).toEqual([true, true, false]);
  });

  it('downloads nothing from a key-required source without a usable key', async () => {
    const invalidUser = await createUserConfig({
      credentials: [
        makeApiKeyCredential(SubtitleSource.ALTYAZIDB, 'altyazidb-invalid-key'),
      ],
    });
    await markCredentialStatus({
      credentialId: invalidUser.userConfigCredentials[0].id,
      credentialStatus: CredentialStatus.INVALID,
    });
    const {cachedUserConfig: keylessUserConfig} = await readJobUser();
    const candidates = await storeCandidates(
      makeHits(2, {
        subtitleSource: SubtitleSource.ALTYAZIDB,
        releaseNames: [STRONG_NAME],
      }),
    );

    for (const cachedUserConfig of [
      await userConfigCache.get(invalidUser.userConfig.id),
      keylessUserConfig,
    ]) {
      await runFreeDownloads({
        client: altyazidbClient,
        candidates,
        cachedUserConfig,
      });
    }

    expect(altyazidbClient.downloadSubtitle).not.toHaveBeenCalled();
  });

  async function readCommunityUser(listImprovementSwitchStates) {
    const accessToken = 'scs-fixture_token-0001-abcdEFGH';
    const {userConfigCredentials, cachedUserConfig} = await readJobUser({
      listImprovementSwitchStates,
      credentials: [
        {
          subtitleSource: SubtitleSource.STREMIO_COMMUNITY_SUBTITLES,
          credentialKind: CredentialKind.ACCESS_TOKEN,
          credentialSecret: {accessToken},
        },
      ],
    });
    const communityHits = stremioCommunitySubtitlesMapping.toSearchHits(
      {
        status: StatusCodes.OK,
        headers: {'content-type': 'application/json'},
        body: strToU8(
          JSON.stringify({
            subtitles: [
              {
                id: STRONG_NAME,
                url: `https://stremio-community-subtitles.top/${accessToken}/download/eyJhIjoxfQ.vtt`,
                lang: 'eng',
              },
            ],
          }),
        ),
      },
      {languageCodes: ['eng']},
    );
    expect(communityHits).toHaveLength(1);
    const candidates = await storeCandidates(communityHits);
    expect(
      candidatesOf(candidates, SubtitleSource.STREMIO_COMMUNITY_SUBTITLES),
    ).toEqual([expect.objectContaining({isQuotaCostly: true})]);
    return {userConfigCredentials, cachedUserConfig, candidates};
  }

  it("downloads a Community Subtitles row in the background with the user's token while its switch is on by default", async () => {
    const {userConfigCredentials, cachedUserConfig, candidates} =
      await readCommunityUser({});

    await runFreeDownloads({
      client: communityClient,
      candidates,
      cachedUserConfig,
    });

    expect(downloadCredentialIds(communityClient)).toEqual([
      userConfigCredentials[0].id,
    ]);
  });

  it('downloads at most three rows per language from a keyed source whose switch is on', async () => {
    const {cachedUserConfig} = await readJobUser({
      credentials: [
        {
          subtitleSource: SubtitleSource.STREMIO_COMMUNITY_SUBTITLES,
          credentialKind: CredentialKind.ACCESS_TOKEN,
          credentialSecret: {accessToken: 'scs-fixture_token-0002-abcdEFGH'},
        },
      ],
    });
    const makeCommunityHit = languageCode =>
      makeSubtitleSourceHit({
        subtitleSource: SubtitleSource.STREMIO_COMMUNITY_SUBTITLES,
        isQuotaCostly: true,
        releaseNames: [STRONG_NAME],
        languageCode,
      });
    const turkishHits = Array.from({length: 4}, () => makeCommunityHit('tur'));
    const englishHit = makeCommunityHit('eng');
    const candidates = await storeCandidates([...turkishHits, englishHit]);

    await runFreeDownloads({
      client: communityClient,
      candidates,
      cachedUserConfig,
    });

    const downloadedIds = downloadedSiteFileIds(communityClient);
    expect(downloadedIds).toHaveLength(4);
    expect(
      downloadedIds.filter(siteFileId =>
        siteFileIdsOf(turkishHits).includes(siteFileId),
      ),
    ).toHaveLength(3);
    expect(downloadedIds).toContain(englishHit.siteFileId);
  });

  it('never stores more than three rows per language for a title reopened again and again', async () => {
    const {cachedUserConfig} = await readJobUser({
      credentials: [makeCommunityCredential('scs-fixture_token-0003-abcdEFGH')],
    });
    const communityHits = Array.from({length: 5}, () =>
      makeSubtitleSourceHit({
        subtitleSource: SubtitleSource.STREMIO_COMMUNITY_SUBTITLES,
        isQuotaCostly: true,
        releaseNames: [STRONG_NAME],
        languageCode: 'tur',
      }),
    );
    await storeCandidates(communityHits);

    for (let listIndex = 0; listIndex < 3; listIndex += 1) {
      await runListBackgroundWork({
        candidates: await readVideoCandidates({
          videoId: MOVIE_ID,
          videoContext: makeVideoContext(),
        }),
        cachedUserConfig,
      });
    }

    expect(communityClient.downloadSubtitle).toHaveBeenCalledTimes(3);
    const candidates = await readVideoCandidates({
      videoId: MOVIE_ID,
      videoContext: makeVideoContext(),
    });
    expect(
      await readStoredSubtitleIds(
        communityHits.map(hit => findCandidate(candidates, hit).subtitleId),
      ),
    ).toHaveLength(3);
  });

  it('stops spending the user token once the switch is turned off while the job runs', async () => {
    const {userConfig, cachedUserConfig} = await readJobUser({
      credentials: [makeCommunityCredential('scs-fixture_token-0004-abcdEFGH')],
    });
    const candidates = await storeCandidates(
      Array.from({length: 3}, () =>
        makeSubtitleSourceHit({
          subtitleSource: SubtitleSource.STREMIO_COMMUNITY_SUBTITLES,
          isQuotaCostly: true,
          releaseNames: [STRONG_NAME],
          languageCode: 'tur',
        }),
      ),
    );
    communityClient.downloadSubtitle.mockImplementation(async () => {
      await UserConfig.update(
        {
          listImprovementSwitchStates: {
            [SubtitleSource.STREMIO_COMMUNITY_SUBTITLES]: false,
          },
        },
        {where: {id: userConfig.id}, individualHooks: true},
      );
      return toDownload(MOVIE_SRT);
    });

    await runListBackgroundWork({candidates, cachedUserConfig});

    expect(communityClient.downloadSubtitle).toHaveBeenCalledTimes(1);
  });

  it('never downloads a Community Subtitles row in the background once its switch is off', async () => {
    const {cachedUserConfig, candidates} = await readCommunityUser({
      [SubtitleSource.STREMIO_COMMUNITY_SUBTITLES]: false,
    });

    const downloadedIds = await runFreeDownloads({
      client: communityClient,
      candidates,
      cachedUserConfig,
    });

    expect(
      await readDownloadCredentials({
        cachedUserConfig,
        client: communityClient,
      }),
    ).toHaveLength(1);
    expect(downloadedIds).toEqual([]);
    expect(communityClient.downloadSubtitle).not.toHaveBeenCalled();
  });
});

describe('a queued background job', () => {
  async function scheduleBehindGate({cachedUserConfig, candidates}) {
    const {gate, openGate} = createGate();
    enqueueBackgroundJob({
      subtitleSource: SubtitleSource.YIFY,
      runJob: () => gate,
    });
    scheduleListBackgroundWork({
      cachedUserConfig,
      videoContext: makeVideoContext(),
      candidates,
      credentialsBySource: await readCredentialsBySource(cachedUserConfig),
      subtitleSourceRegistry,
    });
    return openGate;
  }

  it('downloads nothing once its configuration is deleted', async () => {
    const {userConfig, cachedUserConfig} = await readJobUser();
    const candidates = await storeCandidates(
      makeHits(2, {releaseNames: [STRONG_NAME]}),
    );
    const openGate = await scheduleBehindGate({cachedUserConfig, candidates});

    await UserConfig.destroy({where: {id: userConfig.id}});
    openGate();
    await drainBackgroundQueues();

    expect(yifyClient.downloadSubtitle).not.toHaveBeenCalled();
  });

  it('downloads nothing once its source is switched off', async () => {
    const {userConfig, cachedUserConfig} = await readJobUser();
    const candidates = await storeCandidates(
      makeHits(2, {releaseNames: [STRONG_NAME]}),
    );
    const openGate = await scheduleBehindGate({cachedUserConfig, candidates});

    await UserConfig.update(
      {subtitleSourceSwitchStates: {[SubtitleSource.YIFY]: false}},
      {where: {id: userConfig.id}, individualHooks: true},
    );
    openGate();
    await drainBackgroundQueues();

    expect(yifyClient.downloadSubtitle).not.toHaveBeenCalled();
  });

  it('downloads nothing once its source turns unavailable', async () => {
    const {cachedUserConfig} = await readJobUser();
    const candidates = await storeCandidates(
      makeHits(2, {releaseNames: [STRONG_NAME]}),
    );
    const openGate = await scheduleBehindGate({cachedUserConfig, candidates});

    yifyClient.isAvailable.mockResolvedValue(false);
    openGate();
    await drainBackgroundQueues();

    expect(yifyClient.downloadSubtitle).not.toHaveBeenCalled();
  });
});

describe('the list improvement switch through the subtitle list route', () => {
  const ALTYAZIDB_API_KEY = 'altyazidb-improvement-key';

  async function createAltyazidbUser(listImprovementSwitchStates) {
    return createUserConfig({
      subtitleSourceSwitchStates: makeSwitchStatesOnly([
        SubtitleSource.ALTYAZIDB,
      ]),
      listImprovementSwitchStates,
      credentials: [
        makeApiKeyCredential(SubtitleSource.ALTYAZIDB, ALTYAZIDB_API_KEY),
      ],
    });
  }

  async function requestAltyazidbList(userConfigId) {
    const searchHit = makeSubtitleSourceHit({
      subtitleSource: SubtitleSource.ALTYAZIDB,
      releaseNames: [STRONG_NAME],
    });
    altyazidbClient.searchSubtitles.mockResolvedValueOnce([searchHit]);
    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET',
      url: `${getTestAppBasePath()}/${userConfigId}/subtitles/movie/${MOVIE_ID}.json`,
    });
    expect(response.statusCode).toBe(StatusCodes.OK);
    return searchHit;
  }

  function holdAltyazidbQueue() {
    const {gate, openGate} = createGate();
    enqueueBackgroundJob({
      subtitleSource: SubtitleSource.ALTYAZIDB,
      runJob: () => gate,
    });
    return openGate;
  }

  function updateListImprovement(userConfigId, listImprovementSwitchStates) {
    return UserConfig.update(
      {listImprovementSwitchStates},
      {where: {id: userConfigId}, individualHooks: true},
    );
  }

  it("downloads with the user's key while the switch is on by default", async () => {
    const {userConfig, userConfigCredentials} = await createAltyazidbUser({});

    const searchHit = await requestAltyazidbList(userConfig.id);
    await drainBackgroundQueues();

    expect(downloadedSiteFileIds(altyazidbClient)).toEqual([
      searchHit.siteFileId,
    ]);
    expect(downloadCredentialIds(altyazidbClient)).toEqual([
      userConfigCredentials[0].id,
    ]);
  });

  it("never downloads with the user's key while the switch is off", async () => {
    const {userConfig} = await createAltyazidbUser({
      [SubtitleSource.ALTYAZIDB]: false,
    });

    await requestAltyazidbList(userConfig.id);
    await drainBackgroundQueues();

    expect(altyazidbClient.downloadSubtitle).not.toHaveBeenCalled();
  });

  it('downloads nothing once the switch is turned off while the job waits', async () => {
    const {userConfig} = await createAltyazidbUser({});
    const openGate = holdAltyazidbQueue();
    try {
      await requestAltyazidbList(userConfig.id);
      await updateListImprovement(userConfig.id, {
        [SubtitleSource.ALTYAZIDB]: false,
      });
    } finally {
      openGate();
    }
    await drainBackgroundQueues();

    expect(altyazidbClient.downloadSubtitle).not.toHaveBeenCalled();
  });

  it('downloads once the switch is turned on while the job waits', async () => {
    const {userConfig} = await createAltyazidbUser({
      [SubtitleSource.ALTYAZIDB]: false,
    });
    const openGate = holdAltyazidbQueue();
    let searchHit;
    try {
      searchHit = await requestAltyazidbList(userConfig.id);
      await updateListImprovement(userConfig.id, {
        [SubtitleSource.ALTYAZIDB]: true,
      });
    } finally {
      openGate();
    }
    await drainBackgroundQueues();

    expect(downloadedSiteFileIds(altyazidbClient)).toEqual([
      searchHit.siteFileId,
    ]);
  });
});

describe('the OpenSubtitles list improvement switch', () => {
  function holdOpensubtitlesQueue() {
    const {gate, openGate} = createGate();
    enqueueBackgroundJob({
      subtitleSource: SubtitleSource.OPENSUBTITLES,
      runJob: () => gate,
    });
    return openGate;
  }

  async function storeQuotaCandidates() {
    await storeReference();
    return storeCandidates([makeOpensubtitlesHit()]);
  }

  it('spends no quota while the switch is off by default', async () => {
    const {cachedUserConfig} = await readJobUser({
      listImprovementSwitchStates: {},
      credentials: [makeAccountCredential('default-off-user')],
    });
    const candidates = await storeQuotaCandidates();

    await runListBackgroundWork({candidates, cachedUserConfig});

    expect(opensubtitlesClient.downloadSubtitle).not.toHaveBeenCalled();
    expect(opensubtitlesClient.readQuota).not.toHaveBeenCalled();
  });

  it('still compares stored files with the reference while the switch is off', async () => {
    const {cachedUserConfig} = await readJobUser({
      listImprovementSwitchStates: {},
      credentials: [makeAccountCredential('compare-only-user')],
    });
    const reference = await storeReference();
    const storedHit = makeOpensubtitlesHit();
    const storedCandidates = await storeCandidates([storedHit]);
    const storedSubtitleId = findCandidate(
      storedCandidates,
      storedHit,
    ).subtitleId;
    await storeFile(storedSubtitleId, toTimedSrt(REFERENCE_CUE_STARTS_MS));
    const candidates = await readVideoCandidates({
      videoId: MOVIE_ID,
      videoContext: makeVideoContext(),
    });

    await runListBackgroundWork({candidates, cachedUserConfig});

    expect(opensubtitlesClient.readQuota).not.toHaveBeenCalled();
    expect(opensubtitlesClient.downloadSubtitle).not.toHaveBeenCalled();
    const comparisons = await SubtitleReferenceComparison.findAll({
      attributes: ['candidateSubtitleId', 'referenceSubtitleId'],
      where: {candidateSubtitleId: storedSubtitleId},
      raw: true,
    });
    expect(comparisons).toEqual([
      {
        candidateSubtitleId: storedSubtitleId,
        referenceSubtitleId: reference.subtitleId,
      },
    ]);
  });

  it('never stores more than three files per language for a title reopened again and again', async () => {
    const {cachedUserConfig} = await readJobUser({
      credentials: [makeAccountCredential('reopen-user')],
    });
    await storeReference();
    await storeCandidates(
      Array.from({length: 5}, () => makeOpensubtitlesHit()),
    );

    for (let listIndex = 0; listIndex < 3; listIndex += 1) {
      await runListBackgroundWork({
        candidates: await readVideoCandidates({
          videoId: MOVIE_ID,
          videoContext: makeVideoContext(),
        }),
        cachedUserConfig,
      });
    }

    expect(opensubtitlesClient.downloadSubtitle).toHaveBeenCalledTimes(3);
  });

  it('counts a stored file of the language against the cap', async () => {
    const {cachedUserConfig} = await readJobUser({
      credentials: [makeAccountCredential('stored-cap-user')],
    });
    await storeReference();
    const weakHit = makeOpensubtitlesHit({releaseNames: [WEAK_NAME]});
    const storedCandidates = await storeCandidates([
      weakHit,
      ...Array.from({length: 4}, () => makeOpensubtitlesHit()),
    ]);
    await storeFile(findCandidate(storedCandidates, weakHit).subtitleId);

    await runListBackgroundWork({
      candidates: await readVideoCandidates({
        videoId: MOVIE_ID,
        videoContext: makeVideoContext(),
      }),
      cachedUserConfig,
    });

    expect(opensubtitlesClient.downloadSubtitle).toHaveBeenCalledTimes(2);
  });

  it('stops spending quota once the switch is turned off while the job runs', async () => {
    const {userConfig, cachedUserConfig} = await readJobUser({
      credentials: [makeAccountCredential('mid-job-user')],
    });
    await storeReference();
    const candidates = await storeCandidates(
      Array.from({length: 2}, () => makeOpensubtitlesHit()),
    );
    opensubtitlesClient.downloadSubtitle.mockImplementation(async () => {
      await UserConfig.update(
        {listImprovementSwitchStates: {}},
        {where: {id: userConfig.id}, individualHooks: true},
      );
      return toDownload(MOVIE_SRT);
    });

    await runListBackgroundWork({candidates, cachedUserConfig});

    expect(opensubtitlesClient.downloadSubtitle).toHaveBeenCalledTimes(1);
  });

  it('spends quota within the background share once the switch is on', async () => {
    const {cachedUserConfig} = await readJobUser({
      credentials: [makeAccountCredential('switched-on-user')],
    });
    const candidates = await storeQuotaCandidates();

    await runListBackgroundWork({candidates, cachedUserConfig});

    expect(opensubtitlesClient.readQuota).toHaveBeenCalled();
    expect(opensubtitlesClient.downloadSubtitle).toHaveBeenCalledTimes(1);
  });

  it('spends no quota and reads no quota while the source is unavailable', async () => {
    const {cachedUserConfig} = await readJobUser({
      credentials: [makeAccountCredential('hidden-source-user')],
    });
    const candidates = await storeQuotaCandidates();
    opensubtitlesClient.isAvailable.mockResolvedValue(false);

    await runListBackgroundWork({candidates, cachedUserConfig});

    expect(opensubtitlesClient.readQuota).not.toHaveBeenCalled();
    expect(opensubtitlesClient.downloadSubtitle).not.toHaveBeenCalled();
  });

  it('spends no quota once the switch is turned off while the job waits', async () => {
    const {userConfig, cachedUserConfig} = await readJobUser({
      credentials: [makeAccountCredential('turned-off-user')],
    });
    const candidates = await storeQuotaCandidates();
    const openGate = holdOpensubtitlesQueue();
    try {
      scheduleListBackgroundWork({
        cachedUserConfig,
        videoContext: makeVideoContext(),
        candidates,
        credentialsBySource: await readCredentialsBySource(cachedUserConfig),
        subtitleSourceRegistry,
      });
      await UserConfig.update(
        {listImprovementSwitchStates: {}},
        {where: {id: userConfig.id}, individualHooks: true},
      );
    } finally {
      openGate();
    }
    await drainBackgroundQueues();

    expect(opensubtitlesClient.downloadSubtitle).not.toHaveBeenCalled();
  });

  it('spends quota once the switch is turned on while the job waits', async () => {
    const {userConfig, cachedUserConfig} = await readJobUser({
      listImprovementSwitchStates: {},
      credentials: [makeAccountCredential('turned-on-user')],
    });
    const candidates = await storeQuotaCandidates();
    const openGate = holdOpensubtitlesQueue();
    try {
      scheduleListBackgroundWork({
        cachedUserConfig,
        videoContext: makeVideoContext(),
        candidates,
        credentialsBySource: await readCredentialsBySource(cachedUserConfig),
        subtitleSourceRegistry,
      });
      await UserConfig.update(
        {listImprovementSwitchStates: OPENSUBTITLES_IMPROVEMENT_ON},
        {where: {id: userConfig.id}, individualHooks: true},
      );
    } finally {
      openGate();
    }
    await drainBackgroundQueues();

    expect(opensubtitlesClient.downloadSubtitle).toHaveBeenCalledTimes(1);
  });
});

describe('OpenSubtitles quota spending (rule A)', () => {
  it('spends OpenSubtitles quota only with a hash-matched reference', async () => {
    const {cachedUserConfig} = await readJobUser({
      credentials: [makeAccountCredential('quota-user')],
    });
    const opensubtitlesHits = Array.from({length: 3}, () =>
      makeOpensubtitlesHit(),
    );
    const candidates = await storeCandidates(opensubtitlesHits);

    await runQuotaSpending({candidates, cachedUserConfig});
    const unreferencedCallCount =
      opensubtitlesClient.downloadSubtitle.mock.calls.length;
    await storeReference();
    await runQuotaSpending({
      candidates: await readVideoCandidates({
        videoId: MOVIE_ID,
        videoContext: makeVideoContext(),
      }),
      cachedUserConfig,
    });

    expect(unreferencedCallCount).toBe(0);
    expect(downloadedSiteFileIds(opensubtitlesClient).toSorted()).toEqual(
      siteFileIdsOf(opensubtitlesHits).toSorted(),
    );
  });

  it('spends no OpenSubtitles quota from the list work without a reference', async () => {
    const {cachedUserConfig} = await readJobUser({
      credentials: [makeAccountCredential('list-quota-user')],
    });
    opensubtitlesV3Client.downloadSubtitle.mockRejectedValue(
      new SourceUnavailableError({
        subtitleSource: SubtitleSource.OPENSUBTITLES_V3,
      }),
    );
    const freeHit = makeYifyHit({releaseNames: [STRONG_NAME]});
    const candidates = await storeCandidates([
      freeHit,
      makeOpensubtitlesHit({
        subtitleAliases: [
          SubtitleAliasSource.OPENSUBTITLES_LEGACY,
          SubtitleAliasSource.OPENSUBTITLES_V3,
        ].map(aliasSource => ({aliasSource, aliasSiteFileId: '123456'})),
      }),
      makeOpensubtitlesHit(),
      makeSubtitleSourceHit({
        subtitleSource: SubtitleSource.OPENSUBTITLES_V3,
        siteFileId: '123456',
        siteFileUrl: V3_FILE_URL,
        isQuotaCostly: false,
      }),
    ]);

    await runListBackgroundWork({candidates, cachedUserConfig});

    expect(downloadedSiteFileIds(yifyClient)).toEqual([freeHit.siteFileId]);
    expect(opensubtitlesClient.downloadSubtitle).toHaveBeenCalledTimes(0);
  });

  it('downloads at most three candidates per language', async () => {
    const {cachedUserConfig} = await readJobUser({
      credentials: [makeAccountCredential('capped-user')],
    });
    await storeReference();
    const strongTurkishHits = Array.from({length: 3}, () =>
      makeOpensubtitlesHit(),
    );
    const weakTurkishHits = Array.from({length: 2}, () =>
      makeOpensubtitlesHit({releaseNames: [WEAK_NAME]}),
    );
    const englishHits = Array.from({length: 4}, () =>
      makeOpensubtitlesHit({languageCode: 'eng'}),
    );
    const candidates = await storeCandidates([
      ...weakTurkishHits,
      ...strongTurkishHits,
      ...englishHits,
    ]);

    await runQuotaSpending({candidates, cachedUserConfig});

    const downloadedIds = downloadedSiteFileIds(opensubtitlesClient);
    expect(opensubtitlesClient.downloadSubtitle).toHaveBeenCalledTimes(6);
    expect(
      downloadedIds
        .filter(siteFileId =>
          siteFileIdsOf([...strongTurkishHits, ...weakTurkishHits]).includes(
            siteFileId,
          ),
        )
        .toSorted(),
    ).toEqual(siteFileIdsOf(strongTurkishHits).toSorted());
    expect(
      downloadedIds.filter(siteFileId =>
        siteFileIdsOf(englishHits).includes(siteFileId),
      ),
    ).toHaveLength(3);
  });

  it('stops once the background has spent its quota share', async () => {
    const {cachedUserConfig} = await readJobUser({
      credentials: [makeAccountCredential('share-user')],
    });
    const accountQuota = {quotaRemainingCount: 12, quotaAllowedCount: 20};
    opensubtitlesClient.readQuota.mockImplementation(async () => ({
      credentialStatus: CredentialStatus.VALID,
      ...accountQuota,
      quotaResetAt: null,
    }));
    opensubtitlesClient.downloadSubtitle.mockImplementation(async () => {
      accountQuota.quotaRemainingCount -= 1;
      return toDownload(MOVIE_SRT);
    });
    await storeReference();
    const candidates = await storeCandidates(
      Array.from({length: 3}, () => makeOpensubtitlesHit()),
    );

    await runQuotaSpending({candidates, cachedUserConfig});

    expect(opensubtitlesClient.downloadSubtitle).toHaveBeenCalledTimes(2);
    expect(accountQuota.quotaRemainingCount).toBe(10);
  });

  it('downloads the reference first when its file is missing', async () => {
    const {cachedUserConfig} = await readJobUser({
      credentials: [makeAccountCredential('reference-user')],
    });
    const referenceHit = makeOpensubtitlesHit({
      languageCode: 'eng',
      hashMatchVideoHashes: [VIDEO_HASH],
    });
    const turkishHits = Array.from({length: 2}, () => makeOpensubtitlesHit());
    const candidates = await storeCandidates([...turkishHits, referenceHit]);

    await runQuotaSpending({candidates, cachedUserConfig});

    const downloadedIds = downloadedSiteFileIds(opensubtitlesClient);
    expect(opensubtitlesClient.downloadSubtitle).toHaveBeenCalledTimes(3);
    expect(downloadedIds[0]).toBe(referenceHit.siteFileId);
    expect(
      await readStoredSubtitleIds([
        findCandidate(candidates, referenceHit).subtitleId,
      ]),
    ).toHaveLength(1);
  });

  it('fetches a missing reference through a free path before spending quota', async () => {
    const {cachedUserConfig} = await readJobUser({
      credentials: [makeAccountCredential('free-reference-user')],
    });
    const referenceHit = makeOpensubtitlesHit({
      languageCode: 'eng',
      hashMatchVideoHashes: [VIDEO_HASH],
      subtitleAliases: [
        SubtitleAliasSource.OPENSUBTITLES_LEGACY,
        SubtitleAliasSource.OPENSUBTITLES_V3,
      ].map(aliasSource => ({aliasSource, aliasSiteFileId: '123456'})),
    });
    const turkishHits = Array.from({length: 2}, () => makeOpensubtitlesHit());
    const candidates = await storeCandidates([
      ...turkishHits,
      referenceHit,
      makeSubtitleSourceHit({
        subtitleSource: SubtitleSource.OPENSUBTITLES_V3,
        siteFileId: '123456',
        siteFileUrl: V3_FILE_URL,
        isQuotaCostly: false,
      }),
    ]);

    await runQuotaSpending({candidates, cachedUserConfig});

    expect(downloadedSiteFileIds(opensubtitlesV3Client)).toEqual(['123456']);
    expect(downloadedSiteFileIds(opensubtitlesClient).toSorted()).toEqual(
      siteFileIdsOf(turkishHits).toSorted(),
    );
    expect(opensubtitlesClient.downloadSubtitle).toHaveBeenCalledTimes(2);
  });

  it('downloads the reference under the shipped one-per-five-seconds account budget', async () => {
    const {cachedUserConfig} = await readJobUser({
      credentials: [makeAccountCredential('shipped-budget-user')],
    });
    opensubtitlesClient.downloadBudgets = [
      {
        budgetScope: SubtitleSourceBudgetScope.CREDENTIAL,
        windowMs: 5000,
        requestMax: 1,
      },
    ];
    const referenceHit = makeOpensubtitlesHit({
      hashMatchVideoHashes: [VIDEO_HASH],
    });
    const candidates = await storeCandidates([referenceHit]);

    await runQuotaSpending({candidates, cachedUserConfig});

    expect(downloadedSiteFileIds(opensubtitlesClient)).toEqual([
      referenceHit.siteFileId,
    ]);
    expect(opensubtitlesClient.downloadSubtitle).toHaveBeenCalledTimes(1);
  });
});

describe('reference comparisons', () => {
  it('stores one reference comparison per pair with the method version', async () => {
    const referenceSrt = toTimedSrt(REFERENCE_CUE_STARTS_MS);
    const shiftedSrt = toTimedSrt(
      REFERENCE_CUE_STARTS_MS.map(startMs => startMs + 2500),
    );
    const references = [];
    for (let referenceIndex = 0; referenceIndex < 2; referenceIndex += 1) {
      const referenceHit = makeYifyHit({
        releaseNames: [STRONG_NAME],
        hashMatchVideoHashes: [VIDEO_HASH],
      });
      const storedCandidates = await storeCandidates([referenceHit]);
      const reference = findCandidate(storedCandidates, referenceHit);
      await storeFile(reference.subtitleId, referenceSrt);
      references.push(reference);
    }
    const [alignedHit, shiftedHit] = makeHits(2, {
      releaseNames: [STRONG_NAME],
    });
    const candidates = await storeCandidates([alignedHit, shiftedHit]);
    const alignedId = findCandidate(candidates, alignedHit).subtitleId;
    const shiftedId = findCandidate(candidates, shiftedHit).subtitleId;
    await storeFile(alignedId, referenceSrt);
    await storeFile(shiftedId, shiftedSrt);
    await SubtitleReferenceComparison.create({
      candidateSubtitleId: alignedId,
      referenceSubtitleId: references[0].subtitleId,
      isSameTimeFamily: false,
      timingOffsetMs: null,
      timingFpsRatio: null,
      matchedCueShare: 0,
      comparisonMethodVersion: COMPARISON_METHOD_VERSION - 1,
      comparedAt: new Date(),
    });

    await compareWithReferences({
      videoContext: makeVideoContext(),
      candidateSubtitleIds: [alignedId, shiftedId],
    });

    const comparisons = await SubtitleReferenceComparison.findAll({
      attributes: [
        'candidateSubtitleId',
        'referenceSubtitleId',
        'isSameTimeFamily',
        'timingOffsetMs',
        'timingFpsRatio',
        'comparisonMethodVersion',
      ],
    });
    const comparisonRows = comparisons.map(comparison => ({
      candidateSubtitleId: comparison.candidateSubtitleId,
      referenceSubtitleId: comparison.referenceSubtitleId,
      isSameTimeFamily: comparison.isSameTimeFamily,
      timingOffsetMs: comparison.timingOffsetMs,
      timingFpsRatio: comparison.timingFpsRatio,
      comparisonMethodVersion: comparison.comparisonMethodVersion,
    }));
    const expectedRows = references.flatMap(({subtitleId}) => [
      {
        candidateSubtitleId: alignedId,
        referenceSubtitleId: subtitleId,
        isSameTimeFamily: true,
        timingOffsetMs: 0,
        timingFpsRatio: 1,
        comparisonMethodVersion: COMPARISON_METHOD_VERSION,
      },
      {
        candidateSubtitleId: shiftedId,
        referenceSubtitleId: subtitleId,
        isSameTimeFamily: false,
        timingOffsetMs: null,
        timingFpsRatio: null,
        comparisonMethodVersion: COMPARISON_METHOD_VERSION,
      },
    ]);
    expect(comparisonRows).toHaveLength(4);
    expect(comparisonRows).toEqual(expect.arrayContaining(expectedRows));
  });
});

describe('background work privacy', () => {
  it('keeps no user config id or credential in Valkey after a job', async () => {
    const apiKey = 'altyazidb-privacy-key-7f3c91';
    const username = 'privacy-user-9d1a42';
    const {userConfig, cachedUserConfig} = await readJobUser({
      credentials: [
        makeApiKeyCredential(SubtitleSource.ALTYAZIDB, apiKey),
        makeAccountCredential(username),
      ],
    });
    await storeReference();
    const candidates = await storeCandidates([
      makeSubtitleSourceHit({
        subtitleSource: SubtitleSource.ALTYAZIDB,
        releaseNames: [STRONG_NAME],
      }),
      makeOpensubtitlesHit(),
    ]);

    await runListBackgroundWork({candidates, cachedUserConfig});

    expect(altyazidbClient.downloadSubtitle).toHaveBeenCalledTimes(1);
    expect(opensubtitlesClient.downloadSubtitle).toHaveBeenCalledTimes(1);
    const valkeyEntries = await readValkeyEntries();
    expect(valkeyEntries.length).toBeGreaterThan(0);
    for (const secretText of [apiKey, username, `${username}-password`]) {
      expect(
        valkeyEntries.filter(
          ({valkeyKey, valkeyText}) =>
            valkeyKey.includes(secretText) || valkeyText.includes(secretText),
        ),
      ).toEqual([]);
    }
    expect(
      valkeyEntries.filter(
        ({valkeyKey, valkeyText}) =>
          !valkeyKey.startsWith(USER_CONFIG_CACHE_PREFIX) &&
          (valkeyKey.includes(userConfig.id) ||
            valkeyText.includes(userConfig.id)),
      ),
    ).toEqual([]);
  });
});

describe('the subtitle list route', () => {
  it('starts the background downloads after the reply', async () => {
    const {userConfig} = await createUserConfig({
      subtitleSourceSwitchStates: makeSwitchStatesOnly([SubtitleSource.YIFY]),
    });
    const searchHit = makeYifyHit({releaseNames: [STRONG_NAME]});
    yifyClient.searchSubtitles.mockResolvedValue([searchHit]);
    const {gate, openGate} = createGate();
    yifyClient.downloadSubtitle.mockImplementation(async () => {
      await gate;
      return toDownload(MOVIE_SRT);
    });
    const app = await getTestApp();
    let response;
    try {
      response = await app.inject({
        method: 'GET',
        url: `${getTestAppBasePath()}/${userConfig.id}/subtitles/movie/${MOVIE_ID}.json`,
      });
    } finally {
      openGate();
    }
    await drainBackgroundQueues();

    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(response.json().subtitles).toHaveLength(1);
    expect(downloadedSiteFileIds(yifyClient)).toEqual([searchHit.siteFileId]);
    const candidates = await readVideoCandidates({
      videoId: MOVIE_ID,
      videoContext: makeVideoContext({videoHash: null, videoRelease: null}),
    });
    expect(
      await readStoredSubtitleIds([
        findCandidate(candidates, searchHit).subtitleId,
      ]),
    ).toHaveLength(1);
  });
});

describe('background budget refusals', () => {
  it('stops the free downloads at the first budget refusal', async () => {
    const {cachedUserConfig} = await readJobUser();
    const candidates = await storeCandidates(
      makeHits(8, {releaseNames: [STRONG_NAME]}),
    );
    const credentialReads = yifyClient.canDownloadWithoutCredential;
    credentialReads.mockClear();

    await runFreeDownloads({
      client: yifyClient,
      candidates,
      cachedUserConfig,
    });

    expect(yifyClient.downloadSubtitle).toHaveBeenCalledTimes(5);
    expect(credentialReads).toHaveBeenCalledTimes(1 + 6);
  });

  it('downloads a site cue-shape match first among equal names', async () => {
    const {cachedUserConfig} = await readJobUser();
    const plainHits = makeHits(10, {releaseNames: [STRONG_NAME]});
    const shapeHit = makeYifyHit({
      releaseNames: [STRONG_NAME],
      siteCueCount: 1500,
      siteDurationMs: 7000000,
    });
    const candidates = await storeCandidates([...plainHits, shapeHit]);

    await downloadFreeCandidates({
      client: yifyClient,
      candidates: candidatesOf(candidates, SubtitleSource.YIFY),
      videoContext: makeVideoContext({catalogDurationMs: 7200000}),
      credentials: await readDownloadCredentials({
        cachedUserConfig,
        client: yifyClient,
      }),
      cachedUserConfig,
      subtitleSourceRegistry,
    });

    expect(downloadedSiteFileIds(yifyClient)[0]).toBe(shapeHit.siteFileId);
  });

  it('waits out the shipped account window to download three candidates', async () => {
    const {cachedUserConfig} = await readJobUser({
      credentials: [makeAccountCredential('window-user')],
    });
    opensubtitlesClient.downloadBudgets = SHIPPED_ACCOUNT_BUDGETS;
    await storeReference();
    const candidates = await storeCandidates(
      Array.from({length: 3}, () => makeOpensubtitlesHit()),
    );

    await runOnFakeClock(() =>
      runQuotaSpending({candidates, cachedUserConfig}),
    );

    expect(opensubtitlesClient.downloadSubtitle).toHaveBeenCalledTimes(3);
  });

  it('gives up a candidate after three refusals of a short window', async () => {
    const {cachedUserConfig} = await readJobUser({
      credentials: [makeAccountCredential('busy-window-user')],
    });
    opensubtitlesClient.downloadBudgets = SHIPPED_ACCOUNT_BUDGETS;
    opensubtitlesClient.readQuota.mockImplementation(async account => {
      await spendSubtitleSourceBudget({
        client: opensubtitlesClient,
        credentialId: account.credentialId,
        isBackground: false,
      });
      return {
        credentialStatus: CredentialStatus.VALID,
        quotaRemainingCount: 1000,
        quotaAllowedCount: 1000,
        quotaResetAt: null,
      };
    });
    await storeReference();
    const candidates = await storeCandidates(
      Array.from({length: 2}, () => makeOpensubtitlesHit()),
    );

    await runOnFakeClock(() =>
      runQuotaSpending({candidates, cachedUserConfig}),
    );

    expect(opensubtitlesClient.readQuota).toHaveBeenCalledTimes(3);
    expect(opensubtitlesClient.downloadSubtitle).toHaveBeenCalledTimes(0);
  });

  it('ends the quota job when breaker recovery leaves the window no slot', async () => {
    const {cachedUserConfig} = await readJobUser({
      credentials: [makeAccountCredential('recovering-user')],
    });
    opensubtitlesClient.downloadBudgets = SHIPPED_ACCOUNT_BUDGETS;
    await openSubtitleSourceBreaker({
      subtitleSource: SubtitleSource.OPENSUBTITLES,
      retryAfterMs: 1,
      nowMs: Date.now() - 1000,
    });
    await storeReference();
    const candidates = await storeCandidates(
      Array.from({length: 2}, () => makeOpensubtitlesHit()),
    );

    await runOnFakeClock(() =>
      runQuotaSpending({candidates, cachedUserConfig}),
    );

    expect(opensubtitlesClient.readQuota).toHaveBeenCalledTimes(1);
    expect(opensubtitlesClient.downloadSubtitle).toHaveBeenCalledTimes(0);
  });

  it('spends no quota on a reference whose free path the budget refused', async () => {
    const {cachedUserConfig} = await readJobUser({
      credentials: [makeAccountCredential('refused-v3-user')],
    });
    const referenceHit = makeOpensubtitlesHit({
      languageCode: 'eng',
      hashMatchVideoHashes: [VIDEO_HASH],
      subtitleAliases: [
        SubtitleAliasSource.OPENSUBTITLES_LEGACY,
        SubtitleAliasSource.OPENSUBTITLES_V3,
      ].map(aliasSource => ({aliasSource, aliasSiteFileId: '123456'})),
    });
    const candidates = await storeCandidates([
      referenceHit,
      makeOpensubtitlesHit(),
      makeSubtitleSourceHit({
        subtitleSource: SubtitleSource.OPENSUBTITLES_V3,
        siteFileId: '123456',
        siteFileUrl: V3_FILE_URL,
        isQuotaCostly: false,
      }),
    ]);
    let isSpent = true;
    while (isSpent) {
      isSpent = await spendSubtitleSourceBudget({
        client: opensubtitlesV3Client,
        credentialId: null,
        isBackground: true,
      });
    }

    await runQuotaSpending({candidates, cachedUserConfig});

    expect(opensubtitlesV3Client.downloadSubtitle).toHaveBeenCalledTimes(0);
    expect(opensubtitlesClient.downloadSubtitle).toHaveBeenCalledTimes(0);
  });

  it('checks the quota share again before a second account', async () => {
    const {cachedUserConfig} = await readJobUser({
      credentials: [
        makeAccountCredential('first-account'),
        makeAccountCredential('second-account'),
      ],
    });
    const remainingCounts = {'first-account': 6, 'second-account': 6};
    opensubtitlesClient.readQuota.mockImplementation(async ({username}) => ({
      credentialStatus: CredentialStatus.VALID,
      quotaRemainingCount: remainingCounts[username],
      quotaAllowedCount: 10,
      quotaResetAt: null,
    }));
    opensubtitlesClient.downloadSubtitle.mockImplementation(
      async (subtitleRef, {username}) => {
        remainingCounts[username] -= 2;
        throw new SourceUnavailableError({
          subtitleSource: SubtitleSource.OPENSUBTITLES,
        });
      },
    );
    await storeReference();
    const candidates = await storeCandidates([makeOpensubtitlesHit()]);

    await runQuotaSpending({candidates, cachedUserConfig});

    expect(opensubtitlesClient.downloadSubtitle).toHaveBeenCalledTimes(1);
  });
});

describe('rule A references', () => {
  it('leaves a reference from another subtitle source to that source', async () => {
    const {cachedUserConfig} = await readJobUser({
      credentials: [makeAccountCredential('foreign-reference-user')],
    });
    const candidates = await storeCandidates([
      makeYifyHit({
        releaseNames: [STRONG_NAME],
        hashMatchVideoHashes: [VIDEO_HASH],
      }),
      ...Array.from({length: 2}, () => makeOpensubtitlesHit()),
    ]);

    await runQuotaSpending({candidates, cachedUserConfig});

    expect(yifyClient.downloadSubtitle).toHaveBeenCalledTimes(0);
    expect(opensubtitlesClient.downloadSubtitle).toHaveBeenCalledTimes(0);
  });

  it('treats an invalid reference file as missing', async () => {
    const {cachedUserConfig} = await readJobUser({
      credentials: [makeAccountCredential('invalid-reference-user')],
    });
    const referenceHit = makeYifyHit({
      releaseNames: [STRONG_NAME],
      hashMatchVideoHashes: [VIDEO_HASH],
    });
    const referenceCandidates = await storeCandidates([referenceHit]);
    await storeFile(
      findCandidate(referenceCandidates, referenceHit).subtitleId,
      'no cues in this file',
    );
    await storeCandidates([makeOpensubtitlesHit()]);
    const candidates = await readVideoCandidates({
      videoId: MOVIE_ID,
      videoContext: makeVideoContext(),
    });

    await runQuotaSpending({candidates, cachedUserConfig});

    expect(opensubtitlesClient.downloadSubtitle).toHaveBeenCalledTimes(0);
  });

  it('stops the quota job when the reference cannot be fetched', async () => {
    const {cachedUserConfig} = await readJobUser({
      credentials: [makeAccountCredential('failed-reference-user')],
    });
    opensubtitlesClient.downloadSubtitle.mockRejectedValueOnce(
      new SourceUnavailableError({
        subtitleSource: SubtitleSource.OPENSUBTITLES,
      }),
    );
    const candidates = await storeCandidates([
      makeOpensubtitlesHit({
        languageCode: 'eng',
        hashMatchVideoHashes: [VIDEO_HASH],
      }),
      ...Array.from({length: 2}, () => makeOpensubtitlesHit()),
    ]);

    await runQuotaSpending({candidates, cachedUserConfig});

    expect(opensubtitlesClient.downloadSubtitle).toHaveBeenCalledTimes(1);
  });

  it('ignores a reference from a switched-off subtitle source', async () => {
    const {cachedUserConfig} = await readJobUser({
      credentials: [makeAccountCredential('switched-off-user')],
      subtitleSourceSwitchStates: makeSwitchStatesOnly(
        SubtitleSource.values.filter(
          subtitleSource => subtitleSource !== SubtitleSource.YIFY,
        ),
      ),
    });
    await storeReference();
    const candidates = await storeCandidates([makeOpensubtitlesHit()]);

    await runListBackgroundWork({candidates, cachedUserConfig});

    expect(opensubtitlesClient.downloadSubtitle).toHaveBeenCalledTimes(0);
  });

  it('spends no further quota on a second list of the same video', async () => {
    const {cachedUserConfig} = await readJobUser({
      credentials: [makeAccountCredential('repeat-list-user')],
    });
    await storeReference();
    const candidates = await storeCandidates([makeOpensubtitlesHit()]);

    await runListBackgroundWork({candidates, cachedUserConfig});
    await runListBackgroundWork({candidates, cachedUserConfig});

    expect(opensubtitlesClient.downloadSubtitle).toHaveBeenCalledTimes(1);
  });
});

describe('list background work across subtitle sources', () => {
  it('skips a free alias of a file another subtitle source already stored', async () => {
    const {cachedUserConfig} = await readJobUser();
    const opensubtitlesHit = makeOpensubtitlesHit({
      subtitleAliases: [
        {
          aliasSource: SubtitleAliasSource.OPENSUBTITLES_V3,
          aliasSiteFileId: '123456',
        },
      ],
    });
    const storedCandidates = await storeCandidates([
      opensubtitlesHit,
      makeSubtitleSourceHit({
        subtitleSource: SubtitleSource.OPENSUBTITLES_V3,
        siteFileId: '123456',
        siteFileUrl: V3_FILE_URL,
        isQuotaCostly: false,
      }),
    ]);
    await storeFile(
      findCandidate(storedCandidates, opensubtitlesHit).subtitleId,
    );
    const candidates = await readVideoCandidates({
      videoId: MOVIE_ID,
      videoContext: makeVideoContext(),
    });

    await runListBackgroundWork({candidates, cachedUserConfig});

    expect(opensubtitlesV3Client.downloadSubtitle).toHaveBeenCalledTimes(0);
  });

  it('keeps one waiting job per job key', async () => {
    const {gate, openGate} = createGate();
    let runCount = 0;
    const countRun = async () => {
      runCount += 1;
    };
    const jobAnswers = [];
    try {
      enqueueBackgroundJob({
        subtitleSource: SubtitleSource.YIFY,
        runJob: () => gate,
      });
      for (const jobKey of ['first', 'first', 'second']) {
        jobAnswers.push(
          enqueueBackgroundJob({
            subtitleSource: SubtitleSource.YIFY,
            jobKey,
            runJob: countRun,
          }),
        );
      }
    } finally {
      openGate();
    }
    await drainBackgroundQueues();

    expect(jobAnswers).toEqual([true, false, true]);
    expect(runCount).toBe(2);
  });
});
