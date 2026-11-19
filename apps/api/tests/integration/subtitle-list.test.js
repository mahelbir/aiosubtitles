import {setTimeout as delay} from 'node:timers/promises';
import {omit, sortBy} from 'es-toolkit';
import {strToU8, zipSync} from 'fflate';
import pino from 'pino';
import {QueryTypes} from 'sequelize';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {
  CredentialKind,
  CredentialStatus,
} from '@repo/shared/constants/credential.js';
import {URL_MAX_LENGTH} from '@repo/shared/constants/common.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {config} from '../../src/config/index.js';
import {sequelize} from '../../src/db/index.js';
import {
  SubtitleFile,
  SubtitleFileOrigin,
} from '../../src/db/models/subtitle-file.js';
import {SubtitleReferenceComparison} from '../../src/db/models/subtitle-reference-comparison.js';
import {SubtitleVideoBinding} from '../../src/db/models/subtitle-video-binding.js';
import {SubtitleVideoCandidate} from '../../src/db/models/subtitle-video-candidate.js';
import {Subtitle} from '../../src/db/models/subtitle.js';
import {VideoVariant} from '../../src/db/models/video-variant.js';
import {markCredentialStatus} from '../../src/lib/credential-secret.js';
import {computeUrlCode} from '../../src/lib/stremio-row/url-code.js';
import {drainPendingSearches} from '../../src/lib/subtitle-search/search-subtitle-source.js';
import {SubtitleAliasSource} from '../../src/lib/subtitle-sources/subtitle-alias-source.js';
import {createSubtitleSourceRegistry} from '../../src/lib/subtitle-sources/subtitle-source-clients.js';
import {SourceUnavailableError} from '../../src/lib/subtitle-sources/subtitle-source-errors.js';
import {expandArchive} from '../../src/lib/subtitle-store/pack-binding.js';
import {persistSearchHits} from '../../src/lib/subtitle-store/persist-search-hits.js';
import {storeSubtitleFile} from '../../src/lib/subtitle-store/store-subtitle-file.js';
import {userConfigCache} from '../../src/lib/user-config-cache.js';
import {createCatalogMetaReader} from '../../src/lib/video-catalog/catalog-meta.js';
import {CatalogService} from '../../src/lib/video-catalog/catalog-service.js';
import {createKitsuVideoResolver} from '../../src/lib/video-catalog/kitsu-mapping.js';
import {redis} from '../../src/redis/index.js';
import {
  getTestApp,
  getTestAppBasePath,
  getTestAppBaseUrl,
  setTestAppOptions,
} from '../helpers/app.js';
import {createUserConfig} from '../helpers/factories.js';
import {createFixtureSubtitleSourceClient} from '../helpers/fixture-subtitle-source.js';
import {getAppModels} from '../helpers/models.js';
import {OTHER_TURKISH_SRT, TURKISH_SRT} from '../helpers/subtitle-files.js';
import {makeSubtitleSourceHit} from '../helpers/subtitle-source-factories.js';
import {makeSwitchStatesOnly} from '../helpers/user-config-factories.js';

const MOVIE_ID = 'tt0133093';
const SERIES_IMDB_ID = 'tt0944947';
const ANIME_IMDB_ID = 'tt2560140';
const KITSU_ID = '7442';
const VIDEO_HASH = '8e245d9679d31e12';
const OTHER_VIDEO_HASH = '0123456789abcdef';
const VIDEO_SIZE_BYTES = 12909756;
const MOVIE_RUNTIME_MS = 136 * 60000;
const STREMIO_ORIGIN = 'https://web.stremio.com';
const V3_SITE_FILE_ID = '123456';
const V3_FILE_URL = `https://subs5.strem.io/en/download/file/${V3_SITE_FILE_ID}`;
const URL_CODE_PATTERN = /\/([\da-f]{64})\.(?:srt|ass)$/;
const NOTICE_ID = 'notice-opensubtitles-account';
const CINEMETA_META_URL = 'https://v3-cinemeta.strem.io/meta';
const KITSU_META_URL = `https://anime-kitsu.strem.fun/meta/series/kitsu:${KITSU_ID}.json`;

const MOVIE_RELEASE = 'The.Matrix.1999.1080p.BluRay.x264-AAA';

const EPISODE_SRT = '1\n00:00:01,000 --> 00:00:03,000\nBölüm başlıyor.\n';

const CATALOG_BODIES = {
  [`${CINEMETA_META_URL}/movie/${MOVIE_ID}.json`]: {
    meta: {id: MOVIE_ID, type: 'movie', name: 'The Matrix', runtime: '136 min'},
  },
  [`${CINEMETA_META_URL}/series/${SERIES_IMDB_ID}.json`]: {
    meta: {
      id: SERIES_IMDB_ID,
      type: 'series',
      name: 'Game of Thrones',
      runtime: '57 min',
      tvdb_id: 121361,
    },
  },
  [`${CINEMETA_META_URL}/series/${ANIME_IMDB_ID}.json`]: {
    meta: {
      id: ANIME_IMDB_ID,
      type: 'series',
      name: 'Attack on Titan',
      runtime: '24 min',
      tvdb_id: 267440,
      year: '2013–2023',
    },
  },
  [KITSU_META_URL]: {
    meta: {
      id: `kitsu:${KITSU_ID}`,
      type: 'series',
      imdb_id: ANIME_IMDB_ID,
      videos: [
        {id: `kitsu:${KITSU_ID}:4`, episode: 4, imdbSeason: 1, imdbEpisode: 4},
        {id: `kitsu:${KITSU_ID}:5`, episode: 5, imdbSeason: 1, imdbEpisode: 5},
        {
          id: `kitsu:${KITSU_ID}:6`,
          episode: 6,
          imdbSeason: 1,
          imdbEpisode: 18,
        },
      ],
    },
  },
};

const thesubtitledbClient = createFixtureSubtitleSourceClient({
  subtitleSource: SubtitleSource.THESUBTITLEDB,
  credentialKinds: [CredentialKind.API_KEY],
});

const opensubtitlesClient = createFixtureSubtitleSourceClient({
  subtitleSource: SubtitleSource.OPENSUBTITLES,
  credentialKinds: [CredentialKind.ACCOUNT, CredentialKind.API_KEY],
  canDownloadWithoutCredential: vi.fn(() => false),
});

const opensubtitlesV3Client = createFixtureSubtitleSourceClient({
  subtitleSource: SubtitleSource.OPENSUBTITLES_V3,
});

const altyazidbClient = createFixtureSubtitleSourceClient({
  subtitleSource: SubtitleSource.ALTYAZIDB,
  credentialKinds: [CredentialKind.API_KEY],
  canSearchWithoutCredential: vi.fn(() => false),
  canDownloadWithoutCredential: vi.fn(() => false),
});

const fixtureClients = [
  thesubtitledbClient,
  opensubtitlesClient,
  opensubtitlesV3Client,
  altyazidbClient,
];

const FIXTURE_SOURCES = fixtureClients.map(
  ({subtitleSource}) => subtitleSource,
);

const catalogRequest = vi.fn();

const logLines = [];

const videoCatalog = {
  readCatalogMeta: createCatalogMetaReader({
    requestRemoteResource: catalogRequest,
  }),
  resolveKitsuVideo: createKitsuVideoResolver({
    requestRemoteResource: catalogRequest,
  }),
};

setTestAppOptions({
  subtitleSourceRegistry: createSubtitleSourceRegistry(fixtureClients),
  videoCatalog,
  loggerInstance: pino(
    {level: 'trace'},
    {write: logLine => logLines.push(logLine)},
  ),
});

beforeEach(() => {
  for (const client of fixtureClients) {
    client.searchSubtitles.mockReset().mockResolvedValue([]);
    client.isAvailable.mockReset().mockReturnValue(true);
  }
  catalogRequest.mockReset().mockImplementation(answerCatalogRequest);
  logLines.length = 0;
});

afterEach(async () => {
  vi.restoreAllMocks();
  await drainPendingSearches();
});

async function answerCatalogRequest({url}) {
  if (!Object.hasOwn(CATALOG_BODIES, url)) {
    throw new SourceUnavailableError({subtitleSource: CatalogService.CINEMETA});
  }
  return {status: StatusCodes.OK, headers: {}, body: CATALOG_BODIES[url]};
}

function toEpisodeId(catalogSeason, catalogEpisode) {
  return `${SERIES_IMDB_ID}:${catalogSeason}:${catalogEpisode}`;
}

function toUrlCode(searchHit) {
  return computeUrlCode({...searchHit, archiveEntryPath: ''});
}

async function createListUserConfig({
  switchedOnSources = FIXTURE_SOURCES,
  ...values
} = {}) {
  return createUserConfig({
    ...values,
    subtitleSourceSwitchStates: makeSwitchStatesOnly(switchedOnSources),
  });
}

function toListPath({userConfigId, videoType = 'movie', videoId, extra}) {
  const videoPath = `/${userConfigId}/subtitles/${videoType}/${videoId}`;
  return extra === undefined
    ? `${videoPath}.json`
    : `${videoPath}/${extra}.json`;
}

async function requestSubtitleList({
  userConfigId,
  videoType,
  videoId = MOVIE_ID,
  extra,
  headers = {},
}) {
  const app = await getTestApp();
  return app.inject({
    method: 'GET',
    url: `${getTestAppBasePath()}${toListPath({userConfigId, videoType, videoId, extra})}`,
    headers,
  });
}

function expectListResponse(response) {
  expect(response.statusCode).toBe(StatusCodes.OK);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.headers['content-type']).toMatch(/^application\/json/);
  expect(Array.isArray(response.json().subtitles)).toBe(true);
}

async function getSubtitleList(listRequest) {
  const response = await requestSubtitleList(listRequest);
  expectListResponse(response);
  return response.json().subtitles;
}

function listUrlCodes(subtitles) {
  return subtitles
    .filter(({id}) => id !== NOTICE_ID)
    .map(({url}) => url.match(URL_CODE_PATTERN)?.[1]);
}

function toExtra({videoHash, videoSizeBytes, videoFilename} = {}) {
  return new URLSearchParams({
    ...(videoHash && {videoHash}),
    ...(videoSizeBytes !== undefined && {videoSize: String(videoSizeBytes)}),
    ...(videoFilename && {filename: videoFilename}),
  }).toString();
}

function makeHit(overrides = {}) {
  return makeSubtitleSourceHit({releaseNames: [MOVIE_RELEASE], ...overrides});
}

async function storeHits(videoId, searchHits) {
  await persistSearchHits({videoId, searchHits});
  return searchHits.map(toUrlCode);
}

async function findSubtitle(urlCode) {
  return Subtitle.findOne({
    attributes: [
      'id',
      'urlCode',
      'subtitleSource',
      'siteFileId',
      'archiveEntryPath',
      'fileExtension',
      'siteLanguageCode',
      'isSitePack',
      'siteFileUrl',
    ],
    where: {urlCode},
  });
}

async function storeFile(urlCode, fileText = TURKISH_SRT) {
  const subtitle = await findSubtitle(urlCode);
  await storeSubtitleFile({
    subtitleId: subtitle.id,
    fileBytes: strToU8(fileText),
    fileNameHint: 'subtitle.srt',
    fileOrigin: SubtitleFileOrigin.DIRECT,
    expectedLanguageCode: 'tur',
    fallbackFrameRate: null,
  });
}

function makeApiKeyCredential(subtitleSource, apiKey) {
  return {
    subtitleSource,
    credentialKind: CredentialKind.API_KEY,
    credentialSecret: {apiKey},
  };
}

function makeAccountCredential(username) {
  return {
    subtitleSource: SubtitleSource.OPENSUBTITLES,
    credentialKind: CredentialKind.ACCOUNT,
    credentialSecret: {username, password: `${username}-password`},
  };
}

function makeOpensubtitlesHit({legacyId = null, ...overrides} = {}) {
  return makeHit({
    subtitleSource: SubtitleSource.OPENSUBTITLES,
    isQuotaCostly: true,
    subtitleAliases: legacyId
      ? [
          SubtitleAliasSource.OPENSUBTITLES_LEGACY,
          SubtitleAliasSource.OPENSUBTITLES_V3,
        ].map(aliasSource => ({aliasSource, aliasSiteFileId: legacyId}))
      : [],
    ...overrides,
  });
}

function makeV3Hit(overrides = {}) {
  return makeHit({
    subtitleSource: SubtitleSource.OPENSUBTITLES_V3,
    siteFileId: V3_SITE_FILE_ID,
    siteFileUrl: V3_FILE_URL,
    isQuotaCostly: false,
    ...overrides,
  });
}

function searchCredentials(client) {
  return client.searchSubtitles.mock.calls.map(([, credential]) => credential);
}

function searchQueries(client) {
  return client.searchSubtitles.mock.calls.map(([searchQuery]) => searchQuery);
}

async function readVariants() {
  const videoVariants = await VideoVariant.findAll({
    attributes: ['videoId', 'videoHash', 'videoSizeBytes', 'videoFilename'],
    order: [['firstSeenAt', 'ASC']],
  });
  return videoVariants.map(videoVariant => ({
    videoId: videoVariant.videoId,
    videoHash: videoVariant.videoHash,
    videoSizeBytes: videoVariant.videoSizeBytes,
    videoFilename: videoVariant.videoFilename,
  }));
}

describe('the subtitle list route', () => {
  it('lists a source hit with a link to its file route', async () => {
    const {userConfig} = await createListUserConfig();
    const searchHit = makeHit();
    thesubtitledbClient.searchSubtitles.mockResolvedValue([searchHit]);
    const urlCode = toUrlCode(searchHit);

    const subtitles = await getSubtitleList({
      userConfigId: userConfig.id,
      videoId: MOVIE_ID,
    });

    expect(subtitles).toEqual([
      {
        id: `TheSubtitleDB · ${MOVIE_RELEASE} · ${urlCode.slice(0, 8)}`,
        url: `${getTestAppBaseUrl()}/${userConfig.id}/subtitle-files/${MOVIE_ID}/${urlCode}.srt`,
        lang: 'tur',
        label: `TheSubtitleDB · ${MOVIE_RELEASE}`,
        subtitleFileName: MOVIE_RELEASE,
      },
    ]);
    expect(searchQueries(thesubtitledbClient)).toEqual([
      expect.objectContaining({
        videoId: MOVIE_ID,
        videoType: 'movie',
        imdbId: MOVIE_ID,
        kitsuId: null,
        catalogSeason: null,
        catalogEpisode: null,
        catalogTitle: 'The Matrix',
        catalogYear: null,
        languageCodes: ['tur', 'eng'],
        videoHash: null,
        videoSizeBytes: null,
        videoFilename: null,
      }),
    ]);
    expect(searchCredentials(thesubtitledbClient)).toEqual([null]);
    expect(catalogRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: `${CINEMETA_META_URL}/movie/${MOVIE_ID}.json`,
      }),
    );
  });

  it('answers any origin on the list and leaves the preflight to the CORS list', async () => {
    const {userConfig} = await createListUserConfig();
    const app = await getTestApp();

    const response = await requestSubtitleList({
      userConfigId: userConfig.id,
      headers: {origin: STREMIO_ORIGIN},
    });
    const preflight = await app.inject({
      method: 'OPTIONS',
      url: `${getTestAppBasePath()}${toListPath({userConfigId: userConfig.id, videoId: MOVIE_ID})}`,
      headers: {
        origin: config.corsOrigins[0],
        'access-control-request-method': 'GET',
      },
    });

    expectListResponse(response);
    expect(response.headers['access-control-allow-origin']).toBe('*');
    expect(preflight.headers['access-control-allow-origin']).toBe(
      config.corsOrigins[0],
    );
  });

  it('returns an empty list for an unknown configuration', async () => {
    const {userConfig} = await createListUserConfig();
    await storeHits(MOVIE_ID, [makeHit()]);

    const knownSubtitles = await getSubtitleList({
      userConfigId: userConfig.id,
    });
    for (const client of fixtureClients) {
      client.searchSubtitles.mockClear();
    }
    const unknownSubtitles = await getSubtitleList({
      userConfigId: '00000000-0000-4000-8000-000000000000',
    });
    const malformedSubtitles = await getSubtitleList({
      userConfigId: 'not-a-uuid',
    });

    expect(knownSubtitles).toHaveLength(1);
    expect(unknownSubtitles).toEqual([]);
    expect(malformedSubtitles).toEqual([]);
    for (const client of fixtureClients) {
      expect(client.searchSubtitles).not.toHaveBeenCalled();
    }
  });

  it('answers an empty list for a type the manifest does not declare', async () => {
    const {userConfig} = await createListUserConfig();
    await storeHits(MOVIE_ID, [makeHit()]);

    const movieSubtitles = await getSubtitleList({
      userConfigId: userConfig.id,
    });
    thesubtitledbClient.searchSubtitles.mockClear();
    const channelSubtitles = await getSubtitleList({
      userConfigId: userConfig.id,
      videoType: 'channel',
    });

    expect(movieSubtitles).toHaveLength(1);
    expect(channelSubtitles).toEqual([]);
    expect(thesubtitledbClient.searchSubtitles).not.toHaveBeenCalled();
  });

  it('puts a hash-matched subtitle first with Exact', async () => {
    const {userConfig} = await createListUserConfig();
    const popularHit = makeHit({
      releaseNames: ['The.Matrix.1999.720p.WEB-DL-BBB'],
      siteDownloadCount: 50000,
    });
    const hashHit = makeHit({hashMatchVideoHashes: [VIDEO_HASH]});
    thesubtitledbClient.searchSubtitles.mockResolvedValue([
      popularHit,
      hashHit,
    ]);

    const subtitles = await getSubtitleList({
      userConfigId: userConfig.id,
      extra: toExtra({
        videoHash: VIDEO_HASH.toUpperCase(),
        videoSizeBytes: VIDEO_SIZE_BYTES,
      }),
    });

    expect(listUrlCodes(subtitles)).toEqual([
      toUrlCode(hashHit),
      toUrlCode(popularHit),
    ]);
    expect(subtitles[0].label).toBe(`Exact · TheSubtitleDB · ${MOVIE_RELEASE}`);
    expect(subtitles[1].label).not.toMatch(/^Exact/);
    expect(searchQueries(thesubtitledbClient)[0]).toMatchObject({
      videoHash: VIDEO_HASH,
      videoSizeBytes: VIDEO_SIZE_BYTES,
    });
  });

  it('orders languages in the user order and caps each language', async () => {
    const {userConfig} = await createListUserConfig({
      languageCodes: ['eng', 'tur'],
      subtitleLanguageLimit: 2,
    });
    await storeHits(MOVIE_ID, [
      makeHit({languageCode: 'tur'}),
      makeHit({languageCode: 'tur'}),
      makeHit({languageCode: 'tur'}),
      makeHit({languageCode: 'eng'}),
      makeHit({languageCode: 'fre'}),
    ]);

    const subtitles = await getSubtitleList({userConfigId: userConfig.id});

    expect(subtitles.map(({lang}) => lang)).toEqual(['eng', 'tur', 'tur']);
  });

  it('drops a switched-off source', async () => {
    const {userConfig} = await createListUserConfig({
      switchedOnSources: [SubtitleSource.THESUBTITLEDB],
    });
    const [thesubtitledbUrlCode] = await storeHits(MOVIE_ID, [
      makeHit(),
      makeV3Hit(),
    ]);
    opensubtitlesV3Client.searchSubtitles.mockResolvedValue([
      makeV3Hit({siteFileId: '654321'}),
    ]);

    const subtitles = await getSubtitleList({userConfigId: userConfig.id});

    expect(listUrlCodes(subtitles)).toEqual([thesubtitledbUrlCode]);
    expect(thesubtitledbClient.searchSubtitles).toHaveBeenCalledTimes(1);
    expect(opensubtitlesV3Client.searchSubtitles).not.toHaveBeenCalled();
  });

  it('treats a source missing from the saved switches as on', async () => {
    const {userConfig} = await createUserConfig({
      subtitleSourceSwitchStates: omit(
        makeSwitchStatesOnly([SubtitleSource.OPENSUBTITLES_V3]),
        [SubtitleSource.THESUBTITLEDB],
      ),
    });
    const searchHit = makeHit();
    thesubtitledbClient.searchSubtitles.mockResolvedValue([searchHit]);

    const subtitles = await getSubtitleList({userConfigId: userConfig.id});

    expect(listUrlCodes(subtitles)).toEqual([toUrlCode(searchHit)]);
    expect(altyazidbClient.searchSubtitles).not.toHaveBeenCalled();
  });

  it('shows only stored files of a key-requiring source without a key', async () => {
    const {userConfig: keylessUserConfig} = await createListUserConfig();
    const {userConfig: keyedUserConfig} = await createListUserConfig({
      credentials: [
        makeApiKeyCredential(SubtitleSource.ALTYAZIDB, 'altyazidb-key'),
      ],
    });
    const [storedUrlCode, unstoredUrlCode] = await storeHits(MOVIE_ID, [
      makeHit({subtitleSource: SubtitleSource.ALTYAZIDB}),
      makeHit({
        subtitleSource: SubtitleSource.ALTYAZIDB,
        releaseNames: ['The.Matrix.1999.720p.WEB-DL-BBB'],
      }),
    ]);
    await storeFile(storedUrlCode);

    const keylessSubtitles = await getSubtitleList({
      userConfigId: keylessUserConfig.id,
    });
    const keylessSearchCount =
      altyazidbClient.searchSubtitles.mock.calls.length;
    const keyedSubtitles = await getSubtitleList({
      userConfigId: keyedUserConfig.id,
    });

    expect(listUrlCodes(keylessSubtitles)).toEqual([storedUrlCode]);
    expect(keylessSearchCount).toBe(0);
    expect(listUrlCodes(keyedSubtitles).toSorted()).toEqual(
      [storedUrlCode, unstoredUrlCode].toSorted(),
    );
    expect(searchCredentials(altyazidbClient)).toEqual([
      expect.objectContaining({apiKey: 'altyazidb-key'}),
    ]);
  });

  it('keeps one row for two sources with the same content key', async () => {
    const {userConfig} = await createListUserConfig();
    const urlCodes = await storeHits(MOVIE_ID, [
      makeHit(),
      makeV3Hit({releaseNames: ['The.Matrix.1999.720p.WEB-DL-BBB']}),
    ]);
    await Promise.all(urlCodes.map(urlCode => storeFile(urlCode)));

    const subtitles = await getSubtitleList({userConfigId: userConfig.id});

    expect(subtitles).toHaveLength(1);
    expect(urlCodes).toContain(listUrlCodes(subtitles)[0]);
  });

  it('keeps two rows whose stored files differ', async () => {
    const {userConfig} = await createListUserConfig();
    const urlCodes = await storeHits(MOVIE_ID, [
      makeHit(),
      makeV3Hit({releaseNames: ['The.Matrix.1999.720p.WEB-DL-BBB']}),
    ]);
    await storeFile(urlCodes[0], TURKISH_SRT);
    await storeFile(urlCodes[1], OTHER_TURKISH_SRT);

    const subtitles = await getSubtitleList({userConfigId: userConfig.id});

    expect(listUrlCodes(subtitles).toSorted()).toEqual(urlCodes.toSorted());
  });

  it('ranks a hit whose site cue shape misses the catalog runtime last', async () => {
    const {userConfig} = await createListUserConfig();
    const fittingHit = makeHit({
      siteCueCount: 1600,
      siteDurationMs: MOVIE_RUNTIME_MS - 120000,
    });
    const shortHit = makeHit({
      releaseNames: ['The.Matrix.1999.720p.WEB-DL-BBB'],
      siteCueCount: 3,
      siteDurationMs: 9000,
      siteDownloadCount: 100,
    });
    thesubtitledbClient.searchSubtitles.mockResolvedValue([
      shortHit,
      fittingHit,
    ]);

    const subtitles = await getSubtitleList({userConfigId: userConfig.id});

    expect(listUrlCodes(subtitles)).toEqual([
      toUrlCode(fittingHit),
      toUrlCode(shortHit),
    ]);
  });

  it('ranks a subtitle matching a stored variant first for a request without video data', async () => {
    const {userConfig} = await createListUserConfig();
    await VideoVariant.create({
      videoId: MOVIE_ID,
      videoHash: VIDEO_HASH,
      videoSizeBytes: VIDEO_SIZE_BYTES,
      videoFilename: null,
      firstSeenAt: new Date(),
    });
    const [popularUrlCode, variantUrlCode] = await storeHits(MOVIE_ID, [
      makeHit({
        releaseNames: ['The.Matrix.1999.720p.WEB-DL-BBB'],
        siteDownloadCount: 50000,
      }),
      makeHit({hashMatchVideoHashes: [VIDEO_HASH]}),
    ]);

    const subtitles = await getSubtitleList({userConfigId: userConfig.id});

    expect(listUrlCodes(subtitles)).toEqual([variantUrlCode, popularUrlCode]);
  });

  it('records a hash variant and uses it for a later size-only request', async () => {
    const {userConfig} = await createListUserConfig();
    vi.spyOn(thesubtitledbClient, 'downloadSubtitle').mockRejectedValue(
      new SourceUnavailableError({
        subtitleSource: SubtitleSource.THESUBTITLEDB,
      }),
    );
    const videoFilename = `${MOVIE_RELEASE}.mkv`;
    const [plainUrlCode, hashUrlCode] = await storeHits(MOVIE_ID, [
      makeHit({
        releaseNames: ['The.Matrix.1999.720p.WEB-DL-BBB'],
        siteDownloadCount: 50000,
      }),
      makeHit({hashMatchVideoHashes: [VIDEO_HASH]}),
    ]);
    const hashExtra = toExtra({
      videoHash: VIDEO_HASH,
      videoSizeBytes: VIDEO_SIZE_BYTES,
      videoFilename,
    });

    await getSubtitleList({userConfigId: userConfig.id, extra: hashExtra});
    await getSubtitleList({userConfigId: userConfig.id, extra: hashExtra});
    const sizeOnlySubtitles = await getSubtitleList({
      userConfigId: userConfig.id,
      extra: toExtra({videoSizeBytes: VIDEO_SIZE_BYTES}),
    });

    expect(await readVariants()).toEqual([
      {
        videoId: MOVIE_ID,
        videoHash: VIDEO_HASH,
        videoSizeBytes: VIDEO_SIZE_BYTES,
        videoFilename,
      },
    ]);
    expect(listUrlCodes(sizeOnlySubtitles)).toEqual([
      hashUrlCode,
      plainUrlCode,
    ]);
    expect(sizeOnlySubtitles[0].label).toMatch(/^Exact · /);
  });

  it('uses the earliest stored play of a size', async () => {
    const {userConfig} = await createListUserConfig();
    await VideoVariant.bulkCreate([
      {
        videoId: MOVIE_ID,
        videoHash: OTHER_VIDEO_HASH,
        videoSizeBytes: VIDEO_SIZE_BYTES,
        videoFilename: null,
        firstSeenAt: new Date('2026-02-01T00:00:00.000Z'),
      },
      {
        videoId: MOVIE_ID,
        videoHash: VIDEO_HASH,
        videoSizeBytes: VIDEO_SIZE_BYTES,
        videoFilename: null,
        firstSeenAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);
    const [laterUrlCode, earliestUrlCode] = await storeHits(MOVIE_ID, [
      makeHit({
        releaseNames: ['The.Matrix.1999.720p.WEB-DL-BBB'],
        hashMatchVideoHashes: [OTHER_VIDEO_HASH],
      }),
      makeHit({hashMatchVideoHashes: [VIDEO_HASH]}),
    ]);

    const subtitles = await getSubtitleList({
      userConfigId: userConfig.id,
      extra: toExtra({videoSizeBytes: VIDEO_SIZE_BYTES}),
    });

    expect(listUrlCodes(subtitles)).toEqual([earliestUrlCode, laterUrlCode]);
    expect(subtitles[0].label).toMatch(/^Exact · /);
    expect(subtitles[1].label).not.toMatch(/^Exact/);
  });

  it('maps a kitsu id through the Kitsu addon', async () => {
    const {userConfig} = await createListUserConfig();
    const kitsuVideoId = `kitsu:${KITSU_ID}:5`;
    const searchHit = makeHit({releaseNames: ['Anime.S01E05.1080p.WEB-AAA']});
    thesubtitledbClient.searchSubtitles.mockResolvedValue([searchHit]);

    const subtitles = await getSubtitleList({
      userConfigId: userConfig.id,
      videoType: 'anime',
      videoId: kitsuVideoId,
    });

    expect(searchQueries(thesubtitledbClient)).toEqual([
      expect.objectContaining({
        videoId: kitsuVideoId,
        videoType: 'series',
        imdbId: ANIME_IMDB_ID,
        kitsuId: KITSU_ID,
        catalogSeason: 1,
        catalogEpisode: 5,
        kitsuEpisode: 5,
        tvdbId: '267440',
        catalogTitle: 'Attack on Titan',
        catalogYear: 2013,
        isEpisodeResolved: true,
        isCatalogResolved: true,
      }),
    ]);
    expect(catalogRequest).toHaveBeenCalledWith(
      expect.objectContaining({url: KITSU_META_URL}),
    );
    expect(subtitles.map(({url}) => url)).toEqual([
      `${getTestAppBaseUrl()}/${userConfig.id}/subtitle-files/${kitsuVideoId}/${toUrlCode(searchHit)}.srt`,
    ]);
    const candidates = await SubtitleVideoCandidate.findAll({
      attributes: ['videoId'],
      raw: true,
    });
    expect(candidates).toEqual([{videoId: kitsuVideoId}]);
  });

  it.each([
    ['an anime with an episode as a series', `${SERIES_IMDB_ID}:1:2`, 'series'],
    ['an anime without an episode as a movie', MOVIE_ID, 'movie'],
    [
      'a kitsu anime without an episode as a movie',
      `kitsu:${KITSU_ID}`,
      'movie',
    ],
  ])('searches %s', async (_, videoId, videoType) => {
    const {userConfig} = await createListUserConfig();

    await getSubtitleList({
      userConfigId: userConfig.id,
      videoType: 'anime',
      videoId,
    });

    expect(searchQueries(thesubtitledbClient)).toEqual([
      expect.objectContaining({videoId, videoType}),
    ]);
  });

  it('decodes the extra filename once', async () => {
    const {userConfig} = await createListUserConfig();

    await getSubtitleList({
      userConfigId: userConfig.id,
      extra: 'filename=Tom%20%26%20Jerry.1999.mkv',
    });

    expect(searchQueries(thesubtitledbClient)).toEqual([
      expect.objectContaining({videoFilename: 'Tom & Jerry.1999.mkv'}),
    ]);
  });

  it('ignores a malformed extra', async () => {
    const {userConfig} = await createListUserConfig();
    const searchHit = makeHit();
    thesubtitledbClient.searchSubtitles.mockResolvedValue([searchHit]);

    const malformedSubtitles = await getSubtitleList({
      userConfigId: userConfig.id,
      extra: 'videoHash=xyz&videoSize=abc&filename=The.Matrix.1999.mkv',
    });
    const garbageSubtitles = await getSubtitleList({
      userConfigId: userConfig.id,
      extra: 'not-an-extra',
    });

    expect(listUrlCodes(malformedSubtitles)).toEqual([toUrlCode(searchHit)]);
    expect(listUrlCodes(garbageSubtitles)).toEqual([toUrlCode(searchHit)]);
    expect(searchQueries(thesubtitledbClient)[0]).toMatchObject({
      videoHash: null,
      videoSizeBytes: null,
      videoFilename: 'The.Matrix.1999.mkv',
    });
    expect(await readVariants()).toEqual([]);
  });

  it('drops a pack lacking the episode', async () => {
    const {userConfig} = await createListUserConfig();
    const episodeId = toEpisodeId(1, 3);
    const [downloadedPackUrlCode, unopenedPackUrlCode, episodeUrlCode] =
      await storeHits(episodeId, [
        makeHit({
          siteFileId: 'pack-downloaded',
          isSitePack: true,
          releaseNames: ['Show.S01.1080p.WEB-AAA'],
        }),
        makeHit({
          siteFileId: 'pack-unopened',
          isSitePack: true,
          releaseNames: ['Show.S01.720p.WEB-BBB'],
        }),
        makeHit({releaseNames: ['Show.S01E03.1080p.WEB-CCC']}),
      ]);
    await expandArchive({
      packSubtitle: await findSubtitle(downloadedPackUrlCode),
      fileBytes: zipSync({
        'Show.S01E01.1080p.WEB-AAA.srt': strToU8(EPISODE_SRT),
        'Show.S01E02.1080p.WEB-AAA.srt': strToU8(EPISODE_SRT),
      }),
      fileOrigin: SubtitleFileOrigin.DIRECT,
    });

    const subtitles = await getSubtitleList({
      userConfigId: userConfig.id,
      videoType: 'series',
      videoId: episodeId,
    });

    expect(listUrlCodes(subtitles).toSorted()).toEqual(
      [unopenedPackUrlCode, episodeUrlCode].toSorted(),
    );
  });

  it('keeps an AltyazıDB PAKET row whose name has no pack token', async () => {
    const {userConfig} = await createListUserConfig({
      credentials: [
        makeApiKeyCredential(SubtitleSource.ALTYAZIDB, 'altyazidb-key'),
      ],
    });
    const episodeId = toEpisodeId(1, 4);
    const [packUrlCode] = await storeHits(episodeId, [
      makeHit({
        subtitleSource: SubtitleSource.ALTYAZIDB,
        isSitePack: true,
        releaseNames: ['Dizi.Adi.1080p'],
      }),
    ]);

    const subtitles = await getSubtitleList({
      userConfigId: userConfig.id,
      videoType: 'series',
      videoId: episodeId,
      extra: toExtra({videoFilename: 'Dizi.Adi.S01E04.1080p.WEB.mkv'}),
    });

    expect(listUrlCodes(subtitles)).toEqual([packUrlCode]);
  });

  it('keeps a subtitle whose title differs from the video', async () => {
    const {userConfig} = await createListUserConfig();
    const [otherTitleUrlCode] = await storeHits(MOVIE_ID, [
      makeHit({releaseNames: ['Another.Title.1999.1080p.BluRay.x264-AAA']}),
    ]);

    const subtitles = await getSubtitleList({
      userConfigId: userConfig.id,
      extra: toExtra({videoFilename: `${MOVIE_RELEASE}.mkv`}),
    });

    expect(listUrlCodes(subtitles)).toEqual([otherTitleUrlCode]);
  });

  it('keeps the same ids and urls with and without extras', async () => {
    const {userConfig} = await createListUserConfig();
    await storeHits(MOVIE_ID, [
      makeHit({
        releaseNames: ['The.Matrix.1999.720p.WEB-DL-BBB'],
        siteDownloadCount: 50000,
      }),
      makeHit({hashMatchVideoHashes: [VIDEO_HASH]}),
    ]);
    const toIdentities = subtitles =>
      sortBy(
        subtitles.map(({id, url}) => ({id, url})),
        ['id'],
      );

    const plainSubtitles = await getSubtitleList({
      userConfigId: userConfig.id,
    });
    const extraSubtitles = await getSubtitleList({
      userConfigId: userConfig.id,
      extra: toExtra({
        videoHash: VIDEO_HASH,
        videoSizeBytes: VIDEO_SIZE_BYTES,
        videoFilename: `${MOVIE_RELEASE}.mkv`,
      }),
    });

    expect(plainSubtitles).toHaveLength(2);
    expect(toIdentities(extraSubtitles)).toEqual(toIdentities(plainSubtitles));
  });
});

describe('a malformed subtitle list url', () => {
  it.each([
    ['a bad percent sequence', 'videoSize=1&filename=Bad%zzName.mkv'],
    ['a truncated multibyte sequence', 'filename=Bad%E0%A4Name.mkv'],
    [
      'a parameter past the length limit',
      `filename=${'a'.repeat(URL_MAX_LENGTH)}`,
    ],
  ])('answers an empty list for an extra with %s', async (_, extra) => {
    const {userConfig} = await createListUserConfig();
    await storeHits(MOVIE_ID, [makeHit()]);

    const response = await requestSubtitleList({
      userConfigId: userConfig.id,
      extra,
      headers: {origin: STREMIO_ORIGIN},
    });

    expectListResponse(response);
    expect(response.json()).toEqual({subtitles: []});
    expect(response.headers['access-control-allow-origin']).toBe('*');
    for (const client of fixtureClients) {
      expect(client.searchSubtitles).not.toHaveBeenCalled();
    }
  });

  it('keeps the bad request answer outside the addon routes without logging the url', async () => {
    const {userConfig} = await createListUserConfig();
    const app = await getTestApp();

    const response = await app.inject({
      method: 'GET',
      url: `${getTestAppBasePath()}/${userConfig.id}/subtitles/movie/${MOVIE_ID}/bad%zz`,
    });

    expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST);
    const body = response.json();
    expect(Object.keys(body)).toEqual([
      'error',
      'code',
      'message',
      'statusCode',
    ]);
    expect(body).toMatchObject({
      error: 'Bad Request',
      code: 'FST_ERR_BAD_URL',
      message: expect.stringMatching(/is not a valid url component$/),
      statusCode: StatusCodes.BAD_REQUEST,
    });
    expect(
      logLines.filter(
        logLine =>
          logLine.includes(userConfig.id) && logLine.includes(MOVIE_ID),
      ),
    ).toEqual([]);
  });

  it('answers an empty list for a video id Stremio never sends', async () => {
    const {userConfig} = await createListUserConfig();

    const subtitles = await getSubtitleList({
      userConfigId: userConfig.id,
      videoId: 'not-a-video',
      extra: toExtra({videoHash: VIDEO_HASH, videoSizeBytes: VIDEO_SIZE_BYTES}),
    });

    expect(subtitles).toEqual([]);
    for (const client of fixtureClients) {
      expect(client.searchSubtitles).not.toHaveBeenCalled();
    }
    expect(await readVariants()).toEqual([]);
  });
});

describe('the subtitle list rate limit', () => {
  it('answers an empty list with 200 once the window is spent', async () => {
    const unknownUserConfigId = '00000000-0000-4000-8000-000000000000';
    let refusedResponse = null;
    for (let attempt = 0; attempt <= config.rateLimitIpMax; attempt += 1) {
      refusedResponse = await requestSubtitleList({
        userConfigId: unknownUserConfigId,
        headers: {origin: STREMIO_ORIGIN},
      });
      expectListResponse(refusedResponse);
    }

    expect(refusedResponse.json()).toEqual({subtitles: []});
    expect(refusedResponse.headers['access-control-allow-origin']).toBe('*');
  });
});

describe('the subtitle list pack entries', () => {
  async function storeOpenedPack() {
    const episodeId = toEpisodeId(1, 3);
    const [packUrlCode] = await storeHits(episodeId, [
      makeHit({
        siteFileId: 'pack-opened',
        isSitePack: true,
        releaseNames: ['Show.S01.1080p.WEB-AAA'],
      }),
    ]);
    const packSubtitle = await findSubtitle(packUrlCode);
    await expandArchive({
      packSubtitle,
      fileBytes: zipSync({
        'Show.S01E01.1080p.WEB-AAA.srt': strToU8(TURKISH_SRT),
        'Show.S01E03.1080p.WEB-AAA.srt': strToU8(TURKISH_SRT),
        'Show.S01E03.1080p.WEB-AAA.SDH.srt': strToU8(OTHER_TURKISH_SRT),
      }),
      fileOrigin: SubtitleFileOrigin.DIRECT,
    });
    const toEntryUrlCode = archiveEntryPath =>
      computeUrlCode({
        subtitleSource: packSubtitle.subtitleSource,
        siteFileId: packSubtitle.siteFileId,
        archiveEntryPath,
      });
    return {
      episodeId,
      packSubtitle,
      packUrlCode,
      plainUrlCode: toEntryUrlCode('Show.S01E03.1080p.WEB-AAA.srt'),
      sdhUrlCode: toEntryUrlCode('Show.S01E03.1080p.WEB-AAA.SDH.srt'),
    };
  }

  it('lets the pack row stand for the entry it would bind and lists the second version of the episode', async () => {
    const {userConfig} = await createListUserConfig();
    const {episodeId, packUrlCode, sdhUrlCode} = await storeOpenedPack();

    const subtitles = await getSubtitleList({
      userConfigId: userConfig.id,
      videoType: 'series',
      videoId: episodeId,
    });

    expect(listUrlCodes(subtitles).toSorted()).toEqual(
      [packUrlCode, sdhUrlCode].toSorted(),
    );
  });

  it('lists a Kitsu pack numbered by the anime episode and binds its entry', async () => {
    const {userConfig} = await createListUserConfig();
    const kitsuVideoId = `kitsu:${KITSU_ID}:6`;
    const [packUrlCode] = await storeHits(kitsuVideoId, [
      makeHit({
        siteFileId: 'pack-anime',
        isSitePack: true,
        releaseNames: ['[Group] Show (Batch)'],
      }),
    ]);
    const packSubtitle = await findSubtitle(packUrlCode);
    await expandArchive({
      packSubtitle,
      fileBytes: zipSync({
        'Show S2 - 05.srt': strToU8(TURKISH_SRT),
        'Show S2 - 06.srt': strToU8(OTHER_TURKISH_SRT),
      }),
      fileOrigin: SubtitleFileOrigin.DIRECT,
    });

    const subtitles = await getSubtitleList({
      userConfigId: userConfig.id,
      videoType: 'anime',
      videoId: kitsuVideoId,
    });
    const app = await getTestApp();
    const fileResponse = await app.inject({
      method: 'GET',
      url: `${getTestAppBasePath()}/${userConfig.id}/subtitle-files/${kitsuVideoId}/${packUrlCode}.srt`,
    });

    expect(listUrlCodes(subtitles)).toEqual([packUrlCode]);
    expect(fileResponse.statusCode).toBe(StatusCodes.OK);
    expect(
      await SubtitleVideoBinding.findAll({
        attributes: ['videoId', 'boundArchiveEntryPath'],
        where: {subtitleId: packSubtitle.id},
        raw: true,
      }),
    ).toEqual([
      {videoId: kitsuVideoId, boundArchiveEntryPath: 'Show S2 - 06.srt'},
    ]);
  });

  it('lets the pack row stand for its bound entry', async () => {
    const {userConfig} = await createListUserConfig();
    const {episodeId, packSubtitle, packUrlCode, plainUrlCode} =
      await storeOpenedPack();
    await SubtitleVideoBinding.create({
      subtitleId: packSubtitle.id,
      videoId: episodeId,
      boundArchiveEntryPath: 'Show.S01E03.1080p.WEB-AAA.SDH.srt',
      boundAt: new Date(),
    });

    const subtitles = await getSubtitleList({
      userConfigId: userConfig.id,
      videoType: 'series',
      videoId: episodeId,
    });

    expect(listUrlCodes(subtitles).toSorted()).toEqual(
      [packUrlCode, plainUrlCode].toSorted(),
    );
  });
});

describe('the subtitle list reference comparison', () => {
  beforeEach(() => {
    catalogRequest.mockRejectedValue(
      new SourceUnavailableError({subtitleSource: CatalogService.CINEMETA}),
    );
  });

  async function storeReferenceFamily({
    isSameTimeFamily,
    isFamilyPopular = false,
  }) {
    const [referenceUrlCode, familyUrlCode, popularUrlCode] = await storeHits(
      MOVIE_ID,
      [
        makeHit({hashMatchVideoHashes: [VIDEO_HASH]}),
        makeHit({
          releaseNames: ['The.Matrix.1999.720p.WEB-DL-BBB'],
          siteDownloadCount: isFamilyPopular ? 50000 : 100,
        }),
        makeHit({
          releaseNames: ['The.Matrix.1999.2160p.WEB-DL-CCC'],
          siteDownloadCount: isFamilyPopular ? 100 : 50000,
        }),
      ],
    );
    await storeFile(referenceUrlCode, TURKISH_SRT);
    await storeFile(familyUrlCode, OTHER_TURKISH_SRT);
    const [referenceSubtitle, familySubtitle] = await Promise.all([
      findSubtitle(referenceUrlCode),
      findSubtitle(familyUrlCode),
    ]);
    await SubtitleReferenceComparison.create({
      candidateSubtitleId: familySubtitle.id,
      referenceSubtitleId: referenceSubtitle.id,
      isSameTimeFamily,
      matchedCueShare: isSameTimeFamily ? 0.95 : 0.1,
      comparisonMethodVersion: 1,
      comparedAt: new Date(),
    });
    return {referenceUrlCode, familyUrlCode, popularUrlCode};
  }

  it('marks a subtitle in the time family of the hash reference as Exact', async () => {
    const {userConfig} = await createListUserConfig();
    const {referenceUrlCode, familyUrlCode, popularUrlCode} =
      await storeReferenceFamily({isSameTimeFamily: true});

    const subtitles = await getSubtitleList({
      userConfigId: userConfig.id,
      extra: toExtra({videoHash: VIDEO_HASH, videoSizeBytes: VIDEO_SIZE_BYTES}),
    });

    expect(listUrlCodes(subtitles)).toEqual([
      referenceUrlCode,
      familyUrlCode,
      popularUrlCode,
    ]);
    expect(subtitles[1].label).toMatch(/^Exact · /);
    expect(subtitles[2].label).not.toMatch(/^Exact/);
  });

  it('ranks a subtitle outside the time family of the hash reference last', async () => {
    const {userConfig} = await createListUserConfig();
    const {referenceUrlCode, familyUrlCode, popularUrlCode} =
      await storeReferenceFamily({
        isSameTimeFamily: false,
        isFamilyPopular: true,
      });

    const subtitles = await getSubtitleList({
      userConfigId: userConfig.id,
      extra: toExtra({videoHash: VIDEO_HASH, videoSizeBytes: VIDEO_SIZE_BYTES}),
    });

    expect(listUrlCodes(subtitles)).toEqual([
      referenceUrlCode,
      popularUrlCode,
      familyUrlCode,
    ]);
  });

  it('ranks a subtitle in the time family of a stored variant reference above a popular one without video data', async () => {
    const {userConfig} = await createListUserConfig();
    await VideoVariant.create({
      videoId: MOVIE_ID,
      videoHash: VIDEO_HASH,
      videoSizeBytes: VIDEO_SIZE_BYTES,
      videoFilename: null,
      firstSeenAt: new Date(),
    });
    const {familyUrlCode, popularUrlCode} = await storeReferenceFamily({
      isSameTimeFamily: true,
    });

    const subtitles = await getSubtitleList({userConfigId: userConfig.id});

    const urlCodes = listUrlCodes(subtitles);
    expect(urlCodes.indexOf(familyUrlCode)).toBeLessThan(
      urlCodes.indexOf(popularUrlCode),
    );
  });
});

describe('the subtitle list deadline', () => {
  it('answers within the deadline when a source never responds', async () => {
    const {userConfig} = await createListUserConfig();
    const v3Hit = makeV3Hit();
    thesubtitledbClient.searchSubtitles.mockImplementation(async () => {
      await delay(5000);
      return [];
    });
    opensubtitlesV3Client.searchSubtitles.mockResolvedValue([v3Hit]);
    const startedAt = Date.now();

    const response = await requestSubtitleList({userConfigId: userConfig.id});

    expect(Date.now() - startedAt).toBeLessThan(
      config.subtitleSearchDeadline + 500,
    );
    expectListResponse(response);
    expect(listUrlCodes(response.json().subtitles)).toEqual([toUrlCode(v3Hit)]);
  });

  it('counts the deadline from the start of the request', async () => {
    const {userConfig} = await createListUserConfig();
    catalogRequest.mockImplementation(async catalogResourceRequest => {
      await delay(700);
      return answerCatalogRequest(catalogResourceRequest);
    });
    thesubtitledbClient.searchSubtitles.mockImplementation(async () => {
      await delay(5000);
      return [];
    });
    const startedAt = Date.now();

    const response = await requestSubtitleList({userConfigId: userConfig.id});

    expect(Date.now() - startedAt).toBeLessThan(
      config.subtitleSearchDeadline + 500,
    );
    expectListResponse(response);
  });

  it('adds a late source hit to the next request', async () => {
    const {userConfig} = await createListUserConfig();
    const lateHit = makeHit();
    thesubtitledbClient.searchSubtitles.mockImplementation(async () => {
      await delay(config.subtitleSearchDeadline + 500);
      return [lateHit];
    });

    const firstSubtitles = await getSubtitleList({
      userConfigId: userConfig.id,
    });
    await drainPendingSearches();
    const nextSubtitles = await getSubtitleList({userConfigId: userConfig.id});

    expect(firstSubtitles).toEqual([]);
    expect(listUrlCodes(nextSubtitles)).toEqual([toUrlCode(lateHit)]);
    expect(thesubtitledbClient.searchSubtitles).toHaveBeenCalledTimes(1);
  });
});

describe('a failing dependency of the subtitle list', () => {
  it('lists the other sources when one throws', async () => {
    const {userConfig} = await createListUserConfig();
    const v3Hit = makeV3Hit();
    thesubtitledbClient.searchSubtitles.mockRejectedValue(
      new Error('The fixture source broke.'),
    );
    opensubtitlesV3Client.searchSubtitles.mockResolvedValue([v3Hit]);

    const subtitles = await getSubtitleList({userConfigId: userConfig.id});

    expect(listUrlCodes(subtitles)).toEqual([toUrlCode(v3Hit)]);
  });

  it('lists the sources when the catalog fails', async () => {
    const {userConfig} = await createListUserConfig();
    const searchHit = makeHit();
    thesubtitledbClient.searchSubtitles.mockResolvedValue([searchHit]);
    catalogRequest.mockRejectedValue(
      new SourceUnavailableError({subtitleSource: CatalogService.CINEMETA}),
    );

    const subtitles = await getSubtitleList({userConfigId: userConfig.id});

    expect(catalogRequest).toHaveBeenCalled();
    expect(listUrlCodes(subtitles)).toEqual([toUrlCode(searchHit)]);
    expect(searchQueries(thesubtitledbClient)).toEqual([
      expect.objectContaining({
        isEpisodeResolved: true,
        isCatalogResolved: false,
      }),
    ]);
  });

  it('searches an unmapped kitsu episode as resolved, without an IMDb id', async () => {
    const {userConfig} = await createListUserConfig();

    await getSubtitleList({
      userConfigId: userConfig.id,
      videoType: 'anime',
      videoId: `kitsu:${KITSU_ID}:99`,
    });

    expect(searchQueries(thesubtitledbClient)).toEqual([
      expect.objectContaining({
        imdbId: null,
        kitsuEpisode: 99,
        isEpisodeResolved: true,
      }),
    ]);
  });

  describe('the search cache of a kitsu episode', () => {
    function answerLikeAnAnimeSource(client) {
      client.searchSubtitles.mockImplementation(async searchQuery =>
        searchQuery.kitsuId
          ? [makeSubtitleSourceHit({subtitleSource: client.subtitleSource})]
          : null,
      );
    }

    function answerLikeAnImdbSource(client) {
      client.searchSubtitles.mockImplementation(async searchQuery =>
        searchQuery.imdbId ? [] : null,
      );
    }

    function readCacheKeys(subtitleSource) {
      return redis.keys(`subtitle-search-cache:v1:${subtitleSource}:*`);
    }

    it("caches the anime source's answer but not the IMDb source's for an unmapped episode", async () => {
      const {userConfig} = await createListUserConfig();
      answerLikeAnAnimeSource(opensubtitlesV3Client);
      answerLikeAnImdbSource(thesubtitledbClient);

      await getSubtitleList({
        userConfigId: userConfig.id,
        videoType: 'anime',
        videoId: `kitsu:${KITSU_ID}:99`,
      });
      await drainPendingSearches();

      await expect(
        readCacheKeys(SubtitleSource.OPENSUBTITLES_V3),
      ).resolves.not.toEqual([]);
      await expect(
        readCacheKeys(SubtitleSource.THESUBTITLEDB),
      ).resolves.toEqual([]);
    });

    it('caches nothing when the Kitsu lookup fails', async () => {
      const {userConfig} = await createListUserConfig();
      answerLikeAnAnimeSource(opensubtitlesV3Client);
      answerLikeAnImdbSource(thesubtitledbClient);

      await getSubtitleList({
        userConfigId: userConfig.id,
        videoType: 'anime',
        videoId: 'kitsu:9999:5',
      });
      await drainPendingSearches();

      expect(searchQueries(opensubtitlesV3Client)).toEqual([
        expect.objectContaining({isEpisodeResolved: false}),
      ]);
      await expect(redis.keys('subtitle-search-cache:v1:*')).resolves.toEqual(
        [],
      );
    });
  });

  it('answers an empty list when the configuration cannot be read', async () => {
    const {userConfig} = await createListUserConfig();
    await storeHits(MOVIE_ID, [makeHit()]);
    vi.spyOn(userConfigCache, 'get').mockRejectedValue(
      new Error('The configuration store is down.'),
    );

    const response = await requestSubtitleList({userConfigId: userConfig.id});

    expectListResponse(response);
    expect(response.json()).toEqual({subtitles: []});
  });
});

describe('the subtitle list search credentials', () => {
  it('never searches a keyless source with the user own invalid key', async () => {
    const {userConfig: invalidKeyUserConfig, userConfigCredentials} =
      await createListUserConfig({
        credentials: [
          makeApiKeyCredential(SubtitleSource.THESUBTITLEDB, 'invalid-key'),
        ],
      });
    await markCredentialStatus({
      credentialId: userConfigCredentials[0].id,
      credentialStatus: CredentialStatus.INVALID,
    });
    const {userConfig: keylessUserConfig} = await createListUserConfig();

    await getSubtitleList({userConfigId: invalidKeyUserConfig.id});
    const invalidKeyCredentials = searchCredentials(thesubtitledbClient);
    const invalidKeyV3Credentials = searchCredentials(opensubtitlesV3Client);
    await getSubtitleList({userConfigId: keylessUserConfig.id});

    expect(invalidKeyCredentials).toEqual([]);
    expect(invalidKeyV3Credentials).toEqual([null]);
    expect(searchCredentials(thesubtitledbClient)).toEqual([null]);
  });

  it('never searches OpenSubtitles with the app key once the user own api key is invalid', async () => {
    const {userConfig, userConfigCredentials} = await createListUserConfig({
      credentials: [
        makeAccountCredential('account-user'),
        makeApiKeyCredential(SubtitleSource.OPENSUBTITLES, 'invalid-key'),
      ],
    });
    await markCredentialStatus({
      credentialId: userConfigCredentials[1].id,
      credentialStatus: CredentialStatus.INVALID,
    });

    await getSubtitleList({userConfigId: userConfig.id});

    expect(opensubtitlesClient.searchSubtitles).not.toHaveBeenCalled();
    expect(searchCredentials(thesubtitledbClient)).toEqual([null]);
  });

  it('adds no account notice for the stored rows of an unavailable source', async () => {
    const {userConfig} = await createListUserConfig();
    await storeHits(MOVIE_ID, [
      makeOpensubtitlesHit(),
      makeOpensubtitlesHit({
        releaseNames: ['The.Matrix.1999.720p.WEB-DL-BBB'],
      }),
    ]);
    const shownSubtitles = await getSubtitleList({
      userConfigId: userConfig.id,
    });
    opensubtitlesClient.isAvailable.mockResolvedValue(false);

    const hiddenSubtitles = await getSubtitleList({
      userConfigId: userConfig.id,
    });

    expect(shownSubtitles.map(({id}) => id)).toContain(NOTICE_ID);
    expect(hiddenSubtitles).toEqual([]);
  });

  it('never searches an unavailable source, even with the user own api key', async () => {
    const {userConfig} = await createListUserConfig({
      credentials: [
        makeApiKeyCredential(SubtitleSource.OPENSUBTITLES, 'own-key'),
      ],
    });
    opensubtitlesClient.isAvailable.mockResolvedValue(false);

    await getSubtitleList({userConfigId: userConfig.id});

    expect(opensubtitlesClient.searchSubtitles).not.toHaveBeenCalled();
    expect(searchCredentials(thesubtitledbClient)).toEqual([null]);
  });

  it('lists only the stored files of an unavailable source', async () => {
    const {userConfig} = await createListUserConfig({
      credentials: [makeAccountCredential('account-user')],
    });
    const [storedUrlCode] = await storeHits(MOVIE_ID, [
      makeHit({subtitleSource: SubtitleSource.OPENSUBTITLES}),
      makeHit({
        subtitleSource: SubtitleSource.OPENSUBTITLES,
        releaseNames: ['The.Matrix.1999.720p.WEB-DL-BBB'],
      }),
    ]);
    await storeFile(storedUrlCode);
    opensubtitlesClient.isAvailable.mockResolvedValue(false);

    const subtitles = await getSubtitleList({userConfigId: userConfig.id});

    expect(listUrlCodes(subtitles)).toEqual([storedUrlCode]);
  });

  it('searches OpenSubtitles with an account alone', async () => {
    const {userConfig, userConfigCredentials} = await createListUserConfig({
      credentials: [makeAccountCredential('account-user')],
    });

    await getSubtitleList({userConfigId: userConfig.id});

    expect(searchCredentials(opensubtitlesClient)).toEqual([
      expect.objectContaining({
        credentialId: userConfigCredentials[0].id,
        credentialKind: CredentialKind.ACCOUNT,
      }),
    ]);
  });

  it('searches OpenSubtitles with the user own key before any account', async () => {
    const {userConfig, userConfigCredentials} = await createListUserConfig({
      credentials: [
        makeAccountCredential('account-user'),
        makeApiKeyCredential(SubtitleSource.OPENSUBTITLES, 'own-key'),
      ],
    });

    await getSubtitleList({userConfigId: userConfig.id});

    expect(searchCredentials(opensubtitlesClient)).toEqual([
      expect.objectContaining({
        credentialId: userConfigCredentials[1].id,
        credentialKind: CredentialKind.API_KEY,
        apiKey: 'own-key',
      }),
    ]);
  });
});

describe('the OpenSubtitles account notice', () => {
  it('hides quota rows from a user without an OpenSubtitles account and appends the notice row', async () => {
    const {userConfig} = await createListUserConfig();
    const aliasedHit = makeOpensubtitlesHit({
      releaseNames: ['The.Matrix.1999.2160p.WEB-DL-CCC'],
      legacyId: V3_SITE_FILE_ID,
    });
    const v3Hit = makeV3Hit({
      releaseNames: ['The.Matrix.1999.2160p.WEB-DL-CCC'],
    });
    opensubtitlesClient.searchSubtitles.mockResolvedValue([
      makeOpensubtitlesHit(),
      makeOpensubtitlesHit({
        releaseNames: ['The.Matrix.1999.720p.WEB-DL-BBB'],
      }),
      aliasedHit,
    ]);
    opensubtitlesV3Client.searchSubtitles.mockResolvedValue([v3Hit]);

    const subtitles = await getSubtitleList({userConfigId: userConfig.id});

    const listedRows = subtitles.slice(0, -1);
    expect(listedRows.length).toBeGreaterThan(0);
    expect([toUrlCode(aliasedHit), toUrlCode(v3Hit)]).toEqual(
      expect.arrayContaining(listUrlCodes(listedRows)),
    );
    expect(listedRows.map(({label}) => label)).not.toContainEqual(
      expect.stringMatching(/Quota/),
    );
    expect(subtitles.at(-1)).toEqual({
      id: NOTICE_ID,
      lang: 'tur',
      label: 'Add an OpenSubtitles account to see 2 more',
      url: `${getTestAppBaseUrl()}/${userConfig.id}/subtitle-notices/opensubtitles-account.srt`,
    });
  });

  it('counts hidden groups over every language before the limit and after hard rejects', async () => {
    const {userConfig} = await createListUserConfig({
      languageCodes: ['eng', 'tur'],
      subtitleLanguageLimit: 1,
    });
    opensubtitlesClient.searchSubtitles.mockResolvedValue([
      makeOpensubtitlesHit({languageCode: 'tur'}),
      makeOpensubtitlesHit({
        languageCode: 'tur',
        releaseNames: ['The.Matrix.1999.720p.WEB-DL-BBB'],
      }),
      makeOpensubtitlesHit({languageCode: 'eng'}),
      makeOpensubtitlesHit({
        languageCode: 'tur',
        releaseNames: ['The.Matrix.1999.1080p.BluRay.x264-DDD.CD1'],
      }),
    ]);
    thesubtitledbClient.searchSubtitles.mockResolvedValue([
      makeHit({languageCode: 'tur'}),
      makeHit({
        languageCode: 'tur',
        releaseNames: ['The.Matrix.1999.720p.WEB-DL-BBB'],
      }),
    ]);

    const subtitles = await getSubtitleList({userConfigId: userConfig.id});

    expect(subtitles.map(({lang}) => lang)).toEqual(['tur', 'eng']);
    expect(subtitles.at(-1)).toMatchObject({
      id: NOTICE_ID,
      lang: 'eng',
      label: 'Add an OpenSubtitles account to see 3 more',
    });
  });

  it('counts hidden duplicates once', async () => {
    const {userConfig} = await createListUserConfig();
    const siteFileUrl = 'https://dl.opensubtitles.org/file/shared';
    opensubtitlesClient.searchSubtitles.mockResolvedValue([
      makeOpensubtitlesHit({siteFileUrl}),
      makeOpensubtitlesHit({
        siteFileUrl,
        releaseNames: ['The.Matrix.1999.720p.WEB-DL-BBB'],
      }),
    ]);

    const subtitles = await getSubtitleList({userConfigId: userConfig.id});

    expect(subtitles).toEqual([
      expect.objectContaining({
        id: NOTICE_ID,
        label: 'Add an OpenSubtitles account to see 1 more',
      }),
    ]);
  });

  it.each([
    [
      'asks a user with only an invalid account to fix it',
      [makeAccountCredential('account-user')],
      'opensubtitles-account-fix',
      'Fix your OpenSubtitles account to see 2 more',
    ],
    [
      'asks a user without an account to add one',
      [],
      'opensubtitles-account',
      'Add an OpenSubtitles account to see 2 more',
    ],
  ])('%s', async (_, credentials, subtitleNotice, noticeLabel) => {
    const {userConfig, userConfigCredentials} = await createListUserConfig({
      credentials,
    });
    await Promise.all(
      userConfigCredentials.map(({id}) =>
        markCredentialStatus({
          credentialId: id,
          credentialStatus: CredentialStatus.INVALID,
        }),
      ),
    );
    const opensubtitlesHits = [
      makeOpensubtitlesHit(),
      makeOpensubtitlesHit({
        releaseNames: ['The.Matrix.1999.720p.WEB-DL-BBB'],
      }),
    ];
    opensubtitlesClient.searchSubtitles.mockResolvedValue(opensubtitlesHits);
    await storeHits(MOVIE_ID, opensubtitlesHits);
    const app = await getTestApp();

    const subtitles = await getSubtitleList({userConfigId: userConfig.id});
    const noticeUrl = `${getTestAppBaseUrl()}/${userConfig.id}/subtitle-notices/${subtitleNotice}.srt`;
    const noticeResponse = await app.inject(
      noticeUrl.slice('http://localhost:80'.length),
    );

    expect(subtitles).toEqual([
      {
        id: `notice-${subtitleNotice}`,
        lang: 'tur',
        label: noticeLabel,
        url: noticeUrl,
      },
    ]);
    expect(noticeResponse.statusCode).toBe(StatusCodes.OK);
    expect(noticeResponse.body).toContain(
      noticeLabel.replace(/ to see 2 more$/, ''),
    );
  });

  it('shows quota rows with the Quota note to an account holder and no notice', async () => {
    const {userConfig} = await createListUserConfig({
      credentials: [makeAccountCredential('account-user')],
    });
    const quotaHit = makeOpensubtitlesHit();
    const storedHit = makeOpensubtitlesHit({
      releaseNames: ['The.Matrix.1999.720p.WEB-DL-BBB'],
    });
    opensubtitlesClient.searchSubtitles.mockResolvedValue([
      quotaHit,
      storedHit,
    ]);
    await storeHits(MOVIE_ID, [storedHit]);
    await storeFile(toUrlCode(storedHit));

    const subtitles = await getSubtitleList({userConfigId: userConfig.id});

    const labelByUrlCode = Object.fromEntries(
      subtitles.map(subtitle => [
        subtitle.url.match(URL_CODE_PATTERN)?.[1],
        subtitle.label,
      ]),
    );
    expect(labelByUrlCode).toEqual({
      [toUrlCode(quotaHit)]: `OpenSubtitles · Quota · ${MOVIE_RELEASE}`,
      [toUrlCode(storedHit)]: 'OpenSubtitles · The.Matrix.1999.720p.WEB-DL-BBB',
    });
  });
});

describe('the subtitle list privacy', () => {
  it('never stores the user config id with a video', async () => {
    const {userConfig} = await createListUserConfig({
      credentials: [
        makeApiKeyCredential(SubtitleSource.ALTYAZIDB, 'altyazidb-key'),
      ],
    });
    altyazidbClient.searchSubtitles.mockResolvedValue([
      makeHit({subtitleSource: SubtitleSource.ALTYAZIDB}),
    ]);
    thesubtitledbClient.searchSubtitles.mockResolvedValue([makeHit()]);

    const subtitles = await getSubtitleList({
      userConfigId: userConfig.id,
      extra: toExtra({
        videoHash: VIDEO_HASH,
        videoSizeBytes: VIDEO_SIZE_BYTES,
        videoFilename: `${MOVIE_RELEASE}.mkv`,
      }),
    });
    await drainPendingSearches();

    expect(subtitles).toHaveLength(2);
    expect(await readVariants()).toHaveLength(1);
    const linkedTables = [];
    for (const model of getAppModels()) {
      if (
        ['user_configs', 'user_config_credentials'].includes(model.tableName)
      ) {
        continue;
      }
      const quotedTable = sequelize
        .getQueryInterface()
        .quoteIdentifier(model.tableName);
      const linkedRows = await sequelize.query(
        `SELECT 1 FROM ${quotedTable} AS stored_row WHERE stored_row::text LIKE :userConfigPattern LIMIT 1`,
        {
          replacements: {userConfigPattern: `%${userConfig.id}%`},
          type: QueryTypes.SELECT,
        },
      );
      if (linkedRows.length > 0) {
        linkedTables.push(model.tableName);
      }
    }
    expect(linkedTables).toEqual([]);
    const cachedKeys = (await redis.keys('*')).filter(
      redisKey =>
        !redisKey.startsWith('user-config-cache:v1:') &&
        !redisKey.startsWith('cache-generation:'),
    );
    expect(cachedKeys.length).toBeGreaterThan(0);
    const cachedEntries = await Promise.all(
      cachedKeys.map(
        async redisKey =>
          `${redisKey}\n${(await redis.dumpBuffer(redisKey))?.toString('latin1') ?? ''}`,
      ),
    );
    expect(
      cachedEntries.filter(
        cachedEntry =>
          cachedEntry.includes(userConfig.id) &&
          (cachedEntry.includes(MOVIE_ID) || cachedEntry.includes(VIDEO_HASH)),
      ),
    ).toEqual([]);
  });

  it('never logs the user config id with the video', async () => {
    const {userConfig} = await createListUserConfig();
    thesubtitledbClient.searchSubtitles.mockRejectedValue(
      new Error('The fixture source broke.'),
    );
    await getSubtitleList({userConfigId: userConfig.id, videoId: MOVIE_ID});
    vi.spyOn(userConfigCache, 'get').mockRejectedValue(
      new Error('The configuration store is down.'),
    );

    const response = await requestSubtitleList({
      userConfigId: userConfig.id,
      videoId: MOVIE_ID,
    });

    expectListResponse(response);
    expect(response.json()).toEqual({subtitles: []});
    expect(logLines.length).toBeGreaterThan(0);
    expect(
      logLines.filter(
        logLine =>
          logLine.includes(userConfig.id) && logLine.includes(MOVIE_ID),
      ),
    ).toEqual([]);
  });
});

describe('a kitsu pack served after the list', () => {
  const SEASON_PACK_ENTRIES = {
    'Anime.S01E04.1080p.WEB-AAA.srt': OTHER_TURKISH_SRT,
    'Anime.S01E05.1080p.WEB-AAA.srt': TURKISH_SRT,
  };

  const ABSOLUTE_PACK_ENTRIES = {
    'Anime - 04.srt': OTHER_TURKISH_SRT,
    'Anime - 05.srt': TURKISH_SRT,
  };

  async function storeKitsuPack(kitsuVideoId, packEntries) {
    const [packUrlCode] = await storeHits(kitsuVideoId, [
      makeHit({
        siteFileId: `pack-${kitsuVideoId}`,
        isSitePack: true,
        releaseNames: ['Anime.S01.1080p.WEB-AAA'],
      }),
    ]);
    const packSubtitle = await findSubtitle(packUrlCode);
    await expandArchive({
      packSubtitle,
      fileBytes: zipSync(
        Object.fromEntries(
          Object.entries(packEntries).map(([entryPath, fileText]) => [
            entryPath,
            strToU8(fileText),
          ]),
        ),
      ),
      fileOrigin: SubtitleFileOrigin.DIRECT,
    });
    return {packUrlCode, packSubtitle};
  }

  async function requestFile(subtitleUrl) {
    const app = await getTestApp();
    return app.inject({
      method: 'GET',
      url: subtitleUrl.slice('http://localhost:80'.length),
    });
  }

  async function readBoundEntryPaths(packSubtitle) {
    const packBindings = await SubtitleVideoBinding.findAll({
      attributes: ['videoId', 'boundArchiveEntryPath'],
      where: {subtitleId: packSubtitle.id},
      raw: true,
    });
    return packBindings;
  }

  it('serves the episode the list mapped the kitsu id to', async () => {
    const {userConfig} = await createListUserConfig();
    const kitsuVideoId = `kitsu:${KITSU_ID}:5`;
    const {packUrlCode, packSubtitle} = await storeKitsuPack(
      kitsuVideoId,
      SEASON_PACK_ENTRIES,
    );

    const subtitles = await getSubtitleList({
      userConfigId: userConfig.id,
      videoType: 'anime',
      videoId: kitsuVideoId,
    });
    const fileResponse = await requestFile(subtitles[0].url);

    expect(listUrlCodes(subtitles)).toEqual([packUrlCode]);
    expect(fileResponse.statusCode).toBe(StatusCodes.OK);
    expect(fileResponse.body).toContain('Bu akşam eve erken dönmem gerekiyor.');
    expect(await readBoundEntryPaths(packSubtitle)).toEqual([
      {
        videoId: kitsuVideoId,
        boundArchiveEntryPath: 'Anime.S01E05.1080p.WEB-AAA.srt',
      },
    ]);
  });

  it('binds nothing for a kitsu id the Kitsu addon cannot map', async () => {
    const {userConfig} = await createListUserConfig();
    const kitsuVideoId = 'kitsu:9999:5';
    const {packUrlCode, packSubtitle} = await storeKitsuPack(
      kitsuVideoId,
      ABSOLUTE_PACK_ENTRIES,
    );

    const fileResponse = await requestFile(
      `${getTestAppBaseUrl()}/${userConfig.id}/subtitle-files/${kitsuVideoId}/${packUrlCode}.srt`,
    );

    expect(fileResponse.statusCode).toBe(StatusCodes.OK);
    expect(fileResponse.body).not.toContain('Bu akşam');
    expect(await readBoundEntryPaths(packSubtitle)).toEqual([]);
  });
});

describe('a file for a kitsu id', () => {
  const UNMAPPED_KITSU_VIDEO_ID = 'kitsu:9999:5';

  async function requestKitsuFile({userConfigId, videoId, urlCode}) {
    const app = await getTestApp();
    return app.inject({
      method: 'GET',
      url: `${getTestAppBasePath()}/${userConfigId}/subtitle-files/${videoId}/${urlCode}.srt`,
    });
  }

  function toArchiveDownload(archiveEntries) {
    return {
      fileBytes: zipSync(
        Object.fromEntries(
          Object.entries(archiveEntries).map(([entryPath, fileText]) => [
            entryPath,
            strToU8(fileText),
          ]),
        ),
      ),
      fileNameHint: 'subtitles.zip',
      extractedEntryPath: null,
    };
  }

  it('stores no entry of a multi-episode archive for an unmapped id', async () => {
    const {userConfig} = await createListUserConfig();
    const [urlCode] = await storeHits(UNMAPPED_KITSU_VIDEO_ID, [makeHit()]);
    thesubtitledbClient.downloadSubtitle.mockResolvedValueOnce(
      toArchiveDownload({
        'Anime - 04.srt': OTHER_TURKISH_SRT,
        'Anime - 05.srt': TURKISH_SRT,
      }),
    );

    const response = await requestKitsuFile({
      userConfigId: userConfig.id,
      videoId: UNMAPPED_KITSU_VIDEO_ID,
      urlCode,
    });

    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toContain('could not be downloaded');
    expect(await SubtitleFile.count()).toBe(0);
  });

  it('serves the one entry of a single-entry archive for an unmapped id', async () => {
    const {userConfig} = await createListUserConfig();
    const [urlCode] = await storeHits(UNMAPPED_KITSU_VIDEO_ID, [makeHit()]);
    thesubtitledbClient.downloadSubtitle.mockResolvedValueOnce(
      toArchiveDownload({'Anime - 05.srt': TURKISH_SRT}),
    );

    const response = await requestKitsuFile({
      userConfigId: userConfig.id,
      videoId: UNMAPPED_KITSU_VIDEO_ID,
      urlCode,
    });

    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(response.body).toContain('Bu akşam eve erken dönmem gerekiyor.');
    expect(await SubtitleFile.count()).toBe(1);
  });

  it('serves a stored file without asking the Kitsu addon', async () => {
    const {userConfig} = await createListUserConfig();
    const kitsuVideoId = `kitsu:${KITSU_ID}:5`;
    const [urlCode] = await storeHits(kitsuVideoId, [makeHit()]);
    await storeFile(urlCode);
    const kitsuLookup = vi
      .spyOn(videoCatalog, 'resolveKitsuVideo')
      .mockRejectedValue(new Error('The Kitsu lookup broke.'));

    const response = await requestKitsuFile({
      userConfigId: userConfig.id,
      videoId: kitsuVideoId,
      urlCode,
    });

    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(response.body).toContain('Bu akşam eve erken dönmem gerekiyor.');
    expect(kitsuLookup).not.toHaveBeenCalled();
  });
});

describe('a keyless source with only an invalid own key', () => {
  it('lists only the stored files of that source', async () => {
    const {userConfig, userConfigCredentials} = await createListUserConfig({
      credentials: [
        makeApiKeyCredential(SubtitleSource.THESUBTITLEDB, 'invalid-key'),
      ],
    });
    await markCredentialStatus({
      credentialId: userConfigCredentials[0].id,
      credentialStatus: CredentialStatus.INVALID,
    });
    const [storedUrlCode] = await storeHits(MOVIE_ID, [
      makeHit(),
      makeHit({releaseNames: ['The.Matrix.1999.720p.WEB-DL-BBB']}),
    ]);
    await storeFile(storedUrlCode);

    const subtitles = await getSubtitleList({userConfigId: userConfig.id});

    expect(listUrlCodes(subtitles)).toEqual([storedUrlCode]);
  });
});

describe('a failing best-effort step of the subtitle list', () => {
  it('lists the rows when the extra filename carries a control character', async () => {
    const {userConfig} = await createListUserConfig();
    const searchHit = makeHit();
    thesubtitledbClient.searchSubtitles.mockResolvedValue([searchHit]);

    const subtitles = await getSubtitleList({
      userConfigId: userConfig.id,
      extra: `videoHash=${VIDEO_HASH}&videoSize=${VIDEO_SIZE_BYTES}&filename=Bad%00Name.mkv`,
    });
    await drainPendingSearches();

    expect(listUrlCodes(subtitles)).toEqual([toUrlCode(searchHit)]);
    expect(searchQueries(thesubtitledbClient)[0]).toMatchObject({
      videoFilename: 'BadName.mkv',
    });
  });

  it('lists the rows when a stored file cannot be read for near duplicates', async () => {
    const {userConfig} = await createListUserConfig();
    const urlCodes = await storeHits(MOVIE_ID, [
      makeHit(),
      makeHit({releaseNames: ['The.Matrix.1999.720p.WEB-DL-BBB']}),
    ]);
    await storeFile(urlCodes[0], TURKISH_SRT);
    await storeFile(urlCodes[1], OTHER_TURKISH_SRT);
    const brokenSubtitle = await findSubtitle(urlCodes[0]);
    await sequelize.query(
      'UPDATE subtitle_files SET file_content = :fileContent WHERE subtitle_id = :subtitleId',
      {
        replacements: {
          fileContent: Buffer.from('not a zstd frame'),
          subtitleId: brokenSubtitle.id,
        },
      },
    );

    const subtitles = await getSubtitleList({userConfigId: userConfig.id});

    expect(listUrlCodes(subtitles).toSorted()).toEqual(urlCodes.toSorted());
  });

  it('lists the rows when the catalog seam throws', async () => {
    const {userConfig} = await createListUserConfig();
    const searchHit = makeHit();
    thesubtitledbClient.searchSubtitles.mockResolvedValue([searchHit]);
    vi.spyOn(videoCatalog, 'readCatalogMeta').mockRejectedValue(
      new Error('The catalog seam broke.'),
    );

    const subtitles = await getSubtitleList({userConfigId: userConfig.id});

    expect(listUrlCodes(subtitles)).toEqual([toUrlCode(searchHit)]);
  });
});
