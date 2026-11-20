import {LogController} from 'fastify';
import {strToU8} from 'fflate';
import pino from 'pino';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {CredentialKind} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {loggerOptions} from '../../src/lib/logger.js';
import {computeUrlCode} from '../../src/lib/stremio-row/url-code.js';
import {drainBackgroundQueues} from '../../src/lib/subtitle-background/background-queues.js';
import {drainPendingSearches} from '../../src/lib/subtitle-search/search-subtitle-source.js';
import {createSubtitleSourceRegistry} from '../../src/lib/subtitle-sources/subtitle-source-clients.js';
import {
  createStubVideoCatalog,
  requestAddonPath,
} from '../helpers/addon-requests.js';
import {getTestAppBasePath, setTestAppOptions} from '../helpers/app.js';
import {createUserConfig} from '../helpers/factories.js';
import {createFixtureSubtitleSourceClient} from '../helpers/fixture-subtitle-source.js';
import {
  buildNuvioDesktopListUrl,
  buildNuvioLegacyRequests,
  buildStremioListUrl,
} from '../helpers/player-requests.js';
import {
  OTHER_TURKISH_SRT,
  TURKISH_SRT,
  toSrt,
} from '../helpers/subtitle-files.js';
import {makeSubtitleSourceHit} from '../helpers/subtitle-source-factories.js';
import {makeSwitchStatesOnly} from '../helpers/user-config-factories.js';

const SERIES_ID = 'tt0903747';
const EPISODE_ID = `${SERIES_ID}:1:1`;
const ENCODED_EPISODE_ID = `${SERIES_ID}%3A1%3A1`;
const VIDEO_HASH = '8e245d9679d31e12';
const VIDEO_SIZE_BYTES = 12909756;
const VIDEO_FILENAME = 'Breaking.Bad.S01E01.720p.BluRay.x264-DEMAND.mkv';
const ENCODED_VIDEO_FILENAME =
  'Breaking Bad (2008) S01E01 & Pilot = 100% +Türkçe!.mkv';
const ORIGIN_HEADERS = {origin: 'https://web.stremio.com'};
const FASTIFY_REQUEST_MESSAGES = ['incoming request', 'request completed'];
const NOTICE_ID_PREFIX = 'notice-';
const ERROR_ID_PREFIX = 'error.';
const ID_BYTES_MAX = 255;
const URL_BYTES_LIMIT = 1024;
const SEMANTIC_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+].+)?$/;
const REQUIRED_MANIFEST_FIELDS = [
  'id',
  'name',
  'description',
  'version',
  'resources',
  'types',
  'catalogs',
];

const EPISODE_SRT = toSrt([
  'Bölüm şimdi başlıyor, yerine otur.',
  'Laboratuvarda yeni bir deney hazırladım.',
  'Bu sabah okula geç kalmamalıyım.',
  'Arabanın anahtarlarını kim aldı?',
  'Çölün ortasında yolumuzu kaybettik.',
  'Ailem için her şeyi yapmaya hazırım.',
  'Doktor sonuçların yarın çıkacağını söyledi.',
  'Kimseye bu konudan bahsetmeyeceksin.',
  'Parayı garajdaki kutuya sakladım.',
  'Öğrenciler sınavdan sonra dağıldı.',
  'Telefonu açmadan önce iki kez düşündüm.',
  'Gece yarısından önce eve dönmeliyiz.',
]);

const PLAYER_EXTRAS = {
  videoHash: VIDEO_HASH,
  videoSize: VIDEO_SIZE_BYTES,
  filename: VIDEO_FILENAME,
};

const thesubtitledbClient = createFixtureSubtitleSourceClient({
  subtitleSource: SubtitleSource.THESUBTITLEDB,
  credentialKinds: [CredentialKind.API_KEY],
  downloadSubtitle: vi.fn(),
});

const opensubtitlesClient = createFixtureSubtitleSourceClient({
  subtitleSource: SubtitleSource.OPENSUBTITLES,
  credentialKinds: [CredentialKind.ACCOUNT, CredentialKind.API_KEY],
  canDownloadWithoutCredential: vi.fn(() => false),
});

const fixtureClients = [thesubtitledbClient, opensubtitlesClient];

const FIXTURE_SOURCES = fixtureClients.map(
  ({subtitleSource}) => subtitleSource,
);

const videoCatalog = createStubVideoCatalog();

const logLines = [];

setTestAppOptions({
  subtitleSourceRegistry: createSubtitleSourceRegistry(fixtureClients),
  videoCatalog,
  loggerInstance: pino(
    {...loggerOptions, level: 'debug'},
    {write: logLine => logLines.push(logLine)},
  ),
  logController: new LogController({disableRequestLogging: false}),
});

const PLAIN_HIT = makeEpisodeHit({
  releaseNames: ['Breaking.Bad.S01E01.1080p.WEB-DL.x264-OTHER'],
  siteDownloadCount: 50000,
});

const LONG_RELEASE_HIT = makeEpisodeHit({
  releaseNames: [
    `Breaking.Bad.S01E01.${'Çığır.Açan.Bölüm.'.repeat(20)}720p.WEB-DL.x264-LONG`,
  ],
});

const HASH_HIT = makeEpisodeHit({
  releaseNames: ['Breaking.Bad.S01E01.720p.BluRay.x264-DEMAND'],
  hashMatchVideoHashes: [VIDEO_HASH],
});

const EPISODE_SRT_BY_SITE_FILE_ID = {
  [LONG_RELEASE_HIT.siteFileId]: OTHER_TURKISH_SRT,
  [HASH_HIT.siteFileId]: TURKISH_SRT,
};

const QUOTA_HITS = [
  makeEpisodeHit({
    subtitleSource: SubtitleSource.OPENSUBTITLES,
    isQuotaCostly: true,
  }),
  makeEpisodeHit({
    subtitleSource: SubtitleSource.OPENSUBTITLES,
    isQuotaCostly: true,
    releaseNames: ['Breaking.Bad.S01E01.480p.HDTV.x264-QUOTA'],
  }),
];

beforeEach(() => {
  for (const client of fixtureClients) {
    client.searchSubtitles.mockReset().mockResolvedValue([]);
  }
  thesubtitledbClient.searchSubtitles.mockResolvedValue([
    PLAIN_HIT,
    LONG_RELEASE_HIT,
    HASH_HIT,
  ]);
  opensubtitlesClient.searchSubtitles.mockResolvedValue(QUOTA_HITS);
  thesubtitledbClient.downloadSubtitle
    .mockReset()
    .mockImplementation(async ({siteFileId}) => ({
      fileBytes: strToU8(
        EPISODE_SRT_BY_SITE_FILE_ID[siteFileId] ?? EPISODE_SRT,
      ),
      fileNameHint: 'episode.srt',
      extractedEntryPath: null,
    }));
  videoCatalog.readCatalogMeta
    .mockReset()
    .mockResolvedValue({catalogDurationMs: 58 * 60000, tvdbId: '81189'});
  videoCatalog.resolveKitsuVideo.mockReset().mockResolvedValue(null);
  logLines.length = 0;
});

afterEach(async () => {
  vi.restoreAllMocks();
  await drainPendingSearches();
});

function makeEpisodeHit(overrides = {}) {
  return makeSubtitleSourceHit({
    releaseNames: ['Breaking.Bad.S01E01.720p.HDTV.x264-CTU'],
    ...overrides,
  });
}

async function createPlayerUserConfig() {
  const {userConfig} = await createUserConfig({
    subtitleSourceSwitchStates: makeSwitchStatesOnly(FIXTURE_SOURCES),
  });
  return userConfig;
}

function requestRowUrl(rowUrl) {
  return requestAddonPath(
    new URL(rowUrl).pathname.slice(getTestAppBasePath().length),
    ORIGIN_HEADERS,
  );
}

function readAppLogLines() {
  return logLines.filter(
    logLine => !FASTIFY_REQUEST_MESSAGES.includes(JSON.parse(logLine).msg),
  );
}

function findPairedLogLines(userConfigId, checkedLogLines = logLines) {
  return checkedLogLines.filter(
    logLine =>
      logLine.includes(userConfigId) &&
      [SERIES_ID, VIDEO_HASH, VIDEO_FILENAME].some(videoPart =>
        logLine.includes(videoPart),
      ),
  );
}

function readSubtitleRows(response) {
  expect(response.statusCode).toBe(StatusCodes.OK);
  expect(response.headers['content-type']).toMatch(/^application\/json/);
  expect(response.headers['access-control-allow-origin']).toBe('*');
  const body = response.json();
  expect(Object.keys(body)).toEqual(['subtitles']);
  expect(Array.isArray(body.subtitles)).toBe(true);
  return body.subtitles;
}

function expectStremioRows(subtitles) {
  expect(subtitles.length).toBeGreaterThan(0);
  for (const subtitle of subtitles) {
    expect(subtitle).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        url: expect.any(String),
        lang: expect.any(String),
        label: expect.any(String),
      }),
    );
    expect(() => new URL(subtitle.url)).not.toThrow();
    expect(new URL(subtitle.url).protocol).toMatch(/^https?:$/);
  }
}

function findNoticeRows(subtitles) {
  return subtitles.filter(({id}) => id.startsWith(NOTICE_ID_PREFIX));
}

function findListedRows(subtitles) {
  return subtitles.filter(({id}) => !id.startsWith(NOTICE_ID_PREFIX));
}

function searchQueries() {
  return thesubtitledbClient.searchSubtitles.mock.calls.map(
    ([searchQuery]) => searchQuery,
  );
}

describe('a Stremio player request', () => {
  it('answers the episode list with string id, url, lang and label on every row', async () => {
    const userConfig = await createPlayerUserConfig();

    const listUrl = buildStremioListUrl({
      userConfigId: userConfig.id,
      videoType: 'series',
      videoId: EPISODE_ID,
      extras: PLAYER_EXTRAS,
    });
    const response = await requestAddonPath(listUrl, ORIGIN_HEADERS);

    expect(listUrl).toBe(
      `/addon/${userConfig.id}/subtitles/series/${ENCODED_EPISODE_ID}/videoHash=${VIDEO_HASH}&videoSize=${VIDEO_SIZE_BYTES}&filename=${VIDEO_FILENAME}.json`,
    );
    const subtitles = readSubtitleRows(response);
    expectStremioRows(subtitles);
    expect(findListedRows(subtitles)).toHaveLength(3);
    expect(searchQueries()).toEqual([
      expect.objectContaining({
        videoId: EPISODE_ID,
        videoType: 'series',
        imdbId: SERIES_ID,
        catalogSeason: 1,
        catalogEpisode: 1,
        videoHash: VIDEO_HASH,
        videoSizeBytes: VIDEO_SIZE_BYTES,
        videoFilename: VIDEO_FILENAME,
      }),
    ]);
  });

  it('answers an empty list for a type the manifest does not declare', async () => {
    const userConfig = await createPlayerUserConfig();

    const response = await requestAddonPath(
      buildStremioListUrl({
        userConfigId: userConfig.id,
        videoType: 'tv',
        videoId: EPISODE_ID,
        extras: PLAYER_EXTRAS,
      }),
      ORIGIN_HEADERS,
    );

    expect(readSubtitleRows(response)).toEqual([]);
    for (const client of fixtureClients) {
      expect(client.searchSubtitles).not.toHaveBeenCalled();
    }
  });

  it('keeps error-path log lines free of the config id and video', async () => {
    const userConfig = await createPlayerUserConfig();
    const listRequest = {
      userConfigId: userConfig.id,
      videoId: EPISODE_ID,
      extras: PLAYER_EXTRAS,
    };

    const [unknownTypeResponse, malformedResponse] = await Promise.all([
      requestAddonPath(
        buildStremioListUrl({...listRequest, videoType: 'tv'}),
        ORIGIN_HEADERS,
      ),
      requestAddonPath(
        `/addon/${userConfig.id}/subtitles/series/${EPISODE_ID}/videoHash=${VIDEO_HASH}&filename=${VIDEO_FILENAME}%zz.json`,
        ORIGIN_HEADERS,
      ),
    ]);

    expect(readSubtitleRows(unknownTypeResponse)).toEqual([]);
    expect(readSubtitleRows(malformedResponse)).toEqual([]);
    expect(readAppLogLines().length).toBeGreaterThan(1);
    expect(findPairedLogLines(userConfig.id, readAppLogLines())).toEqual([]);
  });
});

describe('the request log of each player', () => {
  it.each([
    ['Stremio', listRequest => [buildStremioListUrl(listRequest)]],
    ['Nuvio desktop', listRequest => [buildNuvioDesktopListUrl(listRequest)]],
    ['Nuvio native', buildNuvioLegacyRequests],
  ])(
    'never pairs the config id with the video on a %s request',
    async (_, buildListUrls) => {
      const userConfig = await createPlayerUserConfig();

      const responses = [];
      for (const listUrl of buildListUrls({
        userConfigId: userConfig.id,
        videoType: 'series',
        videoId: EPISODE_ID,
        extras: PLAYER_EXTRAS,
      })) {
        responses.push(await requestAddonPath(listUrl, ORIGIN_HEADERS));
      }

      for (const response of responses) {
        expectStremioRows(readSubtitleRows(response));
      }
      expect(
        logLines.filter(logLine => logLine.includes('/subtitles/')).length,
      ).toBeGreaterThanOrEqual(responses.length);
      expect(findPairedLogLines(userConfig.id)).toEqual([]);
    },
  );
});

describe('a Nuvio desktop player request', () => {
  it('answers the same row shape when the filename is absent', async () => {
    const userConfig = await createPlayerUserConfig();

    const listUrl = buildNuvioDesktopListUrl({
      userConfigId: userConfig.id,
      videoType: 'series',
      videoId: EPISODE_ID,
      extras: {videoHash: VIDEO_HASH, videoSize: VIDEO_SIZE_BYTES},
    });
    const response = await requestAddonPath(listUrl, ORIGIN_HEADERS);

    expect(listUrl).toBe(
      `/addon/${userConfig.id}/subtitles/series/${ENCODED_EPISODE_ID}/videoHash=${VIDEO_HASH}&videoSize=${VIDEO_SIZE_BYTES}.json`,
    );
    const subtitles = readSubtitleRows(response);
    expectStremioRows(subtitles);
    expect(findListedRows(subtitles)).toHaveLength(3);
    expect(searchQueries()).toEqual([
      expect.objectContaining({
        videoHash: VIDEO_HASH,
        videoSizeBytes: VIDEO_SIZE_BYTES,
        videoFilename: null,
      }),
    ]);
  });
});

describe('a Nuvio native player request pair', () => {
  it('keeps every first-answer row url and id in the answer with extras', async () => {
    const userConfig = await createPlayerUserConfig();
    const listUrls = buildNuvioLegacyRequests({
      userConfigId: userConfig.id,
      videoType: 'series',
      videoId: EPISODE_ID,
      extras: PLAYER_EXTRAS,
    });
    expect(listUrls).toHaveLength(2);

    const plainSubtitles = readSubtitleRows(
      await requestAddonPath(listUrls[0], ORIGIN_HEADERS),
    );
    await drainBackgroundQueues();
    const extraSubtitles = readSubtitleRows(
      await requestAddonPath(listUrls[1], ORIGIN_HEADERS),
    );

    expectStremioRows(plainSubtitles);
    expectStremioRows(extraSubtitles);
    const plainRows = findListedRows(plainSubtitles);
    expect(plainRows).toHaveLength(3);
    expect(plainRows[0].url).not.toBe(findListedRows(extraSubtitles)[0].url);
    for (const plainRow of plainSubtitles) {
      expect(extraSubtitles).toContainEqual(
        expect.objectContaining({id: plainRow.id, url: plainRow.url}),
      );
    }
  });

  it('keeps every row inside the native player limits', async () => {
    const userConfig = await createPlayerUserConfig();
    const listUrls = buildNuvioLegacyRequests({
      userConfigId: userConfig.id,
      videoType: 'series',
      videoId: EPISODE_ID,
      extras: PLAYER_EXTRAS,
    });

    const subtitles = readSubtitleRows(
      await requestAddonPath(listUrls.at(-1), ORIGIN_HEADERS),
    );

    expectStremioRows(subtitles);
    const listedRows = findListedRows(subtitles);
    expect(listedRows).toHaveLength(3);
    expect(
      Math.max(...listedRows.map(({id}) => Buffer.byteLength(id))),
    ).toBeGreaterThan(ID_BYTES_MAX - 16);
    for (const {id, url} of subtitles) {
      expect(Buffer.byteLength(id)).toBeLessThanOrEqual(ID_BYTES_MAX);
      expect(Buffer.byteLength(url)).toBeLessThan(URL_BYTES_LIMIT);
    }
    for (const {id} of listedRows) {
      expect(id.startsWith(ERROR_ID_PREFIX)).toBe(false);
      expect(id.startsWith(NOTICE_ID_PREFIX)).toBe(false);
    }
    const noticeRows = findNoticeRows(subtitles);
    expect(noticeRows).toHaveLength(1);
    expect(subtitles.at(-1)).toBe(noticeRows[0]);
    expect(noticeRows[0]).not.toHaveProperty('subtitleFileName');
  });

  it('sends only the plain request when the player knows no extra', async () => {
    expect(
      buildNuvioLegacyRequests({
        userConfigId: 'user-config',
        videoType: 'series',
        videoId: EPISODE_ID,
        extras: {videoHash: '', videoSize: 0, filename: ''},
      }),
    ).toEqual([`/addon/user-config/subtitles/series/${EPISODE_ID}.json`]);
  });
});

describe('the extras encoding of each player', () => {
  it.each([
    ['Stremio', buildStremioListUrl],
    ['Nuvio desktop', buildNuvioDesktopListUrl],
    [
      'Nuvio native',
      listRequest => buildNuvioLegacyRequests(listRequest).at(-1),
    ],
  ])(
    'decodes a %s filename with reserved and non-ASCII characters',
    async (_, buildListUrl) => {
      const userConfig = await createPlayerUserConfig();

      const response = await requestAddonPath(
        buildListUrl({
          userConfigId: userConfig.id,
          videoType: 'series',
          videoId: EPISODE_ID,
          extras: {...PLAYER_EXTRAS, filename: ENCODED_VIDEO_FILENAME},
        }),
        ORIGIN_HEADERS,
      );

      expectStremioRows(readSubtitleRows(response));
      expect(searchQueries()).toEqual([
        expect.objectContaining({
          videoHash: VIDEO_HASH,
          videoSizeBytes: VIDEO_SIZE_BYTES,
          videoFilename: ENCODED_VIDEO_FILENAME,
        }),
      ]);
    },
  );
});

describe('the manifest a player installs', () => {
  it.each([
    ['general', () => '/manifest.json'],
    ['configured', userConfigId => `/addon/${userConfigId}/manifest.json`],
  ])(
    'carries every required field in the %s manifest',
    async (_, toManifestPath) => {
      const userConfig = await createPlayerUserConfig();

      const response = await requestAddonPath(
        toManifestPath(userConfig.id),
        ORIGIN_HEADERS,
      );

      expect(response.statusCode).toBe(StatusCodes.OK);
      expect(response.headers['access-control-allow-origin']).toBe('*');
      const manifest = response.json();
      expect(Object.keys(manifest)).toEqual(
        expect.arrayContaining(REQUIRED_MANIFEST_FIELDS),
      );
      expect(manifest).toEqual(
        expect.objectContaining({
          id: expect.stringMatching(/^[\w-]+(?:\.[\w-]+)+$/),
          name: expect.any(String),
          description: expect.any(String),
          logo: expect.stringMatching(/^https?:\/\/[^/]+\/\S*\.png$/),
          version: expect.stringMatching(SEMANTIC_VERSION_PATTERN),
          resources: expect.arrayContaining(['subtitles']),
          types: expect.arrayContaining(['movie', 'series']),
          catalogs: [],
        }),
      );
      for (const videoType of manifest.types) {
        expect(videoType).toEqual(expect.any(String));
      }
    },
  );
});

describe('the file links a player follows', () => {
  it('serves a listed file and the notice file to any origin', async () => {
    const userConfig = await createPlayerUserConfig();
    const subtitles = readSubtitleRows(
      await requestAddonPath(
        buildStremioListUrl({
          userConfigId: userConfig.id,
          videoType: 'series',
          videoId: EPISODE_ID,
          extras: PLAYER_EXTRAS,
        }),
        ORIGIN_HEADERS,
      ),
    );
    const plainUrlCode = computeUrlCode({...PLAIN_HIT, archiveEntryPath: ''});
    const plainRow = findListedRows(subtitles).find(({url}) =>
      url.endsWith(`/${plainUrlCode}.srt`),
    );
    const [noticeRow] = findNoticeRows(subtitles);

    const [fileResponse, noticeResponse] = await Promise.all([
      requestRowUrl(plainRow.url),
      requestRowUrl(noticeRow.url),
    ]);

    expect(fileResponse.statusCode).toBe(StatusCodes.OK);
    expect(fileResponse.headers['access-control-allow-origin']).toBe('*');
    expect(fileResponse.body).toBe(EPISODE_SRT);
    expect(
      thesubtitledbClient.downloadSubtitle.mock.calls.filter(
        ([subtitleRef]) => subtitleRef.siteFileId === PLAIN_HIT.siteFileId,
      ).length,
    ).toBeGreaterThan(0);
    expect(noticeResponse.statusCode).toBe(StatusCodes.OK);
    expect(noticeResponse.headers['access-control-allow-origin']).toBe('*');
  });
});
