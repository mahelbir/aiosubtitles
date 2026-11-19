import {readFileSync} from 'node:fs';
import {zstdDecompressSync} from 'node:zlib';
import {strToU8, zipSync} from 'fflate';
import iconv from 'iconv-lite';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {
  CredentialKind,
  CredentialStatus,
} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {SubtitleFileExtension} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {buildFileFacts} from '@repo/subtitle-core/file-format/file-facts.js';
import {buildMessageSrt} from '@repo/subtitle-core/file-format/message-srt.js';
import {renderSubtitleFile} from '@repo/subtitle-core/file-format/render-subtitle.js';
import {config} from '../../src/config/index.js';
import {
  SubtitleFile,
  SubtitleFileOrigin,
} from '../../src/db/models/subtitle-file.js';
import {SubtitleVideoBinding} from '../../src/db/models/subtitle-video-binding.js';
import {Subtitle} from '../../src/db/models/subtitle.js';
import {uuidV4} from '../../src/lib/common.js';
import {markCredentialStatus} from '../../src/lib/credential-secret.js';
import {SubtitleMessage} from '../../src/lib/stremio-row/stremio-row-enums.js';
import {computeUrlCode} from '../../src/lib/stremio-row/url-code.js';
import {
  openSubtitleSourceBreaker,
  readSubtitleSourceBreaker,
} from '../../src/lib/subtitle-search/subtitle-source-breaker.js';
import {spendSubtitleSourceBudget} from '../../src/lib/subtitle-search/subtitle-source-budget.js';
import {SubtitleAliasSource} from '../../src/lib/subtitle-sources/subtitle-alias-source.js';
import {createSubtitleSourceRegistry} from '../../src/lib/subtitle-sources/subtitle-source-clients.js';
import {SubtitleSourceBudgetScope} from '../../src/lib/subtitle-sources/subtitle-source-contract.js';
import {
  SourceCredentialError,
  SourceUnavailableError,
} from '../../src/lib/subtitle-sources/subtitle-source-errors.js';
import {expandArchive} from '../../src/lib/subtitle-store/pack-binding.js';
import {persistSearchHits} from '../../src/lib/subtitle-store/persist-search-hits.js';
import {readSubtitleFile} from '../../src/lib/subtitle-store/read-subtitle-file.js';
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
import {readCredentialStatuses} from '../helpers/user-config-factories.js';

const MOVIE_ID = 'tt0133093';
const SERIES_ID = 'tt0944947';
const DAY_MS = 86400000;
const ACCOUNT_DAY_REQUEST_MAX = 3;
const STREMIO_ORIGIN = 'https://web.stremio.com';
const SRT_CONTENT_TYPE = 'application/x-subrip; charset=utf-8';
const ASS_CONTENT_TYPE = 'text/x-ssa; charset=utf-8';
const FILE_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const MESSAGE_CACHE_CONTROL = 'no-store';
const NOTICE_TEXT = 'Add an OpenSubtitles account to see more subtitles.';
const V3_FILE_URL = 'https://subs5.strem.io/en/download/file/123456';
const ARCHIVE_ENTRY_BYTES_PAST_CAP = 60 * 1024 * 1024;
const WINDOWS_1254_SMALL_S_CEDILLA = 0xfe;
const CONFIG_LOOKUPS_PER_FILE_REQUEST = 2;

const MOVIE_SRT = [
  '1\n00:00:01,000 --> 00:00:03,000\nMerhaba dünya.\n',
  '2\n00:00:04,000 --> 00:00:06,000\nNasılsın bugün?\n',
].join('\n');

const FIRST_EPISODE_SRT =
  '1\n00:00:01,000 --> 00:00:03,000\nBirinci bölüm başlıyor.\n';

const SECOND_EPISODE_SRT =
  '1\n00:00:01,000 --> 00:00:03,000\nİkinci bölüm başlıyor.\n';

const MOVIE_ASS = [
  '[Script Info]',
  'ScriptType: v4.00+',
  '',
  '[Events]',
  'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  'Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,Merhaba dünya.',
  'Dialogue: 0,0:00:04.00,0:00:06.00,Default,,0,0,0,,Nasılsın bugün?',
  '',
].join('\n');

const TURKISH_SRT = readFileSync(
  new URL('../fixtures/subtitle-files/turkish.srt', import.meta.url),
  'utf8',
);

const opensubtitlesClient = createFixtureSubtitleSourceClient({
  subtitleSource: SubtitleSource.OPENSUBTITLES,
  credentialKinds: [CredentialKind.ACCOUNT, CredentialKind.API_KEY],
  downloadBudgets: [
    {
      budgetScope: SubtitleSourceBudgetScope.CREDENTIAL,
      windowMs: DAY_MS,
      requestMax: ACCOUNT_DAY_REQUEST_MAX,
    },
  ],
  canDownloadWithoutCredential: vi.fn(() => false),
  downloadSubtitle: vi.fn(),
  readQuota: vi.fn(),
});

const opensubtitlesV3Client = createFixtureSubtitleSourceClient({
  subtitleSource: SubtitleSource.OPENSUBTITLES_V3,
  downloadSubtitle: vi.fn(),
});

const yifyClient = createFixtureSubtitleSourceClient({
  subtitleSource: SubtitleSource.YIFY,
  downloadSubtitle: vi.fn(),
});

const altyazidbClient = createFixtureSubtitleSourceClient({
  subtitleSource: SubtitleSource.ALTYAZIDB,
  credentialKinds: [CredentialKind.API_KEY],
  canSearchWithoutCredential: vi.fn(() => false),
  canDownloadWithoutCredential: vi.fn(() => false),
  downloadSubtitle: vi.fn(),
});

const fixtureClients = [
  opensubtitlesClient,
  opensubtitlesV3Client,
  yifyClient,
  altyazidbClient,
];

setTestAppOptions({
  subtitleSourceRegistry: createSubtitleSourceRegistry(fixtureClients),
});

beforeEach(() => {
  for (const client of fixtureClients) {
    client.isAvailable.mockReset().mockReturnValue(true);
    client.downloadSubtitle
      .mockReset()
      .mockRejectedValue(
        new SourceUnavailableError({subtitleSource: client.subtitleSource}),
      );
  }
  opensubtitlesClient.readQuota.mockReset().mockImplementation(async () => ({
    credentialStatus: CredentialStatus.VALID,
    quotaRemainingCount: 20,
    quotaAllowedCount: 20,
    quotaResetAt: null,
  }));
});

function toMessageSrt(subtitleMessage) {
  return buildMessageSrt(SubtitleMessage.label(subtitleMessage));
}

function toEpisodeId(catalogSeason, catalogEpisode) {
  return `${SERIES_ID}:${catalogSeason}:${catalogEpisode}`;
}

function toDownload(
  fileBytes,
  {fileNameHint = null, extractedEntryPath = null} = {},
) {
  return {
    fileBytes: typeof fileBytes === 'string' ? strToU8(fileBytes) : fileBytes,
    fileNameHint,
    extractedEntryPath,
  };
}

function renderAsSrt(fileText, fileNameHint) {
  const {parsedSubtitle} = buildFileFacts({
    bytes: strToU8(fileText),
    fileNameHint,
    expectedLanguageCode: 'tur',
    fallbackFrameRate: null,
  });
  return renderSubtitleFile({
    parsedSubtitle,
    fileExtension: SubtitleFileExtension.SRT,
  });
}

async function storeHit(videoId, hitOverrides = {}) {
  const searchHit = makeSubtitleSourceHit({
    subtitleSource: SubtitleSource.YIFY,
    ...hitOverrides,
  });
  await persistSearchHits({videoId, searchHits: [searchHit]});
  return {
    searchHit,
    urlCode: computeUrlCode({...searchHit, archiveEntryPath: ''}),
  };
}

function makeOpensubtitlesHit({legacyId = null} = {}) {
  return {
    subtitleSource: SubtitleSource.OPENSUBTITLES,
    isQuotaCostly: true,
    subtitleAliases: legacyId
      ? [
          SubtitleAliasSource.OPENSUBTITLES_LEGACY,
          SubtitleAliasSource.OPENSUBTITLES_V3,
        ].map(aliasSource => ({aliasSource, aliasSiteFileId: legacyId}))
      : [],
  };
}

function makeV3Hit({siteFileId, siteFileUrl = V3_FILE_URL}) {
  return {
    subtitleSource: SubtitleSource.OPENSUBTITLES_V3,
    siteFileId,
    siteFileUrl,
    isQuotaCostly: false,
  };
}

function makeAccountCredential(username) {
  return {
    subtitleSource: SubtitleSource.OPENSUBTITLES,
    credentialKind: CredentialKind.ACCOUNT,
    credentialSecret: {username, password: `${username}-password`},
  };
}

function makeApiKeyCredential(subtitleSource, apiKey) {
  return {
    subtitleSource,
    credentialKind: CredentialKind.API_KEY,
    credentialSecret: {apiKey},
  };
}

async function getSubtitleFile({
  userConfigId,
  videoId,
  urlCode,
  fileExtension = SubtitleFileExtension.SRT,
  headers = {},
}) {
  const app = await getTestApp();
  return app.inject({
    method: 'GET',
    url: `${getTestAppBasePath()}/${userConfigId}/subtitle-files/${videoId}/${urlCode}.${fileExtension}`,
    headers,
  });
}

async function getSubtitleNotice({userConfigId, noticeName, headers = {}}) {
  const app = await getTestApp();
  return app.inject({
    method: 'GET',
    url: `${getTestAppBasePath()}/${userConfigId}/subtitle-notices/${noticeName}.srt`,
    headers,
  });
}

function expectFile(response, {body, contentType = SRT_CONTENT_TYPE}) {
  expect(response.statusCode).toBe(StatusCodes.OK);
  expect(response.body).toBe(body);
  expect(response.headers['content-type']).toBe(contentType);
  expect(response.headers['cache-control']).toBe(FILE_CACHE_CONTROL);
}

function expectMessage(response, subtitleMessage) {
  expect(response.statusCode).toBe(StatusCodes.OK);
  expect(response.body).toBe(toMessageSrt(subtitleMessage));
  expect(response.headers['content-type']).toBe(SRT_CONTENT_TYPE);
  expect(response.headers['cache-control']).toBe(MESSAGE_CACHE_CONTROL);
}

async function readStoredFile(subtitleId) {
  return SubtitleFile.findByPk(subtitleId, {
    attributes: [
      'subtitleId',
      'fileContent',
      'fileEncoding',
      'fileSizeBytes',
      'fileOrigin',
    ],
  });
}

async function findSubtitleByUrlCode(urlCode) {
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

async function readBindings(subtitleId) {
  return SubtitleVideoBinding.findAll({
    attributes: ['videoId', 'boundArchiveEntryPath'],
    where: {subtitleId},
    order: [['videoId', 'ASC']],
    raw: true,
  });
}

async function waitForDownloadCallers(configLookup, callerCount) {
  await vi.waitFor(() => {
    expect(configLookup.mock.settledResults).toHaveLength(
      callerCount * CONFIG_LOOKUPS_PER_FILE_REQUEST,
    );
  });
  await new Promise(resolve => {
    setImmediate(resolve);
  });
}

function downloadCredentialIds(client) {
  return client.downloadSubtitle.mock.calls.map(
    ([, credential]) => credential?.credentialId ?? null,
  );
}

describe('the subtitle file route', () => {
  it('answers Subtitle not found. for an unknown url code', async () => {
    const {userConfig} = await createUserConfig();

    const response = await getSubtitleFile({
      userConfigId: userConfig.id,
      videoId: MOVIE_ID,
      urlCode: '0'.repeat(64),
    });

    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(response.body).toBe(
      '1\n00:00:01,000 --> 00:00:15,000\nSubtitle not found.\n',
    );
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toBe(
      toMessageSrt(SubtitleMessage.SUBTITLE_NOT_FOUND),
    );
  });

  it('downloads a keyless file once and stores its raw bytes', async () => {
    const {userConfig} = await createUserConfig();
    const {searchHit, urlCode} = await storeHit(MOVIE_ID);
    yifyClient.downloadSubtitle.mockResolvedValue(
      toDownload(MOVIE_SRT, {fileNameHint: 'movie.srt'}),
    );

    const response = await getSubtitleFile({
      userConfigId: userConfig.id,
      videoId: MOVIE_ID,
      urlCode,
      headers: {origin: STREMIO_ORIGIN},
    });

    expectFile(response, {body: MOVIE_SRT});
    expect(response.headers['access-control-allow-origin']).toBe('*');
    expect(yifyClient.downloadSubtitle).toHaveBeenCalledTimes(1);
    const [subtitleRef, credential] = yifyClient.downloadSubtitle.mock.calls[0];
    expect(subtitleRef).toMatchObject({
      subtitleSource: SubtitleSource.YIFY,
      siteFileId: searchHit.siteFileId,
      siteFileUrl: null,
      catalogSeason: null,
      catalogEpisode: null,
      isSitePack: false,
    });
    expect(credential).toBeNull();
    const subtitle = await findSubtitleByUrlCode(urlCode);
    const storedFile = await readStoredFile(subtitle.id);
    expect(storedFile.fileOrigin).toBe(SubtitleFileOrigin.DIRECT);
    expect(storedFile.fileSizeBytes).toBe(strToU8(MOVIE_SRT).length);
    expect(zstdDecompressSync(storedFile.fileContent).toString('utf8')).toBe(
      MOVIE_SRT,
    );
    const {fileFacts} = await readSubtitleFile(subtitle.id);
    expect(fileFacts.cueCount).toBe(2);
  });

  it('serves a stored file without reading the configuration', async () => {
    const {userConfig} = await createUserConfig();
    const {urlCode} = await storeHit(MOVIE_ID);
    yifyClient.downloadSubtitle.mockResolvedValue(toDownload(MOVIE_SRT));
    const firstResponse = await getSubtitleFile({
      userConfigId: userConfig.id,
      videoId: MOVIE_ID,
      urlCode,
    });
    expectFile(firstResponse, {body: MOVIE_SRT});
    const configLookup = vi.spyOn(userConfigCache, 'get');

    const storedResponse = await getSubtitleFile({
      userConfigId: uuidV4(),
      videoId: MOVIE_ID,
      urlCode,
    });

    configLookup.mockRestore();
    expectFile(storedResponse, {body: MOVIE_SRT});
    expect(configLookup).not.toHaveBeenCalled();
    expect(yifyClient.downloadSubtitle).toHaveBeenCalledTimes(1);
  });

  it('renders an ASS source as SRT for a .srt url and keeps ASS for .ass', async () => {
    const {userConfig} = await createUserConfig();
    const {urlCode} = await storeHit(MOVIE_ID, {
      fileExtension: SubtitleFileExtension.ASS,
    });
    yifyClient.downloadSubtitle.mockResolvedValue(
      toDownload(MOVIE_ASS, {fileNameHint: 'movie.ass'}),
    );

    const srtResponse = await getSubtitleFile({
      userConfigId: userConfig.id,
      videoId: MOVIE_ID,
      urlCode,
      fileExtension: SubtitleFileExtension.SRT,
    });
    const assResponse = await getSubtitleFile({
      userConfigId: userConfig.id,
      videoId: MOVIE_ID,
      urlCode,
      fileExtension: SubtitleFileExtension.ASS,
    });

    expectFile(srtResponse, {body: renderAsSrt(MOVIE_ASS, 'movie.ass')});
    expect(srtResponse.body).toContain('Merhaba dünya.');
    expect(srtResponse.body).not.toContain('Dialogue:');
    expectFile(assResponse, {body: MOVIE_ASS, contentType: ASS_CONTENT_TYPE});
    expect(yifyClient.downloadSubtitle).toHaveBeenCalledTimes(1);
  });

  it('converts a Windows-1254 file to UTF-8', async () => {
    const legacyBytes = iconv.encode(TURKISH_SRT, 'win1254');
    expect(legacyBytes.includes(WINDOWS_1254_SMALL_S_CEDILLA)).toBe(true);
    expect(legacyBytes.toString('utf8')).not.toBe(TURKISH_SRT);
    const {userConfig} = await createUserConfig();
    const {urlCode} = await storeHit(MOVIE_ID);
    yifyClient.downloadSubtitle.mockResolvedValue(
      toDownload(new Uint8Array(legacyBytes), {fileNameHint: 'turkish.srt'}),
    );

    const response = await getSubtitleFile({
      userConfigId: userConfig.id,
      videoId: MOVIE_ID,
      urlCode,
    });

    expectFile(response, {body: TURKISH_SRT});
    expect(response.body).toContain('ş');
    const subtitle = await findSubtitleByUrlCode(urlCode);
    const storedFile = await readStoredFile(subtitle.id);
    expect(storedFile.fileEncoding).toBe('windows-1254');
    expect(storedFile.fileSizeBytes).toBe(legacyBytes.length);
  });

  it('answers the notice file', async () => {
    const {userConfig} = await createUserConfig();

    const response = await getSubtitleNotice({
      userConfigId: userConfig.id,
      noticeName: 'opensubtitles-account',
      headers: {origin: STREMIO_ORIGIN},
    });

    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(response.body).toBe(buildMessageSrt(NOTICE_TEXT));
    expect(response.body).toBe(
      '1\n00:00:01,000 --> 00:00:15,000\nAdd an OpenSubtitles account to see more subtitles.\n',
    );
    expect(response.headers['content-type']).toBe(SRT_CONTENT_TYPE);
    expect(response.headers['access-control-allow-origin']).toBe('*');
  });

  it('answers Subtitle not found. for an unknown notice', async () => {
    const response = await getSubtitleNotice({
      userConfigId: uuidV4(),
      noticeName: 'no-such-notice',
    });

    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(response.body).toBe(
      toMessageSrt(SubtitleMessage.SUBTITLE_NOT_FOUND),
    );
    expect(response.headers['content-type']).toBe(SRT_CONTENT_TYPE);
  });

  it('answers the rate-limited message with 200 once the window is spent', async () => {
    const userConfigId = uuidV4();
    const urlCode = '0'.repeat(64);
    const statusCodes = [];
    let refusedResponse = null;
    for (let attempt = 0; attempt <= config.rateLimitIpMax; attempt += 1) {
      refusedResponse = await getSubtitleFile({
        userConfigId,
        videoId: MOVIE_ID,
        urlCode,
        headers: {origin: STREMIO_ORIGIN},
      });
      statusCodes.push(refusedResponse.statusCode);
    }

    expect(new Set(statusCodes)).toEqual(new Set([StatusCodes.OK]));
    expectMessage(refusedResponse, SubtitleMessage.RATE_LIMITED);
    expect(refusedResponse.headers['access-control-allow-origin']).toBe('*');
  });
});

describe('an OpenSubtitles download', () => {
  it('downloads an OpenSubtitles file through v3 before spending quota', async () => {
    const {userConfig} = await createUserConfig({
      credentials: [makeAccountCredential('account-user')],
    });
    const {searchHit} = await storeHit(
      MOVIE_ID,
      makeOpensubtitlesHit({legacyId: '123456'}),
    );
    await storeHit(MOVIE_ID, makeV3Hit({siteFileId: '123456'}));
    const opensubtitlesUrlCode = computeUrlCode({
      ...searchHit,
      archiveEntryPath: '',
    });
    opensubtitlesV3Client.downloadSubtitle.mockResolvedValue(
      toDownload(MOVIE_SRT),
    );

    const response = await getSubtitleFile({
      userConfigId: userConfig.id,
      videoId: MOVIE_ID,
      urlCode: opensubtitlesUrlCode,
    });

    expectFile(response, {body: MOVIE_SRT});
    expect(response.headers['content-type']).toBe(
      'application/x-subrip; charset=utf-8',
    );
    expect(opensubtitlesClient.downloadSubtitle).toHaveBeenCalledTimes(0);
    expect(opensubtitlesClient.readQuota).not.toHaveBeenCalled();
    expect(opensubtitlesV3Client.downloadSubtitle).toHaveBeenCalledTimes(1);
    expect(
      opensubtitlesV3Client.downloadSubtitle.mock.calls[0][0],
    ).toMatchObject({
      subtitleSource: SubtitleSource.OPENSUBTITLES_V3,
      siteFileId: '123456',
      siteFileUrl: V3_FILE_URL,
    });
    const subtitle = await findSubtitleByUrlCode(opensubtitlesUrlCode);
    const storedFile = await readStoredFile(subtitle.id);
    expect(storedFile.fileOrigin).toBe(SubtitleFileOrigin.OPENSUBTITLES_V3);
  });

  it('refuses an OpenSubtitles file while the source is unavailable, v3 copy included', async () => {
    const {userConfig} = await createUserConfig({
      credentials: [makeAccountCredential('account-user')],
    });
    const {urlCode} = await storeHit(
      MOVIE_ID,
      makeOpensubtitlesHit({legacyId: '123456'}),
    );
    await storeHit(MOVIE_ID, makeV3Hit({siteFileId: '123456'}));
    opensubtitlesClient.isAvailable.mockResolvedValue(false);
    opensubtitlesV3Client.downloadSubtitle.mockResolvedValue(
      toDownload(MOVIE_SRT),
    );
    opensubtitlesClient.downloadSubtitle.mockResolvedValue(
      toDownload(MOVIE_SRT),
    );

    const response = await getSubtitleFile({
      userConfigId: userConfig.id,
      videoId: MOVIE_ID,
      urlCode,
    });

    expectMessage(response, SubtitleMessage.SUBTITLE_DOWNLOAD_FAILED);
    expect(opensubtitlesClient.downloadSubtitle).not.toHaveBeenCalled();
    expect(opensubtitlesV3Client.downloadSubtitle).not.toHaveBeenCalled();
  });

  it('never requests a v3 copy whose url points at a private host', async () => {
    const {userConfig, userConfigCredentials} = await createUserConfig({
      credentials: [makeAccountCredential('account-user')],
    });
    const {urlCode} = await storeHit(
      MOVIE_ID,
      makeOpensubtitlesHit({legacyId: '123456'}),
    );
    await storeHit(
      MOVIE_ID,
      makeV3Hit({
        siteFileId: '123456',
        siteFileUrl: 'http://127.0.0.1/en/download/file/123456',
      }),
    );
    opensubtitlesV3Client.downloadSubtitle.mockResolvedValue(
      toDownload(SECOND_EPISODE_SRT),
    );
    opensubtitlesClient.downloadSubtitle.mockResolvedValue(
      toDownload(MOVIE_SRT),
    );

    const response = await getSubtitleFile({
      userConfigId: userConfig.id,
      videoId: MOVIE_ID,
      urlCode,
    });

    expectFile(response, {body: MOVIE_SRT});
    expect(opensubtitlesV3Client.downloadSubtitle).not.toHaveBeenCalled();
    expect(downloadCredentialIds(opensubtitlesClient)).toEqual([
      userConfigCredentials[0].id,
    ]);
    const subtitle = await findSubtitleByUrlCode(urlCode);
    const storedFile = await readStoredFile(subtitle.id);
    expect(storedFile.fileOrigin).toBe(SubtitleFileOrigin.USER_CREDENTIAL);
  });

  it('uses the account with the most remaining downloads', async () => {
    const {userConfig, userConfigCredentials} = await createUserConfig({
      credentials: [
        makeAccountCredential('poor-user'),
        makeAccountCredential('rich-user'),
        makeAccountCredential('invalid-user'),
      ],
    });
    const [, richCredential, invalidCredential] = userConfigCredentials;
    await markCredentialStatus({
      credentialId: invalidCredential.id,
      credentialStatus: CredentialStatus.INVALID,
    });
    const quotaByUsername = {
      'poor-user': 10,
      'rich-user': 300,
      'invalid-user': 999,
    };
    opensubtitlesClient.readQuota.mockImplementation(async credential => ({
      credentialStatus: CredentialStatus.VALID,
      quotaRemainingCount: quotaByUsername[credential.username],
      quotaAllowedCount: 1000,
      quotaResetAt: null,
    }));
    opensubtitlesClient.downloadSubtitle.mockResolvedValue(
      toDownload(MOVIE_SRT),
    );
    const {urlCode} = await storeHit(MOVIE_ID, makeOpensubtitlesHit());

    const response = await getSubtitleFile({
      userConfigId: userConfig.id,
      videoId: MOVIE_ID,
      urlCode,
    });

    expectFile(response, {body: MOVIE_SRT});
    expect(downloadCredentialIds(opensubtitlesClient)).toEqual([
      richCredential.id,
    ]);
    expect(opensubtitlesClient.downloadSubtitle.mock.calls[0][1]).toMatchObject(
      {
        credentialKind: CredentialKind.ACCOUNT,
        username: 'rich-user',
        password: 'rich-user-password',
      },
    );
    const subtitle = await findSubtitleByUrlCode(urlCode);
    const storedFile = await readStoredFile(subtitle.id);
    expect(storedFile.fileOrigin).toBe(SubtitleFileOrigin.USER_CREDENTIAL);
  });

  it('moves to the next account when one account budget refuses', async () => {
    const {userConfig, userConfigCredentials} = await createUserConfig({
      credentials: [
        makeAccountCredential('poor-user'),
        makeAccountCredential('rich-user'),
      ],
    });
    const [poorCredential, richCredential] = userConfigCredentials;
    opensubtitlesClient.readQuota.mockImplementation(async credential => ({
      credentialStatus: CredentialStatus.VALID,
      quotaRemainingCount: credential.username === 'rich-user' ? 300 : 10,
      quotaAllowedCount: 1000,
      quotaResetAt: null,
    }));
    opensubtitlesClient.downloadSubtitle.mockResolvedValue(
      toDownload(MOVIE_SRT),
    );
    for (
      let spendIndex = 0;
      spendIndex < ACCOUNT_DAY_REQUEST_MAX;
      spendIndex += 1
    ) {
      await expect(
        spendSubtitleSourceBudget({
          client: opensubtitlesClient,
          credentialId: richCredential.id,
          isBackground: false,
        }),
      ).resolves.toBe(true);
    }
    const {urlCode} = await storeHit(MOVIE_ID, makeOpensubtitlesHit());

    const response = await getSubtitleFile({
      userConfigId: userConfig.id,
      videoId: MOVIE_ID,
      urlCode,
    });

    expectFile(response, {body: MOVIE_SRT});
    expect(downloadCredentialIds(opensubtitlesClient)).toEqual([
      poorCredential.id,
    ]);
  });

  it('marks an account whose login is rejected invalid and tries the next one', async () => {
    const {userConfig, userConfigCredentials} = await createUserConfig({
      credentials: [
        makeAccountCredential('rejected-user'),
        makeAccountCredential('working-user'),
      ],
    });
    const [rejectedCredential, workingCredential] = userConfigCredentials;
    opensubtitlesClient.readQuota.mockImplementation(async credential => ({
      credentialStatus: CredentialStatus.VALID,
      quotaRemainingCount: credential.username === 'rejected-user' ? 300 : 10,
      quotaAllowedCount: 1000,
      quotaResetAt: null,
    }));
    opensubtitlesClient.downloadSubtitle.mockImplementation(
      async (subtitleRef, credential) => {
        if (credential.credentialId === rejectedCredential.id) {
          throw new SourceCredentialError({
            subtitleSource: SubtitleSource.OPENSUBTITLES,
            credentialId: credential.credentialId,
          });
        }
        return toDownload(MOVIE_SRT);
      },
    );
    const {urlCode} = await storeHit(MOVIE_ID, makeOpensubtitlesHit());

    const response = await getSubtitleFile({
      userConfigId: userConfig.id,
      videoId: MOVIE_ID,
      urlCode,
    });

    expectFile(response, {body: MOVIE_SRT});
    expect(downloadCredentialIds(opensubtitlesClient)).toEqual([
      rejectedCredential.id,
      workingCredential.id,
    ]);
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

  it('blames no account for a credential error without a credential id', async () => {
    const {userConfig, userConfigCredentials} = await createUserConfig({
      credentials: [
        makeAccountCredential('first-user'),
        makeAccountCredential('second-user'),
      ],
    });
    const credentialIds = userConfigCredentials.map(({id}) => id);
    opensubtitlesClient.downloadSubtitle.mockRejectedValue(
      new SourceCredentialError({
        subtitleSource: SubtitleSource.OPENSUBTITLES,
        credentialId: null,
      }),
    );
    const {urlCode} = await storeHit(MOVIE_ID, makeOpensubtitlesHit());

    const response = await getSubtitleFile({
      userConfigId: userConfig.id,
      videoId: MOVIE_ID,
      urlCode,
    });

    expectMessage(response, SubtitleMessage.SUBTITLE_DOWNLOAD_FAILED);
    expect(opensubtitlesClient.downloadSubtitle).toHaveBeenCalled();
    expect(await readCredentialStatuses(credentialIds)).toEqual(
      Object.fromEntries(
        credentialIds.map(credentialId => [
          credentialId,
          CredentialStatus.UNCHECKED,
        ]),
      ),
    );
  });

  it('answers the download-failed message when every credential fails', async () => {
    const {userConfig} = await createUserConfig({
      credentials: [
        makeAccountCredential('first-user'),
        makeAccountCredential('second-user'),
      ],
    });
    const {urlCode} = await storeHit(MOVIE_ID, makeOpensubtitlesHit());

    const response = await getSubtitleFile({
      userConfigId: userConfig.id,
      videoId: MOVIE_ID,
      urlCode,
    });

    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(response.body).toBe(
      '1\n00:00:01,000 --> 00:00:15,000\nThis subtitle could not be downloaded. Please try another one.\n',
    );
    expectMessage(response, SubtitleMessage.SUBTITLE_DOWNLOAD_FAILED);
    expect(opensubtitlesClient.downloadSubtitle).toHaveBeenCalledTimes(2);
    expect(await SubtitleFile.count()).toBe(0);
  });

  it('tells a deleted configuration it was deleted when the file needs a key', async () => {
    const {userConfig} = await createUserConfig({
      credentials: [makeAccountCredential('account-user')],
    });
    await userConfig.destroy();
    const {urlCode} = await storeHit(MOVIE_ID, makeOpensubtitlesHit());

    const deletedResponse = await getSubtitleFile({
      userConfigId: userConfig.id,
      videoId: MOVIE_ID,
      urlCode,
    });
    const unknownResponse = await getSubtitleFile({
      userConfigId: uuidV4(),
      videoId: MOVIE_ID,
      urlCode,
    });

    expectMessage(deletedResponse, SubtitleMessage.USER_CONFIG_DELETED);
    expect(deletedResponse.body).toBe(
      '1\n00:00:01,000 --> 00:00:15,000\nThis configuration was deleted.\n',
    );
    expectMessage(unknownResponse, SubtitleMessage.USER_CONFIG_DELETED);
    expect(opensubtitlesClient.downloadSubtitle).not.toHaveBeenCalled();
  });
});

describe('a download for another source', () => {
  it('still downloads a keyless file for an unknown configuration', async () => {
    const {urlCode} = await storeHit(MOVIE_ID);
    yifyClient.downloadSubtitle.mockResolvedValue(toDownload(MOVIE_SRT));

    const response = await getSubtitleFile({
      userConfigId: uuidV4(),
      videoId: MOVIE_ID,
      urlCode,
    });

    expectFile(response, {body: MOVIE_SRT});
    expect(yifyClient.downloadSubtitle.mock.calls[0][1]).toBeNull();
  });

  it('never downloads from a key-required source for a user whose only key is invalid', async () => {
    const {userConfig, userConfigCredentials} = await createUserConfig({
      credentials: [
        makeApiKeyCredential(SubtitleSource.ALTYAZIDB, 'invalid-api-key'),
      ],
    });
    await markCredentialStatus({
      credentialId: userConfigCredentials[0].id,
      credentialStatus: CredentialStatus.INVALID,
    });
    const {urlCode} = await storeHit(MOVIE_ID, {
      subtitleSource: SubtitleSource.ALTYAZIDB,
    });
    altyazidbClient.downloadSubtitle.mockResolvedValue(toDownload(MOVIE_SRT));

    const response = await getSubtitleFile({
      userConfigId: userConfig.id,
      videoId: MOVIE_ID,
      urlCode,
    });

    expectMessage(response, SubtitleMessage.SUBTITLE_DOWNLOAD_FAILED);
    expect(altyazidbClient.downloadSubtitle).not.toHaveBeenCalled();
  });

  it('fails without a keyless retry when the user key of a key-required source fails', async () => {
    const {userConfig, userConfigCredentials} = await createUserConfig({
      credentials: [
        makeApiKeyCredential(SubtitleSource.ALTYAZIDB, 'failing-api-key'),
      ],
    });
    const {urlCode} = await storeHit(MOVIE_ID, {
      subtitleSource: SubtitleSource.ALTYAZIDB,
    });
    altyazidbClient.downloadSubtitle.mockImplementation(
      async (subtitleRef, credential) => {
        if (credential === null) {
          return toDownload(MOVIE_SRT);
        }
        throw new SourceUnavailableError({
          subtitleSource: SubtitleSource.ALTYAZIDB,
        });
      },
    );

    const response = await getSubtitleFile({
      userConfigId: userConfig.id,
      videoId: MOVIE_ID,
      urlCode,
    });

    expectMessage(response, SubtitleMessage.SUBTITLE_DOWNLOAD_FAILED);
    expect(downloadCredentialIds(altyazidbClient)).toEqual([
      userConfigCredentials[0].id,
    ]);
  });

  it('tries the keys of a key-only source in position order', async () => {
    const {userConfig, userConfigCredentials} = await createUserConfig({
      credentials: [
        makeApiKeyCredential(SubtitleSource.ALTYAZIDB, 'rejected-api-key'),
        makeApiKeyCredential(SubtitleSource.ALTYAZIDB, 'working-api-key'),
      ],
    });
    const [rejectedCredential, workingCredential] = userConfigCredentials;
    altyazidbClient.downloadSubtitle.mockImplementation(
      async (subtitleRef, credential) => {
        if (credential.credentialId === rejectedCredential.id) {
          throw new SourceCredentialError({
            subtitleSource: SubtitleSource.ALTYAZIDB,
            credentialId: credential.credentialId,
          });
        }
        return toDownload(MOVIE_SRT);
      },
    );
    const {urlCode} = await storeHit(MOVIE_ID, {
      subtitleSource: SubtitleSource.ALTYAZIDB,
    });

    const response = await getSubtitleFile({
      userConfigId: userConfig.id,
      videoId: MOVIE_ID,
      urlCode,
    });

    expectFile(response, {body: MOVIE_SRT});
    expect(downloadCredentialIds(altyazidbClient)).toEqual([
      rejectedCredential.id,
      workingCredential.id,
    ]);
    expect(altyazidbClient.downloadSubtitle.mock.calls[1][1]).toMatchObject({
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
    const subtitle = await findSubtitleByUrlCode(urlCode);
    const storedFile = await readStoredFile(subtitle.id);
    expect(storedFile.fileOrigin).toBe(SubtitleFileOrigin.USER_CREDENTIAL);
  });

  it('skips a source whose breaker is open', async () => {
    const {userConfig} = await createUserConfig();
    const {urlCode} = await storeHit(MOVIE_ID);
    yifyClient.downloadSubtitle.mockResolvedValue(toDownload(MOVIE_SRT));
    await openSubtitleSourceBreaker({
      subtitleSource: SubtitleSource.YIFY,
      retryAfterMs: 120000,
      nowMs: Date.now(),
    });

    const response = await getSubtitleFile({
      userConfigId: userConfig.id,
      videoId: MOVIE_ID,
      urlCode,
    });

    expectMessage(response, SubtitleMessage.SUBTITLE_DOWNLOAD_FAILED);
    expect(yifyClient.downloadSubtitle).not.toHaveBeenCalled();
  });

  it('fetches a file once for two concurrent requests', async () => {
    const {userConfig} = await createUserConfig();
    const {urlCode} = await storeHit(MOVIE_ID);
    const sourceAnswer = Promise.withResolvers();
    yifyClient.downloadSubtitle.mockImplementation(() => sourceAnswer.promise);
    const request = {userConfigId: userConfig.id, videoId: MOVIE_ID, urlCode};
    const configLookup = vi.spyOn(userConfigCache, 'get');

    const responses = Promise.all([
      getSubtitleFile(request),
      getSubtitleFile(request),
    ]);
    await waitForDownloadCallers(configLookup, 2);
    await vi.waitFor(() => {
      expect(yifyClient.downloadSubtitle).toHaveBeenCalledTimes(1);
    });
    sourceAnswer.resolve(toDownload(MOVIE_SRT));
    const [firstResponse, secondResponse] = await responses;
    configLookup.mockRestore();

    expectFile(firstResponse, {body: MOVIE_SRT});
    expectFile(secondResponse, {body: MOVIE_SRT});
    expect(yifyClient.downloadSubtitle).toHaveBeenCalledTimes(1);
    expect(await SubtitleFile.count()).toBe(1);
  });

  it('gives a second user their own answer when the first user download fails', async () => {
    const {
      userConfig: rejectedConfig,
      userConfigCredentials: [rejectedCredential],
    } = await createUserConfig({
      credentials: [makeAccountCredential('rejected-user')],
    });
    const {
      userConfig: workingConfig,
      userConfigCredentials: [workingCredential],
    } = await createUserConfig({
      credentials: [makeAccountCredential('working-user')],
    });
    const {urlCode} = await storeHit(MOVIE_ID, makeOpensubtitlesHit());
    const rejection = Promise.withResolvers();
    opensubtitlesClient.downloadSubtitle.mockImplementation(
      async (subtitleRef, credential) => {
        if (credential.credentialId === rejectedCredential.id) {
          await rejection.promise;
          throw new SourceCredentialError({
            subtitleSource: SubtitleSource.OPENSUBTITLES,
            credentialId: credential.credentialId,
          });
        }
        return toDownload(MOVIE_SRT);
      },
    );
    const configLookup = vi.spyOn(userConfigCache, 'get');

    const rejectedResponse = getSubtitleFile({
      userConfigId: rejectedConfig.id,
      videoId: MOVIE_ID,
      urlCode,
    });
    await vi.waitFor(() => {
      expect(opensubtitlesClient.downloadSubtitle).toHaveBeenCalledTimes(1);
    });
    const workingResponse = getSubtitleFile({
      userConfigId: workingConfig.id,
      videoId: MOVIE_ID,
      urlCode,
    });
    await waitForDownloadCallers(configLookup, 2);
    rejection.resolve();

    expectMessage(
      await rejectedResponse,
      SubtitleMessage.SUBTITLE_DOWNLOAD_FAILED,
    );
    expectFile(await workingResponse, {body: MOVIE_SRT});
    configLookup.mockRestore();
    expect(downloadCredentialIds(opensubtitlesClient)).toEqual([
      rejectedCredential.id,
      workingCredential.id,
    ]);
  });

  it('answers download-failed for an error page, stores no row and downloads again later', async () => {
    const {userConfig} = await createUserConfig();
    const {urlCode} = await storeHit(MOVIE_ID);
    yifyClient.downloadSubtitle
      .mockResolvedValueOnce(
        toDownload('<!DOCTYPE html><html><body>Server error</body></html>'),
      )
      .mockResolvedValueOnce(toDownload(TURKISH_SRT));
    const request = {userConfigId: userConfig.id, videoId: MOVIE_ID, urlCode};

    const firstResponse = await getSubtitleFile(request);
    const subtitle = await findSubtitleByUrlCode(urlCode);
    const rowAfterErrorPage = await SubtitleFile.findByPk(subtitle.id, {
      attributes: ['subtitleId'],
    });
    const breakerAfterErrorPage = await readSubtitleSourceBreaker(
      SubtitleSource.YIFY,
      Date.now(),
    );
    const secondResponse = await getSubtitleFile(request);

    expectMessage(firstResponse, SubtitleMessage.SUBTITLE_DOWNLOAD_FAILED);
    expect(rowAfterErrorPage).toBeNull();
    expect(breakerAfterErrorPage.isOpen).toBe(false);
    expect(secondResponse.statusCode).toBe(StatusCodes.OK);
    expect(secondResponse.headers['cache-control']).toBe(FILE_CACHE_CONTROL);
    expect(yifyClient.downloadSubtitle).toHaveBeenCalledTimes(2);
    expect(await readStoredFile(subtitle.id)).not.toBeNull();
  });

  it('stores a real file that fails a content check', async () => {
    const {userConfig} = await createUserConfig();
    const {urlCode} = await storeHit(MOVIE_ID);
    yifyClient.downloadSubtitle.mockResolvedValue(
      toDownload('1\n00:00:01,000 --> 00:00:03,000\nMerhaba dünya.\n'),
    );

    await getSubtitleFile({
      userConfigId: userConfig.id,
      videoId: MOVIE_ID,
      urlCode,
    });

    const subtitle = await findSubtitleByUrlCode(urlCode);
    const storedFile = await SubtitleFile.findByPk(subtitle.id, {
      attributes: ['subtitleId', 'isFileValid'],
    });
    expect(storedFile.isFileValid).toBe(false);
  });

  it('answers download-failed for a video id that is not a Stremio id', async () => {
    const {userConfig} = await createUserConfig();
    const {urlCode} = await storeHit(MOVIE_ID);

    const response = await getSubtitleFile({
      userConfigId: userConfig.id,
      videoId: 'x'.repeat(200),
      urlCode,
    });

    expectMessage(response, SubtitleMessage.SUBTITLE_DOWNLOAD_FAILED);
    expect(yifyClient.downloadSubtitle).not.toHaveBeenCalled();
  });

  it('never caches a user config id beside the video or the file', async () => {
    const {userConfig} = await createUserConfig({
      credentials: [
        makeApiKeyCredential(SubtitleSource.ALTYAZIDB, 'viewer-api-key'),
      ],
    });
    const {urlCode} = await storeHit(MOVIE_ID, {
      subtitleSource: SubtitleSource.ALTYAZIDB,
    });
    altyazidbClient.downloadSubtitle.mockResolvedValue(toDownload(MOVIE_SRT));

    const response = await getSubtitleFile({
      userConfigId: userConfig.id,
      videoId: MOVIE_ID,
      urlCode,
    });

    expectFile(response, {body: MOVIE_SRT});
    const cachedKeys = (await redis.keys('*')).filter(
      redisKey =>
        !redisKey.startsWith('user-config-cache:v1:') &&
        !redisKey.startsWith('cache-generation:'),
    );
    const cachedEntries = await Promise.all(
      cachedKeys.map(
        async redisKey =>
          `${redisKey}\n${(await redis.dumpBuffer(redisKey))?.toString('latin1') ?? ''}`,
      ),
    );
    for (const cachedEntry of cachedEntries) {
      const isUserConfigLinked =
        cachedEntry.includes(userConfig.id) &&
        (cachedEntry.includes(MOVIE_ID) || cachedEntry.includes(urlCode));
      expect(isUserConfigLinked).toBe(false);
    }
  });
});

describe('an archive download', () => {
  it('binds each episode of one pack to its own entry', async () => {
    const {userConfig} = await createUserConfig();
    const firstEpisodeId = toEpisodeId(1, 1);
    const secondEpisodeId = toEpisodeId(1, 2);
    const packHit = {siteFileId: 'pack-1', isSitePack: true};
    const {searchHit, urlCode} = await storeHit(firstEpisodeId, packHit);
    await persistSearchHits({
      videoId: secondEpisodeId,
      searchHits: [searchHit],
    });
    yifyClient.downloadSubtitle.mockResolvedValue(
      toDownload(
        zipSync({
          'Show.S01E01.720p.WEB.srt': strToU8(FIRST_EPISODE_SRT),
          'Show.S01E02.720p.WEB.srt': strToU8(SECOND_EPISODE_SRT),
        }),
        {fileNameHint: 'Show.S01.zip'},
      ),
    );

    const firstResponse = await getSubtitleFile({
      userConfigId: userConfig.id,
      videoId: firstEpisodeId,
      urlCode,
    });
    const secondResponse = await getSubtitleFile({
      userConfigId: userConfig.id,
      videoId: secondEpisodeId,
      urlCode,
    });

    expectFile(firstResponse, {body: FIRST_EPISODE_SRT});
    expectFile(secondResponse, {body: SECOND_EPISODE_SRT});
    expect(yifyClient.downloadSubtitle).toHaveBeenCalledTimes(1);
    expect(yifyClient.downloadSubtitle.mock.calls[0][0]).toMatchObject({
      subtitleSource: SubtitleSource.YIFY,
      siteFileId: 'pack-1',
      catalogSeason: 1,
      catalogEpisode: 1,
      isSitePack: true,
    });
    const packSubtitle = await findSubtitleByUrlCode(urlCode);
    expect(await readBindings(packSubtitle.id)).toEqual([
      {
        videoId: firstEpisodeId,
        boundArchiveEntryPath: 'Show.S01E01.720p.WEB.srt',
      },
      {
        videoId: secondEpisodeId,
        boundArchiveEntryPath: 'Show.S01E02.720p.WEB.srt',
      },
    ]);
    const innerSubtitles = await Promise.all(
      ['Show.S01E01.720p.WEB.srt', 'Show.S01E02.720p.WEB.srt'].map(
        archiveEntryPath =>
          findSubtitleByUrlCode(
            computeUrlCode({
              subtitleSource: SubtitleSource.YIFY,
              siteFileId: 'pack-1',
              archiveEntryPath,
            }),
          ),
      ),
    );
    for (const innerSubtitle of innerSubtitles) {
      expect(innerSubtitle).toMatchObject({
        subtitleSource: SubtitleSource.YIFY,
        siteFileId: 'pack-1',
      });
      expect(await readStoredFile(innerSubtitle.id)).not.toBeNull();
    }
  });

  it('keeps serving the bound entry after a new entry appears', async () => {
    const {userConfig} = await createUserConfig();
    const episodeId = toEpisodeId(1, 1);
    const {urlCode} = await storeHit(episodeId, {
      siteFileId: 'pack-2',
      isSitePack: true,
    });
    yifyClient.downloadSubtitle.mockResolvedValue(
      toDownload(
        zipSync({'Show.S01E01.720p.WEB.srt': strToU8(FIRST_EPISODE_SRT)}),
      ),
    );
    const boundResponse = await getSubtitleFile({
      userConfigId: userConfig.id,
      videoId: episodeId,
      urlCode,
    });
    expectFile(boundResponse, {body: FIRST_EPISODE_SRT});
    const packSubtitle = await findSubtitleByUrlCode(urlCode);

    await expandArchive({
      packSubtitle,
      fileBytes: zipSync({
        'Show.S01E01.720p.WEB.srt': strToU8(FIRST_EPISODE_SRT),
        'S01E01.srt': strToU8(SECOND_EPISODE_SRT),
      }),
      fileOrigin: SubtitleFileOrigin.DIRECT,
    });
    const laterResponse = await getSubtitleFile({
      userConfigId: userConfig.id,
      videoId: episodeId,
      urlCode,
    });

    expect(
      await findSubtitleByUrlCode(
        computeUrlCode({
          subtitleSource: SubtitleSource.YIFY,
          siteFileId: 'pack-2',
          archiveEntryPath: 'S01E01.srt',
        }),
      ),
    ).not.toBeNull();
    expectFile(laterResponse, {body: FIRST_EPISODE_SRT});
    expect(await readBindings(packSubtitle.id)).toEqual([
      {videoId: episodeId, boundArchiveEntryPath: 'Show.S01E01.720p.WEB.srt'},
    ]);
    expect(yifyClient.downloadSubtitle).toHaveBeenCalledTimes(1);
  });

  it('answers the download-failed message for a pack without the episode', async () => {
    const {userConfig} = await createUserConfig();
    const episodeId = toEpisodeId(1, 3);
    const {urlCode} = await storeHit(episodeId, {
      siteFileId: 'pack-3',
      isSitePack: true,
    });
    yifyClient.downloadSubtitle.mockResolvedValue(
      toDownload(
        zipSync({
          'S01E01.srt': strToU8(FIRST_EPISODE_SRT),
          'S01E02.srt': strToU8(SECOND_EPISODE_SRT),
        }),
      ),
    );

    const response = await getSubtitleFile({
      userConfigId: userConfig.id,
      videoId: episodeId,
      urlCode,
    });

    expectMessage(response, SubtitleMessage.SUBTITLE_DOWNLOAD_FAILED);
    expect(yifyClient.downloadSubtitle).toHaveBeenCalledTimes(1);
    const packSubtitle = await findSubtitleByUrlCode(urlCode);
    expect(await readBindings(packSubtitle.id)).toEqual([]);
  });

  it('stores an episode the source cut from a pack under its entry path', async () => {
    const {userConfig} = await createUserConfig();
    const episodeId = toEpisodeId(1, 4);
    const {urlCode} = await storeHit(episodeId, {
      siteFileId: 'pack-4',
      isSitePack: true,
    });
    yifyClient.downloadSubtitle.mockResolvedValue(
      toDownload(FIRST_EPISODE_SRT, {extractedEntryPath: 'S01E04'}),
    );

    const response = await getSubtitleFile({
      userConfigId: userConfig.id,
      videoId: episodeId,
      urlCode,
    });

    expectFile(response, {body: FIRST_EPISODE_SRT});
    expect(yifyClient.downloadSubtitle.mock.calls[0][0]).toMatchObject({
      catalogSeason: 1,
      catalogEpisode: 4,
      isSitePack: true,
    });
    const innerSubtitle = await findSubtitleByUrlCode(
      computeUrlCode({
        subtitleSource: SubtitleSource.YIFY,
        siteFileId: 'pack-4',
        archiveEntryPath: 'S01E04',
      }),
    );
    expect(innerSubtitle).toMatchObject({archiveEntryPath: 'S01E04'});
    expect(await readStoredFile(innerSubtitle.id)).not.toBeNull();
    const packSubtitle = await findSubtitleByUrlCode(urlCode);
    expect(await readBindings(packSubtitle.id)).toEqual([
      {videoId: episodeId, boundArchiveEntryPath: 'S01E04'},
    ]);
  });

  it('never downloads a pack again for an episode it lacks', async () => {
    const {userConfig} = await createUserConfig();
    const episodeId = toEpisodeId(1, 3);
    const {urlCode} = await storeHit(episodeId, {
      siteFileId: 'pack-6',
      isSitePack: true,
    });
    yifyClient.downloadSubtitle.mockResolvedValue(
      toDownload(
        zipSync({
          'S01E01.srt': strToU8(FIRST_EPISODE_SRT),
          'S01E02.srt': strToU8(SECOND_EPISODE_SRT),
        }),
      ),
    );
    const request = {userConfigId: userConfig.id, videoId: episodeId, urlCode};

    const firstResponse = await getSubtitleFile(request);
    const secondResponse = await getSubtitleFile(request);

    expectMessage(firstResponse, SubtitleMessage.SUBTITLE_DOWNLOAD_FAILED);
    expectMessage(secondResponse, SubtitleMessage.SUBTITLE_DOWNLOAD_FAILED);
    expect(yifyClient.downloadSubtitle).toHaveBeenCalledTimes(1);
  });

  it('cuts each episode of a pack for concurrent requests', async () => {
    const {userConfig} = await createUserConfig();
    const firstEpisodeId = toEpisodeId(1, 5);
    const secondEpisodeId = toEpisodeId(1, 6);
    const {searchHit, urlCode} = await storeHit(firstEpisodeId, {
      siteFileId: 'pack-7',
      isSitePack: true,
    });
    await persistSearchHits({
      videoId: secondEpisodeId,
      searchHits: [searchHit],
    });
    const sourceAnswer = Promise.withResolvers();
    yifyClient.downloadSubtitle.mockImplementation(async subtitleRef => {
      await sourceAnswer.promise;
      return toDownload(
        subtitleRef.catalogEpisode === 5
          ? FIRST_EPISODE_SRT
          : SECOND_EPISODE_SRT,
        {extractedEntryPath: `S01E0${subtitleRef.catalogEpisode}`},
      );
    });
    const configLookup = vi.spyOn(userConfigCache, 'get');

    const responses = Promise.all([
      getSubtitleFile({
        userConfigId: userConfig.id,
        videoId: firstEpisodeId,
        urlCode,
      }),
      getSubtitleFile({
        userConfigId: userConfig.id,
        videoId: secondEpisodeId,
        urlCode,
      }),
    ]);
    await waitForDownloadCallers(configLookup, 2);
    sourceAnswer.resolve();
    const [firstResponse, secondResponse] = await responses;
    configLookup.mockRestore();

    expectFile(firstResponse, {body: FIRST_EPISODE_SRT});
    expectFile(secondResponse, {body: SECOND_EPISODE_SRT});
    expect(yifyClient.downloadSubtitle).toHaveBeenCalledTimes(2);
  });

  it('answers download-failed for a pack whose download is one plain file', async () => {
    const {userConfig} = await createUserConfig();
    const {urlCode} = await storeHit(toEpisodeId(1, 1), {
      siteFileId: 'pack-8',
      isSitePack: true,
    });
    yifyClient.downloadSubtitle.mockResolvedValue(
      toDownload(FIRST_EPISODE_SRT),
    );

    const response = await getSubtitleFile({
      userConfigId: userConfig.id,
      videoId: toEpisodeId(1, 1),
      urlCode,
    });

    expectMessage(response, SubtitleMessage.SUBTITLE_DOWNLOAD_FAILED);
    expect(await SubtitleFile.count()).toBe(0);
  });

  it('never binds a pack to a video without an episode', async () => {
    const {userConfig} = await createUserConfig();
    const {urlCode} = await storeHit(toEpisodeId(1, 1), {
      siteFileId: 'pack-9',
      isSitePack: true,
    });
    yifyClient.downloadSubtitle.mockResolvedValue(
      toDownload(zipSync({'S01E01.srt': strToU8(FIRST_EPISODE_SRT)})),
    );

    const response = await getSubtitleFile({
      userConfigId: userConfig.id,
      videoId: SERIES_ID,
      urlCode,
    });

    expectMessage(response, SubtitleMessage.SUBTITLE_DOWNLOAD_FAILED);
    expect(yifyClient.downloadSubtitle).not.toHaveBeenCalled();
    const packSubtitle = await findSubtitleByUrlCode(urlCode);
    expect(await readBindings(packSubtitle.id)).toEqual([]);
  });

  it('refuses an archive whose entries inflate past the cap', async () => {
    const {userConfig} = await createUserConfig();
    const {urlCode} = await storeHit(MOVIE_ID);
    yifyClient.downloadSubtitle.mockResolvedValue(
      toDownload(
        zipSync({'movie.srt': new Uint8Array(ARCHIVE_ENTRY_BYTES_PAST_CAP)}),
      ),
    );

    const response = await getSubtitleFile({
      userConfigId: userConfig.id,
      videoId: MOVIE_ID,
      urlCode,
    });

    expectMessage(response, SubtitleMessage.SUBTITLE_DOWNLOAD_FAILED);
    expect(yifyClient.downloadSubtitle).toHaveBeenCalledTimes(1);
    expect(await SubtitleFile.count()).toBe(0);
  });

  it.each([
    [
      'a damaged archive',
      () => {
        const zipBytes = zipSync({'movie.srt': strToU8(MOVIE_SRT)});
        return zipBytes.subarray(0, zipBytes.length - 30);
      },
    ],
    [
      'an archive without a subtitle entry',
      () => zipSync({'readme.txt': strToU8('No subtitle here.')}),
    ],
  ])(
    'answers the download-failed message for %s',
    async (archiveName, buildArchive) => {
      const {userConfig} = await createUserConfig();
      const {urlCode} = await storeHit(MOVIE_ID);
      yifyClient.downloadSubtitle.mockResolvedValue(toDownload(buildArchive()));

      const response = await getSubtitleFile({
        userConfigId: userConfig.id,
        videoId: MOVIE_ID,
        urlCode,
      });

      expectMessage(response, SubtitleMessage.SUBTITLE_DOWNLOAD_FAILED);
      expect(yifyClient.downloadSubtitle).toHaveBeenCalledTimes(1);
      expect(await SubtitleFile.count()).toBe(0);
    },
  );
});
