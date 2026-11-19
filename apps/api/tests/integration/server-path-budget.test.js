import {StatusCodes} from 'http-status-codes';
import {describe, expect, it, vi} from 'vitest';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {Subtitle} from '../../src/db/models/subtitle.js';
import {openSubtitleSourceBreaker} from '../../src/lib/subtitle-search/subtitle-source-breaker.js';
import {createAnisubClient} from '../../src/lib/subtitle-sources/anisub/anisub-client.js';
import {createSubtitleSourceRegistry} from '../../src/lib/subtitle-sources/subtitle-source-clients.js';
import {createThesubtitledbClient} from '../../src/lib/subtitle-sources/thesubtitledb/thesubtitledb-client.js';
import {downloadSubtitleFile} from '../../src/lib/subtitle-store/download-subtitle-file.js';
import {persistSearchHits} from '../../src/lib/subtitle-store/persist-search-hits.js';
import {userConfigCache} from '../../src/lib/user-config-cache.js';
import {redis} from '../../src/redis/index.js';
import {createUserConfig} from '../helpers/factories.js';
import {readFixture} from '../helpers/read-fixture.js';
import {
  toSharedAccessTokens,
  toSharedApiKeys,
} from '../helpers/shared-credential-secrets.js';
import {createTestSharedCredentialPool} from '../helpers/shared-credentials.js';
import {makeSubtitleSourceHit} from '../helpers/subtitle-source-factories.js';

const THESUBTITLEDB = SubtitleSource.THESUBTITLEDB;
const MOVIE_ID = 'tt0133093';
const SHARED_API_KEY = 'sdb_shared_budget_fixture_key';
const SHARED_ACCESS_TOKEN = '9|anisub_shared_budget_fixture_token';
const ANISUB_TOKEN_FILE_URL = 'https://anisub.co/api/subtitles/2329/download';
const BUDGET_PREFIX = `subtitle-source-budget:v1:${THESUBTITLEDB}:`;
const SHARED_BUDGET_PATTERN = new RegExp(
  `^${BUDGET_PREFIX}credential:shared-credential:${THESUBTITLEDB}:api-key:`,
);
const KEYLESS_BUDGET_PATTERN = new RegExp(`^${BUDGET_PREFIX}\\d+$`);
const MOVIE_SRT = [
  '1\n00:00:01,000 --> 00:00:03,000\nMerhaba dünya.\n',
  '2\n00:00:04,000 --> 00:00:06,000\nNasılsın bugün?\n',
].join('\n');

function createDownloadSetup({sharedApiKeys = []} = {}) {
  const requestSubtitleSource = vi.fn(async () => ({
    status: StatusCodes.OK,
    headers: {'content-type': 'application/x-subrip'},
    body: Buffer.from(MOVIE_SRT),
  }));
  const {sharedCredentialPool} = createTestSharedCredentialPool(
    sharedApiKeys.length > 0
      ? {[THESUBTITLEDB]: toSharedApiKeys(...sharedApiKeys)}
      : {},
  );
  const client = createThesubtitledbClient({
    requestSubtitleSource,
    sharedCredentialPool,
  });
  return {
    requestSubtitleSource,
    subtitleSourceRegistry: createSubtitleSourceRegistry([client]),
  };
}

async function downloadStoredHit({
  subtitleSourceRegistry,
  isBackground,
  hitOverrides = {},
}) {
  const searchHit = makeSubtitleSourceHit({
    subtitleSource: THESUBTITLEDB,
    ...hitOverrides,
  });
  await persistSearchHits({videoId: MOVIE_ID, searchHits: [searchHit]});
  const [{userConfig}, subtitle] = await Promise.all([
    createUserConfig(),
    Subtitle.findOne({
      where: {
        subtitleSource: searchHit.subtitleSource,
        siteFileId: searchHit.siteFileId,
      },
    }),
  ]);
  return downloadSubtitleFile({
    subtitle,
    videoContext: {
      videoId: MOVIE_ID,
      catalogSeason: null,
      catalogEpisode: null,
    },
    cachedUserConfig: await userConfigCache.get(userConfig.id),
    isBackground,
    subtitleSourceRegistry,
  });
}

async function listBudgetKeys() {
  return (await redis.keys(`${BUDGET_PREFIX}*`)).toSorted();
}

function readAuthorizations(requestSubtitleSource) {
  return requestSubtitleSource.mock.calls.map(
    ([siteRequest]) => siteRequest.headers.Authorization ?? null,
  );
}

function openKeylessPause() {
  return openSubtitleSourceBreaker({
    subtitleSource: THESUBTITLEDB,
    retryAfterMs: 120000,
    nowMs: Date.now(),
    isKeylessOnly: true,
  });
}

describe('a download on the server path', () => {
  it("spends the shared key's own budget and leaves the keyless budget whole", async () => {
    const setup = createDownloadSetup({sharedApiKeys: [SHARED_API_KEY]});

    await expect(
      downloadStoredHit({...setup, isBackground: false}),
    ).resolves.not.toHaveProperty('subtitleMessage');

    const budgetKeys = await listBudgetKeys();
    expect(budgetKeys).toEqual([expect.stringMatching(SHARED_BUDGET_PATTERN)]);
    expect(budgetKeys.some(key => KEYLESS_BUDGET_PATTERN.test(key))).toBe(
      false,
    );
    expect(readAuthorizations(setup.requestSubtitleSource)).toEqual([
      `Bearer ${SHARED_API_KEY}`,
    ]);
  });

  it('keeps every Valkey key and value free of the shared secret', async () => {
    const setup = createDownloadSetup({sharedApiKeys: [SHARED_API_KEY]});

    await downloadStoredHit({...setup, isBackground: false});

    const redisKeys = await redis.keys('*');
    const redisValues = await Promise.all(
      redisKeys.map(async redisKey =>
        (await redis.type(redisKey)) === 'string' ? redis.get(redisKey) : '',
      ),
    );
    for (const stored of [...redisKeys, ...redisValues]) {
      expect(stored).not.toContain(SHARED_API_KEY);
    }
  });

  it('spends the keyless budget for a call sent with no key', async () => {
    const setup = createDownloadSetup();

    await downloadStoredHit({...setup, isBackground: false});

    expect(await listBudgetKeys()).toEqual([
      expect.stringMatching(KEYLESS_BUDGET_PATTERN),
    ]);
    expect(readAuthorizations(setup.requestSubtitleSource)).toEqual([null]);
  });

  it("falls to the keyless budget once the shared key's own budget is full", async () => {
    const setup = createDownloadSetup({sharedApiKeys: [SHARED_API_KEY]});
    await downloadStoredHit({...setup, isBackground: false});
    const [sharedBudgetKey] = await listBudgetKeys();
    await redis.set(sharedBudgetKey, '100000', 'KEEPTTL');

    await downloadStoredHit({...setup, isBackground: false});

    expect(readAuthorizations(setup.requestSubtitleSource)).toEqual([
      `Bearer ${SHARED_API_KEY}`,
      null,
    ]);
    expect(
      (await listBudgetKeys()).some(key => KEYLESS_BUDGET_PATTERN.test(key)),
    ).toBe(true);
  });

  it('keeps the shared key serving while the keyless path is paused', async () => {
    const setup = createDownloadSetup({sharedApiKeys: [SHARED_API_KEY]});
    await openKeylessPause();

    await expect(
      downloadStoredHit({...setup, isBackground: false}),
    ).resolves.not.toHaveProperty('subtitleMessage');
    expect(readAuthorizations(setup.requestSubtitleSource)).toEqual([
      `Bearer ${SHARED_API_KEY}`,
    ]);
  });

  it("spends one call of a shared AniSub token's own budget in background work", async () => {
    const linkBody = Buffer.from(
      JSON.stringify(
        await readFixture('subtitle-sources/anisub/integration-download.json'),
      ),
    );
    const requestSubtitleSource = vi.fn(async siteRequest => ({
      status: StatusCodes.OK,
      headers: {
        'content-type': siteRequest.url.includes('/api/integrations/')
          ? 'application/json'
          : 'application/x-subrip',
      },
      body: siteRequest.url.includes('/api/integrations/')
        ? linkBody
        : Buffer.from(MOVIE_SRT),
    }));
    const {sharedCredentialPool} = createTestSharedCredentialPool({
      [SubtitleSource.ANISUB]: toSharedAccessTokens(SHARED_ACCESS_TOKEN),
    });
    const subtitleSourceRegistry = createSubtitleSourceRegistry([
      createAnisubClient({requestSubtitleSource, sharedCredentialPool}),
    ]);

    await expect(
      downloadStoredHit({
        subtitleSourceRegistry,
        isBackground: true,
        hitOverrides: {
          subtitleSource: SubtitleSource.ANISUB,
          siteFileUrl: ANISUB_TOKEN_FILE_URL,
        },
      }),
    ).resolves.not.toHaveProperty('subtitleMessage');

    expect(requestSubtitleSource).toHaveBeenCalledTimes(2);
    expect(
      await redis.keys(`subtitle-source-budget:v1:${SubtitleSource.ANISUB}:*`),
    ).toEqual([
      expect.stringMatching(
        /^subtitle-source-budget:v1:anisub:credential:shared-credential:anisub:access-token:/,
      ),
    ]);
  });

  it('refuses the keyless call while the keyless path is paused, sending nothing and stopping background work', async () => {
    const setup = createDownloadSetup();
    await openKeylessPause();

    await expect(
      downloadStoredHit({...setup, isBackground: true}),
    ).resolves.toMatchObject({isBudgetRefused: true});
    expect(setup.requestSubtitleSource).not.toHaveBeenCalled();
  });
});
