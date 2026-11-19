import * as fs from 'node:fs/promises';
import {StatusCodes} from 'http-status-codes';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {CredentialKind} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {Subtitle} from '../../src/db/models/subtitle.js';
import {SETTINGS_FILE, settings} from '../../src/lib/settings.js';
import {drainBackgroundQueues} from '../../src/lib/subtitle-background/background-queues.js';
import {readDownloadCredentials} from '../../src/lib/subtitle-source-credentials.js';
import {createAnisubClient} from '../../src/lib/subtitle-sources/anisub/anisub-client.js';
import {createBetaseriesClient} from '../../src/lib/subtitle-sources/betaseries/betaseries-client.js';
import {createJimakuClient} from '../../src/lib/subtitle-sources/jimaku/jimaku-client.js';
import {createSharedCredentialPool} from '../../src/lib/subtitle-sources/shared-credential-pool.js';
import {createSubtitleSourceRegistry} from '../../src/lib/subtitle-sources/subtitle-source-clients.js';
import {userConfigCache} from '../../src/lib/user-config-cache.js';
import {redis} from '../../src/redis/index.js';
import {requestAddonPath, toListPath} from '../helpers/addon-requests.js';
import {getTestAppBasePath, setTestAppOptions} from '../helpers/app.js';
import {createUserConfig} from '../helpers/factories.js';
import {readFixture} from '../helpers/read-fixture.js';

const JIMAKU_SHARED_KEY = 'jimaku-shared-fixture-key';
const JIMAKU_USER_KEY = 'jimaku-user-fixture-key';
const BETASERIES_SHARED_KEY = 'betaseries-shared-fixture-key';
const ANISUB_SHARED_TOKEN = '11|anisub-shared-fixture-token';
const ANISUB_USER_TOKEN = '12|anisub-user-fixture-token';
const KITSU_VIDEO_ID = 'kitsu:46474:5';
const BETASERIES_VIDEO_ID = 'tt9900001:1:3';
const ANISUB_VIDEO_ID = 'tt0111161';
const ANISUB_SEARCH_URL = `https://anisub.co/subtitles/movie/${ANISUB_VIDEO_ID}.json`;
const ANISUB_SITE_FILE_URL = 'https://anisub.co/api/subtitles/2329/download';
const ANISUB_TOKEN_DOWNLOAD_URL =
  'https://anisub.co/api/integrations/subtitles/2329/download';
const ANISUB_CDN_FILE_URL =
  'https://cdn.anisub.co/subtitles/2025/09/2329-fixture.srt';
const SRT_TEXT = '1\n00:00:01,000 --> 00:00:02,000\nMerhaba dünya.\n';
const JSON_HEADERS = {'content-type': 'application/json'};
const REDIS_VALUE_READERS = {
  none: async () => '',
  string: redisKey => redis.get(redisKey),
  hash: redisKey => redis.hgetall(redisKey),
  list: redisKey => redis.lrange(redisKey, 0, -1),
  set: redisKey => redis.smembers(redisKey),
  zset: redisKey => redis.zrange(redisKey, 0, -1, 'WITHSCORES'),
};

const siteAnswers = new Map();
const unexpectedUrls = [];
const requestSite = vi.fn();
let testPool = createSharedCredentialPool();
const sharedCredentialPool = {
  hasUsableCredential: subtitleSource =>
    testPool.hasUsableCredential(subtitleSource),
  callWithCredential: callOptions => testPool.callWithCredential(callOptions),
};
const clientOptions = {
  requestSubtitleSource: requestSite,
  sharedCredentialPool,
};

const jimakuClient = createJimakuClient({
  readAnilistId: async () => 154587,
  ...clientOptions,
});
const anisubClient = createAnisubClient(clientOptions);

setTestAppOptions({
  subtitleSourceRegistry: createSubtitleSourceRegistry([
    jimakuClient,
    createBetaseriesClient(clientOptions),
    anisubClient,
  ]),
  videoCatalog: {
    readCatalogMeta: vi.fn(async () => null),
    resolveKitsuVideo: vi.fn(async () => ({
      imdbId: 'tt22248376',
      catalogSeason: 1,
      catalogEpisode: 5,
    })),
  },
});

beforeEach(() => {
  testPool = createSharedCredentialPool();
  siteAnswers.clear();
  unexpectedUrls.length = 0;
  requestSite.mockReset().mockImplementation(async siteRequest => {
    const answerSite = siteAnswers.get(toSiteKey(siteRequest.url));
    if (!answerSite) {
      unexpectedUrls.push(siteRequest.url);
      return {status: StatusCodes.NOT_FOUND, headers: {}, body: null};
    }
    return answerSite(siteRequest);
  });
});

afterEach(async () => {
  await drainBackgroundQueues();
  await writeSharedCredentials({});
  expect(unexpectedUrls).toEqual([]);
});

async function writeSharedCredentials(sharedCredentials) {
  await fs.writeFile(SETTINGS_FILE, JSON.stringify({sharedCredentials}));
  await settings.reload();
}

function toSiteKey(siteUrl) {
  const {origin, pathname} = new URL(siteUrl);
  return `${origin}${decodeURIComponent(pathname)}`;
}

function answerSite(siteUrl, answer) {
  siteAnswers.set(toSiteKey(siteUrl), answer);
}

function toJsonAnswer(body) {
  return {status: StatusCodes.OK, headers: JSON_HEADERS, body};
}

function toFileAnswer() {
  return {
    status: StatusCodes.OK,
    headers: {'content-type': 'application/x-subrip'},
    body: Buffer.from(SRT_TEXT),
  };
}

function listRequestsTo(sitePrefix) {
  return requestSite.mock.calls
    .map(([siteRequest]) => siteRequest)
    .filter(({url}) => url.startsWith(sitePrefix));
}

async function readSubtitleList({userConfigId, videoType, videoId}) {
  const response = await requestAddonPath(
    toListPath({userConfigId, videoType, videoId}),
  );
  expect(response.statusCode).toBe(StatusCodes.OK);
  await drainBackgroundQueues();
  return response;
}

async function expectNowhereStored(sharedSecret) {
  const [subtitleRows, redisKeys] = await Promise.all([
    Subtitle.findAll({
      attributes: ['urlCode', 'siteFileId', 'siteFileUrl', 'releaseNames'],
      raw: true,
    }),
    redis.keys('*'),
  ]);
  const redisValues = await Promise.all(redisKeys.map(readRedisValue));
  expect(JSON.stringify(subtitleRows)).not.toContain(sharedSecret);
  expect(JSON.stringify([...redisKeys, ...redisValues])).not.toContain(
    sharedSecret,
  );
}

async function readRedisValue(redisKey) {
  const redisType = await redis.type(redisKey);
  const readValue = REDIS_VALUE_READERS[redisType];
  if (!readValue) {
    throw new Error(`No reader for a Redis ${redisType} value.`);
  }
  return readValue(redisKey);
}

async function answerJimakuSite() {
  const [entriesBody, filesBody] = await Promise.all([
    readFixture('subtitle-sources/jimaku/entries-search.json'),
    readFixture('subtitle-sources/jimaku/entry-files.json'),
  ]);
  answerSite('https://jimaku.cc/api/entries/search', () =>
    toJsonAnswer(entriesBody),
  );
  answerSite('https://jimaku.cc/api/entries/1234/files', () =>
    toJsonAnswer(filesBody),
  );
}

async function answerJimakuFiles() {
  for (const {url} of await readFixture(
    'subtitle-sources/jimaku/entry-files.json',
  )) {
    answerSite(new URL(url, 'https://jimaku.cc').href, toFileAnswer);
  }
}

function listJimakuApiKeys() {
  return listRequestsTo('https://jimaku.cc/api/').map(
    ({headers}) => headers.Authorization,
  );
}

function makeJimakuUserCredential() {
  return {
    subtitleSource: SubtitleSource.JIMAKU,
    credentialKind: CredentialKind.API_KEY,
    credentialSecret: {apiKey: JIMAKU_USER_KEY},
  };
}

function makeAnisubUserCredential() {
  return {
    subtitleSource: SubtitleSource.ANISUB,
    credentialKind: CredentialKind.ACCESS_TOKEN,
    credentialSecret: {accessToken: ANISUB_USER_TOKEN},
  };
}

describe('Jimaku with a shared server key', () => {
  it('lists what a shared key finds for a user without a key of their own', async () => {
    await writeSharedCredentials({
      [SubtitleSource.JIMAKU]: [JIMAKU_SHARED_KEY],
    });
    await answerJimakuSite();
    await answerJimakuFiles();
    const {userConfig} = await createUserConfig({languageCodes: ['jpn']});

    const response = await readSubtitleList({
      userConfigId: userConfig.id,
      videoType: 'anime',
      videoId: KITSU_VIDEO_ID,
    });

    expect(response.json().subtitles.length).toBeGreaterThan(0);
    expect(listJimakuApiKeys()).not.toHaveLength(0);
    expect(
      listJimakuApiKeys().every(apiKey => apiKey === JIMAKU_SHARED_KEY),
    ).toBe(true);
    expect(response.body).not.toContain(JIMAKU_SHARED_KEY);
    await expectNowhereStored(JIMAKU_SHARED_KEY);
  });

  it('calls nothing for a user without a key while the server has none', async () => {
    const {userConfig} = await createUserConfig({languageCodes: ['jpn']});

    const response = await readSubtitleList({
      userConfigId: userConfig.id,
      videoType: 'anime',
      videoId: KITSU_VIDEO_ID,
    });

    expect(response.json().subtitles).toEqual([]);
    expect(requestSite).not.toHaveBeenCalled();
  });

  it("downloads in the background without any key, whatever key the user has, and never sends the user's key", async () => {
    await answerJimakuSite();
    await answerJimakuFiles();
    const {userConfig} = await createUserConfig({
      languageCodes: ['jpn'],
      credentials: [makeJimakuUserCredential()],
    });

    const response = await readSubtitleList({
      userConfigId: userConfig.id,
      videoType: 'anime',
      videoId: KITSU_VIDEO_ID,
    });

    expect(response.json().subtitles.length).toBeGreaterThan(0);
    expect(
      listJimakuApiKeys().every(apiKey => apiKey === JIMAKU_USER_KEY),
    ).toBe(true);
    const fileRequests = listRequestsTo('https://jimaku.cc/entry/');
    expect(fileRequests).not.toHaveLength(0);
    for (const fileRequest of fileRequests) {
      expect(fileRequest.headers).toEqual({});
      expect(fileRequest.credentialId).toBeNull();
    }
  });

  it('keeps the list and skips the background work when its credentials cannot be read', async () => {
    await answerJimakuSite();
    const {userConfig} = await createUserConfig({
      languageCodes: ['jpn'],
      credentials: [makeJimakuUserCredential()],
    });
    const readFailure = vi
      .spyOn(anisubClient, 'canDownloadWithoutCredential')
      .mockRejectedValue(new Error('The credential read broke.'));

    try {
      const response = await readSubtitleList({
        userConfigId: userConfig.id,
        videoType: 'anime',
        videoId: KITSU_VIDEO_ID,
      });

      expect(response.json().subtitles.length).toBeGreaterThan(0);
      expect(readFailure).toHaveBeenCalled();
      expect(listRequestsTo('https://jimaku.cc/entry/')).toEqual([]);
    } finally {
      readFailure.mockRestore();
    }
  });

  it('downloads keyless in the foreground and the background alike, since a file download sends no key', async () => {
    await writeSharedCredentials({
      [SubtitleSource.JIMAKU]: [JIMAKU_SHARED_KEY],
    });
    const {userConfig} = await createUserConfig({
      credentials: [makeJimakuUserCredential()],
    });
    const cachedUserConfig = await userConfigCache.get(userConfig.id);

    const [foregroundCredentials, backgroundCredentials] = await Promise.all([
      readDownloadCredentials({cachedUserConfig, client: jimakuClient}),
      readDownloadCredentials({
        cachedUserConfig,
        client: jimakuClient,
        isBackground: true,
      }),
    ]);

    expect(foregroundCredentials).toEqual([null]);
    expect(backgroundCredentials).toEqual([null]);
  });

  it("gives AniSub background work the server path while the foreground keeps the user's own token", async () => {
    await writeSharedCredentials({
      [SubtitleSource.ANISUB]: [ANISUB_SHARED_TOKEN],
    });
    const {userConfig} = await createUserConfig({
      credentials: [makeAnisubUserCredential()],
    });
    const cachedUserConfig = await userConfigCache.get(userConfig.id);

    const [foregroundCredentials, backgroundCredentials] = await Promise.all([
      readDownloadCredentials({cachedUserConfig, client: anisubClient}),
      readDownloadCredentials({
        cachedUserConfig,
        client: anisubClient,
        isBackground: true,
      }),
    ]);

    expect(foregroundCredentials).toEqual([
      expect.objectContaining({accessToken: ANISUB_USER_TOKEN}),
    ]);
    expect(backgroundCredentials).toEqual([null]);
  });

  it('gives background work the keyless path, never the user key, while the server has no shared key', async () => {
    const {userConfig} = await createUserConfig({
      credentials: [makeJimakuUserCredential()],
    });

    await expect(
      readDownloadCredentials({
        cachedUserConfig: await userConfigCache.get(userConfig.id),
        client: jimakuClient,
        isBackground: true,
      }),
    ).resolves.toEqual([null]);
  });
});

describe('BetaSeries with a shared server key', () => {
  it('lists what a shared key finds for a user without a key of their own', async () => {
    await writeSharedCredentials({
      [SubtitleSource.BETASERIES]: [BETASERIES_SHARED_KEY],
    });
    const [showBody, episodesBody, subtitlesBody] = await Promise.all([
      readFixture('subtitle-sources/betaseries/shows-display.json'),
      readFixture('subtitle-sources/betaseries/shows-episodes.json'),
      readFixture('subtitle-sources/betaseries/subtitles-episode.json'),
    ]);
    answerSite('https://api.betaseries.com/shows/display', () =>
      toJsonAnswer(showBody),
    );
    answerSite('https://api.betaseries.com/shows/episodes', () =>
      toJsonAnswer(episodesBody),
    );
    answerSite('https://api.betaseries.com/subtitles/episode', () =>
      toJsonAnswer(subtitlesBody),
    );
    for (const siteSubtitle of subtitlesBody.subtitles) {
      answerSite(siteSubtitle.url, toFileAnswer);
    }
    const {userConfig} = await createUserConfig({languageCodes: ['fre']});

    const response = await readSubtitleList({
      userConfigId: userConfig.id,
      videoType: 'series',
      videoId: BETASERIES_VIDEO_ID,
    });

    const apiKeys = listRequestsTo('https://api.betaseries.com/').map(
      ({headers}) => headers['X-BetaSeries-Key'],
    );
    expect(response.json().subtitles.length).toBeGreaterThan(0);
    expect(apiKeys).toEqual([
      BETASERIES_SHARED_KEY,
      BETASERIES_SHARED_KEY,
      BETASERIES_SHARED_KEY,
    ]);
    for (const fileRequest of listRequestsTo('https://www.betaseries.com/')) {
      expect(JSON.stringify(fileRequest)).not.toContain(BETASERIES_SHARED_KEY);
    }
    expect(response.body).not.toContain(BETASERIES_SHARED_KEY);
    await expectNowhereStored(BETASERIES_SHARED_KEY);
  });
});

describe('AniSub with a shared server token', () => {
  function answerAnisubSearch() {
    answerSite(ANISUB_SEARCH_URL, () =>
      toJsonAnswer({
        subtitles: [
          {
            id: 2329,
            url: ANISUB_SITE_FILE_URL,
            lang: 'tur',
            label: 'Fixture Fansub',
          },
        ],
      }),
    );
  }

  async function readFirstFile(userConfigId) {
    const listResponse = await readSubtitleList({
      userConfigId,
      videoType: 'movie',
      videoId: ANISUB_VIDEO_ID,
    });
    const [subtitle] = listResponse.json().subtitles;
    expect(subtitle).toBeDefined();
    return requestAddonPath(
      new URL(subtitle.url).pathname.slice(getTestAppBasePath().length),
    );
  }

  it('lists AniSub for a user without a token and downloads under a shared token', async () => {
    await writeSharedCredentials({
      [SubtitleSource.ANISUB]: [ANISUB_SHARED_TOKEN],
    });
    answerAnisubSearch();
    answerSite(ANISUB_TOKEN_DOWNLOAD_URL, () => ({
      status: StatusCodes.OK,
      headers: JSON_HEADERS,
      body: Buffer.from(
        JSON.stringify({
          success: true,
          data: {download_url: ANISUB_CDN_FILE_URL, filename: '2329.srt'},
        }),
      ),
    }));
    answerSite(ANISUB_CDN_FILE_URL, toFileAnswer);
    const {userConfig} = await createUserConfig({languageCodes: ['tur']});

    const fileResponse = await readFirstFile(userConfig.id);

    expect(fileResponse.statusCode).toBe(StatusCodes.OK);
    expect(fileResponse.body).toContain('Merhaba dünya.');
    expect(
      listRequestsTo(ANISUB_TOKEN_DOWNLOAD_URL).map(
        ({headers}) => headers.Authorization,
      ),
    ).toEqual([`Bearer ${ANISUB_SHARED_TOKEN}`]);
    expect(JSON.stringify(listRequestsTo(ANISUB_CDN_FILE_URL))).not.toContain(
      ANISUB_SHARED_TOKEN,
    );
    expect(fileResponse.body).not.toContain(ANISUB_SHARED_TOKEN);
    await expectNowhereStored(ANISUB_SHARED_TOKEN);
  });

  it("downloads in the background through a shared token, never the user's own token", async () => {
    await writeSharedCredentials({
      [SubtitleSource.ANISUB]: [ANISUB_SHARED_TOKEN],
    });
    answerAnisubSearch();
    answerSite(ANISUB_TOKEN_DOWNLOAD_URL, toFileAnswer);
    const {userConfig} = await createUserConfig({
      languageCodes: ['tur'],
      credentials: [makeAnisubUserCredential()],
    });

    await readSubtitleList({
      userConfigId: userConfig.id,
      videoType: 'movie',
      videoId: ANISUB_VIDEO_ID,
    });

    const tokenRequests = listRequestsTo(ANISUB_TOKEN_DOWNLOAD_URL);
    expect(tokenRequests.map(({headers}) => headers.Authorization)).toEqual([
      `Bearer ${ANISUB_SHARED_TOKEN}`,
    ]);
    expect(JSON.stringify(requestSite.mock.calls)).not.toContain(
      ANISUB_USER_TOKEN,
    );
  });

  it("downloads in the background on the public path without a shared token, never the user's own token", async () => {
    answerAnisubSearch();
    answerSite(ANISUB_SITE_FILE_URL, toFileAnswer);
    const {userConfig} = await createUserConfig({
      languageCodes: ['tur'],
      credentials: [makeAnisubUserCredential()],
    });

    await readSubtitleList({
      userConfigId: userConfig.id,
      videoType: 'movie',
      videoId: ANISUB_VIDEO_ID,
    });

    const [publicRequest] = listRequestsTo(ANISUB_SITE_FILE_URL);
    expect(publicRequest).toMatchObject({headers: {}, credentialId: null});
    expect(listRequestsTo(ANISUB_TOKEN_DOWNLOAD_URL)).toEqual([]);
    expect(JSON.stringify(requestSite.mock.calls)).not.toContain(
      ANISUB_USER_TOKEN,
    );
  });

  it('downloads the public file url without a token while the server has none', async () => {
    answerAnisubSearch();
    answerSite(ANISUB_SITE_FILE_URL, toFileAnswer);
    const {userConfig} = await createUserConfig({languageCodes: ['tur']});

    const fileResponse = await readFirstFile(userConfig.id);

    expect(fileResponse.statusCode).toBe(StatusCodes.OK);
    expect(fileResponse.body).toContain('Merhaba dünya.');
    const [publicRequest] = listRequestsTo(ANISUB_SITE_FILE_URL);
    expect(publicRequest.headers).toEqual({});
    expect(publicRequest.credentialId).toBeNull();
  });
});
