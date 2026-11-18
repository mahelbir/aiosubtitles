import {StatusCodes} from 'http-status-codes';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  ADDON_MANIFEST_VERSION,
  ADDON_NAME,
} from '@repo/shared/constants/app.js';
import {
  CredentialKind,
  CredentialStatus,
} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {opensubtitlesMapping} from '../../../src/lib/subtitle-sources/opensubtitles/opensubtitles-mapping.js';
import {subtitleSourceHitSchema} from '../../../src/lib/subtitle-sources/subtitle-source-contract.js';
import {
  SourceCredentialError,
  SourceRateLimitError,
  SourceUnavailableError,
} from '../../../src/lib/subtitle-sources/subtitle-source-errors.js';
import {buildSubtitleSourceRequestOptions} from '../../../src/lib/subtitle-sources/subtitle-source-request.js';
import {readFixture} from '../../helpers/read-fixture.js';
import {
  makeSearchQuery,
  makeSubtitleSourceCredential,
} from '../../helpers/subtitle-source-factories.js';

const SERVER_API_KEY = 'test-opensubtitles-api-key';
const USER_API_KEY = 'fixture-user-opensubtitles-key';
const ACCOUNT_PASSWORD = 'fixture-account-password';
const VIDEO_HASH = '8e245d9679d31e12';
const FIXTURE_DIRECTORY = 'subtitle-sources/opensubtitles';
const API_URL = 'https://api.opensubtitles.com/api/v1';
const VIP_API_URL = 'https://vip-api.opensubtitles.com/api/v1';
const session = {token: 'fixture-opensubtitles-token', baseUrl: VIP_API_URL};
const accountCredential = makeSubtitleSourceCredential({
  credentialKind: CredentialKind.ACCOUNT,
  apiKey: undefined,
  username: 'fixture-user',
  password: ACCOUNT_PASSWORD,
});
const keyCredential = makeSubtitleSourceCredential({apiKey: USER_API_KEY});
const episodeQuery = makeSearchQuery({
  videoId: 'tt0944947:1:2',
  videoType: 'series',
  imdbId: 'tt0944947',
  catalogSeason: 1,
  catalogEpisode: 2,
  languageCodes: ['tur', 'pob'],
  videoHash: VIDEO_HASH,
});
const subtitleRef = {
  subtitleSource: SubtitleSource.OPENSUBTITLES,
  siteFileId: '7001',
  siteFileUrl: null,
  catalogSeason: 1,
  catalogEpisode: 2,
};

function readOpensubtitlesFixture(fileName) {
  return readFixture(`${FIXTURE_DIRECTORY}/${fileName}`);
}

async function readEpisodeHits(searchQuery = episodeQuery) {
  return opensubtitlesMapping.toSearchHits(
    {
      status: StatusCodes.OK,
      headers: {'content-type': 'application/json'},
      body: await readOpensubtitlesFixture('subtitles.json'),
    },
    searchQuery,
  );
}

async function readSubtitleItem(subtitleId) {
  const subtitlesBody = await readOpensubtitlesFixture('subtitles.json');
  return subtitlesBody.data.find(
    siteSubtitle => siteSubtitle.id === subtitleId,
  );
}

function mapItems(siteSubtitles) {
  return opensubtitlesMapping.toSearchHits(
    {status: StatusCodes.OK, headers: {}, body: {data: siteSubtitles}},
    episodeQuery,
  );
}

function findHit(hits, siteFileId) {
  return hits.find(hit => hit.siteFileId === siteFileId);
}

function catchError(callback) {
  try {
    callback();
  } catch (error) {
    return error;
  }
  return null;
}

function toErrorText(error) {
  return `${error.message} ${error.cause?.message} ${JSON.stringify(error)}`;
}

function findHeaderNames(headers) {
  return Object.keys(headers).map(headerName => headerName.toLowerCase());
}

function readSearchUrl(searchQuery, searchOptions = {apiKey: SERVER_API_KEY}) {
  return new URL(
    opensubtitlesMapping.buildSearchRequest(searchQuery, searchOptions).url,
  );
}

describe('opensubtitlesMapping.buildSearchRequest', () => {
  it('asks one episode with sorted lower-case parameters and the server key', () => {
    const searchRequest = opensubtitlesMapping.buildSearchRequest(
      episodeQuery,
      {credential: null, apiKey: SERVER_API_KEY},
    );
    const searchUrl = new URL(searchRequest.url);
    expect(`${searchUrl.origin}${searchUrl.pathname}`).toBe(
      `${API_URL}/subtitles`,
    );
    expect([...searchUrl.searchParams.keys()]).toEqual([
      'episode_number',
      'languages',
      'moviehash',
      'parent_imdb_id',
      'season_number',
    ]);
    expect(Object.fromEntries(searchUrl.searchParams)).toEqual({
      episode_number: '2',
      languages: 'pt-br,tr',
      moviehash: VIDEO_HASH,
      parent_imdb_id: '944947',
      season_number: '1',
    });
    expect(searchRequest.headers).toMatchObject({'Api-Key': SERVER_API_KEY});
    expect(searchRequest).toMatchObject({
      subtitleSource: SubtitleSource.OPENSUBTITLES,
      method: 'GET',
      responseType: 'json',
      acceptedStatuses: [],
      credentialId: null,
    });
  });

  it('asks a movie by its imdb id without tt or leading zeros', () => {
    const searchUrl = readSearchUrl(
      makeSearchQuery({imdbId: 'tt0111161', languageCodes: ['eng', 'tur']}),
    );
    expect([...searchUrl.searchParams.keys()]).toEqual([
      'imdb_id',
      'languages',
    ]);
    expect(Object.fromEntries(searchUrl.searchParams)).toEqual({
      imdb_id: '111161',
      languages: 'en,tr',
    });
  });

  it('sends the video hash lower-cased', () => {
    const searchUrl = readSearchUrl(
      makeSearchQuery({videoHash: VIDEO_HASH.toUpperCase()}),
    );
    expect(searchUrl.searchParams.get('moviehash')).toBe(VIDEO_HASH);
  });

  it('asks the documented regional codes and never a bare pt or zh', () => {
    const searchUrl = readSearchUrl(
      makeSearchQuery({languageCodes: ['zho', 'por', 'spa', 'pob']}),
    );
    expect(searchUrl.searchParams.get('languages')).toBe(
      'es,pt-br,pt-pt,zh-cn',
    );
  });

  it('skips Latin American Spanish, which the site lists no code for', () => {
    expect(
      readSearchUrl(
        makeSearchQuery({languageCodes: ['spl', 'tur']}),
      ).searchParams.get('languages'),
    ).toBe('tr');
    expect(
      opensubtitlesMapping.buildSearchRequest(
        makeSearchQuery({languageCodes: ['spl']}),
        {credential: null, apiKey: SERVER_API_KEY},
      ),
    ).toBeNull();
  });

  it('leaves the app User-Agent and Accept to the shared defaults', () => {
    const searchRequest = opensubtitlesMapping.buildSearchRequest(
      episodeQuery,
      {credential: null, apiKey: SERVER_API_KEY},
    );
    expect(findHeaderNames(searchRequest.headers)).not.toContain('user-agent');
    expect(buildSubtitleSourceRequestOptions(searchRequest).headers).toEqual(
      expect.objectContaining({
        'User-Agent': `${ADDON_NAME} v${ADDON_MANIFEST_VERSION}`,
        Accept: '*/*',
        'Api-Key': SERVER_API_KEY,
      }),
    );
  });

  it('prefers the user api key and counts the search against it', () => {
    const searchRequest = opensubtitlesMapping.buildSearchRequest(
      episodeQuery,
      {credential: keyCredential, apiKey: SERVER_API_KEY},
    );
    expect(searchRequest.headers).toMatchObject({'Api-Key': USER_API_KEY});
    expect(searchRequest.credentialId).toBe(keyCredential.credentialId);
    expect(searchRequest.url).not.toContain(USER_API_KEY);
  });

  it('searches with the user api key when there is no server key', () => {
    const searchRequest = opensubtitlesMapping.buildSearchRequest(
      episodeQuery,
      {credential: keyCredential, apiKey: ''},
    );
    expect(searchRequest.headers).toMatchObject({'Api-Key': USER_API_KEY});
  });

  it('searches an account user with the server key and no account secret', () => {
    const searchRequest = opensubtitlesMapping.buildSearchRequest(
      episodeQuery,
      {credential: accountCredential, apiKey: SERVER_API_KEY},
    );
    expect(searchRequest.headers).toMatchObject({'Api-Key': SERVER_API_KEY});
    expect(searchRequest.credentialId).toBeNull();
    expect(JSON.stringify(searchRequest)).not.toContain(ACCOUNT_PASSWORD);
  });

  it.each([
    ['an empty server key', {credential: null, apiKey: ''}],
    ['no server key', {credential: null, apiKey: undefined}],
    ['only an account', {credential: accountCredential, apiKey: ''}],
  ])('asks nothing with %s', (_, searchOptions) => {
    expect(
      opensubtitlesMapping.buildSearchRequest(episodeQuery, searchOptions),
    ).toBeNull();
  });

  it('asks nothing for a series without an episode', () => {
    expect(
      opensubtitlesMapping.buildSearchRequest(
        makeSearchQuery({videoType: 'series', imdbId: 'tt0944947'}),
        {credential: null, apiKey: SERVER_API_KEY},
      ),
    ).toBeNull();
  });

  it('asks nothing without an imdb id', () => {
    expect(
      opensubtitlesMapping.buildSearchRequest(
        makeSearchQuery({
          videoId: 'kitsu:1:1',
          videoType: 'series',
          imdbId: null,
          kitsuId: '1',
          catalogSeason: 1,
          catalogEpisode: 1,
        }),
        {credential: null, apiKey: SERVER_API_KEY},
      ),
    ).toBeNull();
  });
});

describe('opensubtitlesMapping.toSearchHits', () => {
  it('maps a hash match, both aliases and the quota flag, and drops a CD set', async () => {
    const [hit, ...rest] = await readEpisodeHits();
    expect(hit).toEqual({
      subtitleSource: SubtitleSource.OPENSUBTITLES,
      siteFileId: '7001',
      languageCode: 'tur',
      releaseNames: ['Game.of.Thrones.S01E02.720p.HDTV.x264-CTU'],
      fileExtension: 'srt',
      isSitePack: false,
      isHearingImpaired: false,
      isForced: false,
      isMachineTranslated: false,
      isUploaderTrusted: true,
      isQuotaCostly: true,
      siteDownloadCount: 5120,
      siteFps: 23.976,
      siteFileUrl: null,
      siteCueCount: null,
      siteDurationMs: null,
      hashMatchVideoHashes: [VIDEO_HASH],
      subtitleAliases: [
        {aliasSource: 'opensubtitles-legacy', aliasSiteFileId: '123456'},
        {aliasSource: 'opensubtitles-v3', aliasSiteFileId: '123456'},
      ],
    });
    expect(rest.some(other => other.siteFileId === '7002')).toBe(false);
    expect(rest.some(other => other.siteFileId === '7003')).toBe(false);
  });

  it('keeps the site order and drops unmapped languages and empty file lists', async () => {
    const hits = await readEpisodeHits();
    expect(hits.map(hit => [hit.siteFileId, hit.languageCode])).toEqual([
      ['7001', 'tur'],
      ['7004', 'pob'],
      ['7005', 'por'],
      ['7008', 'zho'],
    ]);
  });

  it('marks ai and machine translations as machine-made', async () => {
    const hits = await readEpisodeHits();
    expect(findHit(hits, '7004').isMachineTranslated).toBe(true);
    expect(findHit(hits, '7005').isMachineTranslated).toBe(true);
    expect(findHit(hits, '7008').isMachineTranslated).toBe(false);
  });

  it('reads hearing-impaired, foreign-parts-only and trust flags', async () => {
    const hits = await readEpisodeHits();
    expect(findHit(hits, '7004')).toMatchObject({
      isHearingImpaired: true,
      isForced: false,
      isUploaderTrusted: false,
      siteDownloadCount: 40,
    });
    expect(findHit(hits, '7005').isForced).toBe(true);
  });

  it('reads an fps of zero as unknown', async () => {
    const hits = await readEpisodeHits();
    expect(findHit(hits, '7004').siteFps).toBeNull();
  });

  it('reads ass and ssa file names as ass and every other as srt', async () => {
    const hits = await readEpisodeHits();
    expect(findHit(hits, '7001').fileExtension).toBe('srt');
    expect(findHit(hits, '7004').fileExtension).toBe('ass');
    expect(findHit(hits, '7005').fileExtension).toBe('ass');
    expect(findHit(hits, '7008').fileExtension).toBe('srt');
  });

  it('names a hit by its release and its file name without the extension', async () => {
    const hits = await readEpisodeHits();
    expect(findHit(hits, '7004').releaseNames).toEqual([
      'Game.of.Thrones.S01E02.1080p.WEB-GROUP',
      'Game.of.Thrones.S01E02.1080p.WEB',
    ]);
    expect(findHit(hits, '7005').releaseNames).toEqual([
      'Game.of.Thrones.S01E02',
    ]);
  });

  it('keeps a dotted file name without a subtitle extension whole', async () => {
    const hits = await readEpisodeHits();
    expect(findHit(hits, '7008').releaseNames).toEqual([
      'S01E02',
      'Game of Thrones S01E02 (VO+STFR.EN)_track4_chi',
    ]);
  });

  it('gives no aliases without a legacy id and no hash match without one', async () => {
    const hits = await readEpisodeHits();
    expect(findHit(hits, '7004')).toMatchObject({
      subtitleAliases: [],
      hashMatchVideoHashes: [],
    });
  });

  it('claims no hash match when the query had no video hash', async () => {
    const hits = await readEpisodeHits({...episodeQuery, videoHash: null});
    expect(findHit(hits, '7001').hashMatchVideoHashes).toEqual([]);
  });

  it('gives hits that pass the hit schema', async () => {
    const hits = await readEpisodeHits();
    expect(hits).not.toHaveLength(0);
    for (const hit of hits) {
      expect(subtitleSourceHitSchema.safeParse(hit).success).toBe(true);
    }
  });

  it('drops a malformed item rather than failing', async () => {
    const firstItem = await readSubtitleItem('9300001');
    const firstFile = firstItem.attributes.files[0];
    const hits = mapItems([
      null,
      {id: '1'},
      {...firstItem, attributes: {...firstItem.attributes, files: null}},
      {
        ...firstItem,
        attributes: {
          ...firstItem.attributes,
          files: [{...firstFile, file_id: null}],
        },
      },
      {...firstItem, attributes: {...firstItem.attributes, language: 42}},
      {
        ...firstItem,
        attributes: {
          ...firstItem.attributes,
          files: [{...firstFile, file_id: 9}],
        },
      },
    ]);
    expect(hits.map(hit => hit.siteFileId)).toEqual(['9']);
  });

  it.each([
    ['an object', {data: {id: '1'}}],
    ['no list', {data: null}],
    ['a text body', 'Not found.'],
  ])('reads %s in place of the item list as no hits', (_, body) => {
    expect(
      opensubtitlesMapping.toSearchHits(
        {status: StatusCodes.OK, headers: {}, body},
        episodeQuery,
      ),
    ).toEqual([]);
  });

  it('reads an unknown title as no hits', () => {
    expect(
      opensubtitlesMapping.toSearchHits(
        {status: StatusCodes.NOT_FOUND, headers: {}, body: null},
        episodeQuery,
      ),
    ).toEqual([]);
  });
});

describe('opensubtitlesMapping.buildLoginRequest', () => {
  it('posts the account to the login route with the server key', () => {
    const loginRequest = opensubtitlesMapping.buildLoginRequest(
      accountCredential,
      {apiKey: SERVER_API_KEY},
    );
    expect(loginRequest).toMatchObject({
      subtitleSource: SubtitleSource.OPENSUBTITLES,
      url: `${API_URL}/login`,
      method: 'POST',
      body: {username: 'fixture-user', password: ACCOUNT_PASSWORD},
      responseType: 'json',
      acceptedStatuses: [StatusCodes.FORBIDDEN],
      credentialId: accountCredential.credentialId,
    });
    expect(loginRequest.headers).toMatchObject({'Api-Key': SERVER_API_KEY});
    expect(loginRequest.url).not.toContain(ACCOUNT_PASSWORD);
    expect(JSON.stringify(loginRequest.headers)).not.toContain(
      ACCOUNT_PASSWORD,
    );
  });
});

describe('opensubtitlesMapping.toSession', () => {
  it('reads the token and the base url the login returned', async () => {
    expect(
      opensubtitlesMapping.toSession({
        status: StatusCodes.OK,
        headers: {},
        body: await readOpensubtitlesFixture('login.json'),
      }),
    ).toEqual({token: 'fixture-opensubtitles-token', baseUrl: VIP_API_URL});
  });

  it('keeps the default host for a plain account', async () => {
    const loginBody = await readOpensubtitlesFixture('login.json');
    expect(
      opensubtitlesMapping.toSession({
        status: StatusCodes.OK,
        headers: {},
        body: {...loginBody, base_url: 'api.opensubtitles.com'},
      }).baseUrl,
    ).toBe(API_URL);
  });

  it.each([
    ['a private host', 'localhost'],
    ['a host with a path', 'example.com/steal?'],
    ['a host with a user', 'user@example.com'],
    ['a host outside the site', 'example.com'],
    ['a look-alike host', 'opensubtitles.com.example.com'],
  ])('refuses a base url naming %s', async (_, baseUrl) => {
    const loginBody = await readOpensubtitlesFixture('login.json');
    const error = catchError(() =>
      opensubtitlesMapping.toSession({
        status: StatusCodes.OK,
        headers: {},
        body: {...loginBody, base_url: baseUrl},
      }),
    );
    expect(error).toBeInstanceOf(SourceUnavailableError);
  });

  it('keeps the default host when the login names none', async () => {
    const {base_url: _, ...loginBody} =
      await readOpensubtitlesFixture('login.json');
    expect(
      opensubtitlesMapping.toSession({
        status: StatusCodes.OK,
        headers: {},
        body: loginBody,
      }).baseUrl,
    ).toBe(API_URL);
  });

  it('reads a login without a token as an unavailable source', async () => {
    const loginBody = await readOpensubtitlesFixture('login.json');
    const error = catchError(() =>
      opensubtitlesMapping.toSession({
        status: StatusCodes.OK,
        headers: {},
        body: {...loginBody, token: ''},
      }),
    );
    expect(error).toBeInstanceOf(SourceUnavailableError);
  });

  it('reads a rejected login as a rejected credential', () => {
    const error = catchError(() =>
      opensubtitlesMapping.toSession(
        {status: StatusCodes.UNAUTHORIZED, headers: {}, body: null},
        {credentialId: accountCredential.credentialId},
      ),
    );
    expect(error).toBeInstanceOf(SourceCredentialError);
    expect(error.credentialId).toBe(accountCredential.credentialId);
  });

  it('reads a login refused for the server key as an unavailable source', () => {
    const error = catchError(() =>
      opensubtitlesMapping.toSession(
        {
          status: StatusCodes.FORBIDDEN,
          headers: {},
          body: {message: 'You cannot consume this service'},
        },
        {credentialId: accountCredential.credentialId},
      ),
    );
    expect(error).toBeInstanceOf(SourceUnavailableError);
    expect(error.credentialId).toBeUndefined();
  });
});

describe('opensubtitlesMapping.requireApiKey', () => {
  it('passes a server key', () => {
    expect(opensubtitlesMapping.requireApiKey(SERVER_API_KEY)).toBe(
      SERVER_API_KEY,
    );
  });

  it.each(['', undefined])(
    'reads a missing server key %j as an unavailable source',
    apiKey => {
      const error = catchError(() =>
        opensubtitlesMapping.requireApiKey(apiKey),
      );
      expect(error).toBeInstanceOf(SourceUnavailableError);
      expect(error.credentialId).toBeUndefined();
    },
  );
});

describe('opensubtitlesMapping.requireAccountCredential', () => {
  it('passes an account', () => {
    expect(
      opensubtitlesMapping.requireAccountCredential(accountCredential),
    ).toBe(accountCredential);
  });

  it.each([
    ['an api key', keyCredential],
    ['no credential', null],
  ])('rejects %s for a download', (_, credential) => {
    const error = catchError(() =>
      opensubtitlesMapping.requireAccountCredential(credential),
    );
    expect(error).toBeInstanceOf(SourceCredentialError);
    expect(error.subtitleSource).toBe(SubtitleSource.OPENSUBTITLES);
    expect(error.credentialId).toBeNull();
    expect(toErrorText(error)).not.toContain(USER_API_KEY);
  });
});

describe('opensubtitlesMapping.buildDownloadRequest', () => {
  it('posts the numeric file id to the session host with key and token', () => {
    const downloadRequest = opensubtitlesMapping.buildDownloadRequest(
      subtitleRef,
      {credential: accountCredential, apiKey: SERVER_API_KEY, session},
    );
    expect(downloadRequest).toMatchObject({
      subtitleSource: SubtitleSource.OPENSUBTITLES,
      url: `${VIP_API_URL}/download`,
      method: 'POST',
      body: {file_id: 7001},
      responseType: 'json',
      acceptedStatuses: [
        StatusCodes.FORBIDDEN,
        StatusCodes.NOT_ACCEPTABLE,
        StatusCodes.INTERNAL_SERVER_ERROR,
      ],
      credentialId: accountCredential.credentialId,
    });
    expect(downloadRequest.headers).toMatchObject({
      'Api-Key': SERVER_API_KEY,
      Authorization: 'Bearer fixture-opensubtitles-token',
    });
    expect(downloadRequest.url).not.toContain(session.token);
  });
});

describe('opensubtitlesMapping.toDownloadLink', () => {
  beforeEach(() => {
    vi.useFakeTimers({now: Date.parse('2026-11-18T12:00:00.000Z')});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads the link, the file name and the quota a download reports', async () => {
    const downloadBody = await readOpensubtitlesFixture('download.json');
    expect(
      opensubtitlesMapping.toDownloadLink(
        {status: StatusCodes.OK, headers: {}, body: downloadBody},
        {credentialId: accountCredential.credentialId},
      ),
    ).toEqual({
      fileUrl: downloadBody.link,
      fileNameHint: 'Game.of.Thrones.S01E02.720p.HDTV.x264-CTU.srt',
      quotaRemainingCount: 17,
      quotaResetAt: '2026-11-19T00:00:00.000Z',
    });
  });

  it('turns a 406 quota answer into a credential-scoped rate-limit error', () => {
    const error = catchError(() =>
      opensubtitlesMapping.toDownloadLink(
        {
          status: StatusCodes.NOT_ACCEPTABLE,
          headers: {},
          body: {
            requests: 21,
            remaining: -1,
            message: 'You have downloaded your allowed 20 subtitles for 24h.',
            reset_time: '6 hours and 0 minutes',
            reset_time_utc: '2026-11-18T18:00:00.000Z',
          },
        },
        {credentialId: accountCredential.credentialId},
      ),
    );
    expect(error).toBeInstanceOf(SourceRateLimitError);
    expect(error).toMatchObject({
      subtitleSource: SubtitleSource.OPENSUBTITLES,
      credentialId: accountCredential.credentialId,
      retryAfterMs: 21600000,
    });
  });

  it.each([
    ['a reset time already past', '2026-11-18T11:00:00.000Z', 0],
    ['a reset time past the cap', '2027-11-18T12:00:00.000Z', 86400000],
    ['no readable reset time', 'soon', 60000],
  ])('waits a bounded time for %s', (_, resetTimeUtc, retryAfterMs) => {
    const error = catchError(() =>
      opensubtitlesMapping.toDownloadLink(
        {
          status: StatusCodes.NOT_ACCEPTABLE,
          headers: {},
          body: {remaining: -1, reset_time_utc: resetTimeUtc},
        },
        {credentialId: accountCredential.credentialId},
      ),
    );
    expect(error).toBeInstanceOf(SourceRateLimitError);
    expect(error.retryAfterMs).toBe(retryAfterMs);
  });

  it('reads a 406 for an expired token as a rejected credential', () => {
    const error = catchError(() =>
      opensubtitlesMapping.toDownloadLink(
        {
          status: StatusCodes.NOT_ACCEPTABLE,
          headers: {},
          body: {message: 'invalid token'},
        },
        {credentialId: accountCredential.credentialId},
      ),
    );
    expect(error).toBeInstanceOf(SourceCredentialError);
    expect(error.credentialId).toBe(accountCredential.credentialId);
  });

  it.each([
    ['a private host', 'https://127.0.0.1/download/a.srt'],
    ['a non-http scheme', 'file:///etc/passwd'],
    ['no link', null],
  ])('refuses a download link to %s', (_, link) => {
    const error = catchError(() =>
      opensubtitlesMapping.toDownloadLink(
        {
          status: StatusCodes.OK,
          headers: {},
          body: {link, file_name: 'a.srt', remaining: 3},
        },
        {credentialId: accountCredential.credentialId},
      ),
    );
    expect(error).toBeInstanceOf(SourceUnavailableError);
  });

  it.each([
    ['a 401', StatusCodes.UNAUTHORIZED, {message: 'Unauthorized'}],
    [
      'a 500 invalid answer',
      StatusCodes.INTERNAL_SERVER_ERROR,
      {message: 'invalid'},
    ],
  ])('reads %s as a rejected token', (_, status, body) => {
    const error = catchError(() =>
      opensubtitlesMapping.toDownloadLink(
        {status, headers: {}, body},
        {credentialId: accountCredential.credentialId},
      ),
    );
    expect(error).toBeInstanceOf(SourceCredentialError);
  });

  it.each([
    [
      'a 403 for the server key',
      StatusCodes.FORBIDDEN,
      {message: 'You cannot consume this service'},
    ],
    [
      'any other 500',
      StatusCodes.INTERNAL_SERVER_ERROR,
      {message: 'Server error'},
    ],
  ])(
    'reads %s as an unavailable source with no credential',
    (_, status, body) => {
      const error = catchError(() =>
        opensubtitlesMapping.toDownloadLink(
          {status, headers: {}, body},
          {credentialId: accountCredential.credentialId},
        ),
      );
      expect(error).toBeInstanceOf(SourceUnavailableError);
      expect(error.credentialId).toBeUndefined();
    },
  );

  it('reads a 406 for an unknown file as an unavailable source', () => {
    const error = catchError(() =>
      opensubtitlesMapping.toDownloadLink(
        {
          status: StatusCodes.NOT_ACCEPTABLE,
          headers: {},
          body: {message: 'Invalid file_id', status: 406},
        },
        {credentialId: accountCredential.credentialId},
      ),
    );
    expect(error).toBeInstanceOf(SourceUnavailableError);
  });
});

describe('opensubtitlesMapping.buildFileRequest', () => {
  it('fetches the temporary link as bytes without the key or the token', async () => {
    const downloadBody = await readOpensubtitlesFixture('download.json');
    const fileRequest = opensubtitlesMapping.buildFileRequest({
      fileUrl: downloadBody.link,
      fileNameHint: downloadBody.file_name,
      quotaRemainingCount: 17,
      quotaResetAt: downloadBody.reset_time_utc,
    });
    expect(fileRequest).toMatchObject({
      subtitleSource: SubtitleSource.OPENSUBTITLES,
      url: downloadBody.link,
      method: 'GET',
      responseType: 'bytes',
      acceptedStatuses: [],
      credentialId: null,
    });
    expect(findHeaderNames(fileRequest.headers ?? {})).not.toEqual(
      expect.arrayContaining(['api-key']),
    );
    expect(findHeaderNames(fileRequest.headers ?? {})).not.toEqual(
      expect.arrayContaining(['authorization']),
    );
  });
});

describe('opensubtitlesMapping.toDownload', () => {
  it('returns the file bytes under the file name the download reported', () => {
    const fileBytes = Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nHi\n');
    expect(
      opensubtitlesMapping.toDownload(
        {status: StatusCodes.OK, headers: {}, body: fileBytes},
        {
          fileUrl:
            'https://www.opensubtitles.com/download/FIXTURE/subfile/a.srt',
          fileNameHint: 'Game.of.Thrones.S01E02.srt',
          quotaRemainingCount: 17,
          quotaResetAt: null,
        },
      ),
    ).toEqual({
      fileBytes,
      fileNameHint: 'Game.of.Thrones.S01E02.srt',
      extractedEntryPath: null,
    });
  });
});

describe('opensubtitlesMapping.buildQuotaRequest', () => {
  it('asks the user route on the session host with key and token', () => {
    const quotaRequest = opensubtitlesMapping.buildQuotaRequest({
      credential: accountCredential,
      apiKey: SERVER_API_KEY,
      session,
    });
    expect(quotaRequest).toMatchObject({
      subtitleSource: SubtitleSource.OPENSUBTITLES,
      url: `${VIP_API_URL}/infos/user`,
      method: 'GET',
      responseType: 'json',
      acceptedStatuses: [
        StatusCodes.FORBIDDEN,
        StatusCodes.INTERNAL_SERVER_ERROR,
      ],
      credentialId: accountCredential.credentialId,
    });
    expect(quotaRequest.headers).toMatchObject({
      'Api-Key': SERVER_API_KEY,
      Authorization: 'Bearer fixture-opensubtitles-token',
    });
  });
});

describe('opensubtitlesMapping.toQuota', () => {
  it('reads a 500 invalid answer as a rejected token', () => {
    const error = catchError(() =>
      opensubtitlesMapping.toQuota(
        {
          status: StatusCodes.INTERNAL_SERVER_ERROR,
          headers: {},
          body: {message: 'invalid'},
        },
        null,
        {credentialId: accountCredential.credentialId},
      ),
    );
    expect(error).toBeInstanceOf(SourceCredentialError);
  });

  it('reads a 403 for the server key as an unavailable source', () => {
    const error = catchError(() =>
      opensubtitlesMapping.toQuota(
        {status: StatusCodes.FORBIDDEN, headers: {}, body: null},
        null,
        {credentialId: accountCredential.credentialId},
      ),
    );
    expect(error).toBeInstanceOf(SourceUnavailableError);
    expect(error.credentialId).toBeUndefined();
  });

  it('reads the counts and takes the reset time from the last download', async () => {
    expect(
      opensubtitlesMapping.toQuota(
        {
          status: StatusCodes.OK,
          headers: {},
          body: await readOpensubtitlesFixture('infos-user.json'),
        },
        {quotaResetAt: '2026-11-19T00:00:00.000Z'},
      ),
    ).toEqual({
      quotaRemainingCount: 17,
      quotaAllowedCount: 20,
      quotaResetAt: '2026-11-19T00:00:00.000Z',
    });
  });

  it('gives no reset time without a cached download', async () => {
    expect(
      opensubtitlesMapping.toQuota(
        {
          status: StatusCodes.OK,
          headers: {},
          body: await readOpensubtitlesFixture('infos-user.json'),
        },
        null,
      ).quotaResetAt,
    ).toBeNull();
  });
});

describe('opensubtitlesMapping.toAccountCheck', () => {
  it.each([
    [17, CredentialStatus.VALID],
    [0, CredentialStatus.LIMITED],
  ])(
    'reads %i downloads left as %s',
    (quotaRemainingCount, credentialStatus) => {
      const quota = {
        quotaRemainingCount,
        quotaAllowedCount: 20,
        quotaResetAt: null,
      };
      expect(opensubtitlesMapping.toAccountCheck(quota)).toEqual({
        credentialStatus,
        ...quota,
      });
    },
  );
});

describe('opensubtitlesMapping.buildFormatsRequest', () => {
  it('checks an api key on the formats route and reads its rejections itself', () => {
    const checkRequest =
      opensubtitlesMapping.buildFormatsRequest(keyCredential);
    expect(checkRequest).toMatchObject({
      subtitleSource: SubtitleSource.OPENSUBTITLES,
      url: `${API_URL}/infos/formats`,
      method: 'GET',
      credentialId: keyCredential.credentialId,
    });
    expect(checkRequest.headers).toMatchObject({'Api-Key': USER_API_KEY});
    expect(checkRequest.url).not.toContain(USER_API_KEY);
    expect([...checkRequest.acceptedStatuses].sort()).toEqual([
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
    ]);
  });
});

describe('opensubtitlesMapping.toApiKeyCheck', () => {
  it.each([
    [StatusCodes.OK, CredentialStatus.VALID],
    [StatusCodes.UNAUTHORIZED, CredentialStatus.INVALID],
    [StatusCodes.FORBIDDEN, CredentialStatus.INVALID],
  ])('reads status %i as %s', (status, credentialStatus) => {
    expect(
      opensubtitlesMapping.toApiKeyCheck({status, headers: {}, body: null}),
    ).toEqual({
      credentialStatus,
      quotaRemainingCount: null,
      quotaAllowedCount: null,
      quotaResetAt: null,
    });
  });
});
