import {strToU8, zipSync} from 'fflate';
import {StatusCodes} from 'http-status-codes';
import {describe, expect, it} from 'vitest';
import {CredentialStatus} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {subdlMapping} from '../../../src/lib/subtitle-sources/subdl/subdl-mapping.js';
import {
  subtitleSourceHitSchema,
  toSubtitleRowValues,
} from '../../../src/lib/subtitle-sources/subtitle-source-contract.js';
import {
  SourceCredentialError,
  SourceUnavailableError,
} from '../../../src/lib/subtitle-sources/subtitle-source-errors.js';
import {toSubtitleSourceStatusError} from '../../../src/lib/subtitle-sources/subtitle-source-request.js';
import {catchError, toErrorText} from '../../helpers/caught-error.js';
import {readFixture} from '../../helpers/read-fixture.js';
import {
  makeSearchQuery,
  makeSubtitleSourceCredential,
} from '../../helpers/subtitle-source-factories.js';

const API_KEY = 'fixture-subdl-key';
const SUBTITLES_FIXTURE = 'subtitle-sources/subdl/subtitles.json';
const ME_FIXTURE = 'subtitle-sources/subdl/me.json';
const SUBDL_API_ORIGIN = 'https://api.subdl.com';
const SUBDL_DOWNLOAD_ORIGIN = 'https://dl.subdl.com';
const keyCredential = makeSubtitleSourceCredential({apiKey: API_KEY});
const movieQuery = makeSearchQuery({
  imdbId: 'tt0111161',
  languageCodes: ['tur', 'eng'],
});
const episodeQuery = makeSearchQuery({
  videoId: 'tt9900001:1:3',
  videoType: 'series',
  imdbId: 'tt9900001',
  catalogSeason: 1,
  catalogEpisode: 3,
  languageCodes: ['tur', 'eng'],
});
const subtitleRef = {
  subtitleSource: SubtitleSource.SUBDL,
  siteFileId: '3197651-3213944',
  siteFileUrl: 'https://dl.subdl.com/subtitle/3197651-3213944.zip',
  catalogSeason: 1,
  catalogEpisode: 3,
};

function toOkResponse(body) {
  return {
    status: StatusCodes.OK,
    headers: {'content-type': 'application/json'},
    body,
  };
}

function readQuery(siteUrl) {
  return Object.fromEntries(new URL(siteUrl).searchParams);
}

async function readFixtureHits() {
  return subdlMapping.toSearchHits(
    toOkResponse(await readFixture(SUBTITLES_FIXTURE)),
  );
}

async function toHitsOfRows(rowOverrides) {
  const {subtitles} = await readFixture(SUBTITLES_FIXTURE);
  return subdlMapping.toSearchHits(
    toOkResponse({
      status: true,
      results: [],
      subtitles: rowOverrides.map(rowOverride =>
        rowOverride === null ? null : {...subtitles[0], ...rowOverride},
      ),
    }),
  );
}

function findHit(hits, siteFileId) {
  return hits.find(hit => hit.siteFileId === siteFileId);
}

function readAskedLanguages(languageCodes) {
  const searchRequest = subdlMapping.buildSearchRequest(
    makeSearchQuery({languageCodes}),
    keyCredential,
  );
  return searchRequest && readQuery(searchRequest.url).languages;
}

describe('subdlMapping.buildSearchRequest', () => {
  it('searches a movie by its imdb id with the key in the query', () => {
    const searchRequest = subdlMapping.buildSearchRequest(
      movieQuery,
      keyCredential,
    );
    const searchUrl = new URL(searchRequest.url);
    expect(searchUrl.origin).toBe(SUBDL_API_ORIGIN);
    expect(searchUrl.pathname).toBe('/api/v1/subtitles');
    expect(readQuery(searchRequest.url)).toEqual({
      api_key: API_KEY,
      imdb_id: 'tt0111161',
      type: 'movie',
      languages: 'TR,EN',
      subs_per_page: '30',
      releases: '1',
    });
    expect(searchRequest).toMatchObject({
      subtitleSource: SubtitleSource.SUBDL,
      method: 'GET',
      headers: {},
      responseType: 'json',
      credentialId: keyCredential.credentialId,
    });
  });

  it('searches an episode by imdb id, season and episode as a tv show', () => {
    expect(
      readQuery(
        subdlMapping.buildSearchRequest(episodeQuery, keyCredential).url,
      ),
    ).toEqual({
      api_key: API_KEY,
      imdb_id: 'tt9900001',
      type: 'tv',
      season_number: '1',
      episode_number: '3',
      languages: 'TR,EN',
      subs_per_page: '30',
      releases: '1',
    });
  });

  it('never filters by hearing impaired, season pack or followed uploaders', () => {
    const searchParams = new URL(
      subdlMapping.buildSearchRequest(episodeQuery, keyCredential).url,
    ).searchParams;
    expect(searchParams.has('hi')).toBe(false);
    expect(searchParams.has('full_season')).toBe(false);
    expect(searchParams.has('prefer_followed')).toBe(false);
  });

  it('asks brazilian portuguese by the site code BR_PT', () => {
    expect(readAskedLanguages(['pob'])).toBe('BR_PT');
    expect(readAskedLanguages(['tur', 'pob'])).toBe('TR,BR_PT');
  });

  it('asks chinese by both of its site codes', () => {
    expect(readAskedLanguages(['zho'])).toBe('ZH,ZH_BG');
  });

  it('asks only ISO 639-1 codes the site knows, never another site alias', () => {
    expect(readAskedLanguages(['spa', 'por', 'fre'])).toBe('ES,PT,FR');
  });

  it('asks nothing when no language has a site code', () => {
    expect(readAskedLanguages(['spl'])).toBeNull();
  });

  it('leaves out a season or episode the query lacks', () => {
    expect(
      readQuery(
        subdlMapping.buildSearchRequest(
          {...episodeQuery, catalogEpisode: null},
          keyCredential,
        ).url,
      ),
    ).not.toHaveProperty('episode_number');
  });

  it('asks nothing without a credential', () => {
    expect(subdlMapping.buildSearchRequest(movieQuery, null)).toBeNull();
  });

  it('asks nothing without an imdb id', () => {
    expect(
      subdlMapping.buildSearchRequest(
        makeSearchQuery({
          videoId: 'kitsu:1:1',
          videoType: 'series',
          imdbId: null,
          kitsuId: '1',
          catalogSeason: 1,
          catalogEpisode: 1,
        }),
        keyCredential,
      ),
    ).toBeNull();
  });
});

describe('subdlMapping.toSearchHits', () => {
  it('maps a subtitle row and its list-time hints', async () => {
    const hits = await readFixtureHits();
    const hit = findHit(hits, '3197651-3213944');
    expect(hit).toMatchObject({
      subtitleSource: SubtitleSource.SUBDL,
      siteFileId: '3197651-3213944',
      languageCode: 'eng',
      fileExtension: 'srt',
      isSitePack: false,
      isHearingImpaired: false,
      siteFps: 23.976,
      siteFileUrl: 'https://dl.subdl.com/subtitle/3197651-3213944.zip',
      hashMatchVideoHashes: [],
      subtitleAliases: [],
    });
    expect(hit.releaseNames).toHaveLength(2);
    expect(hit.releaseNames).toEqual(
      expect.arrayContaining([
        'Fixture.Show.S01E03.1080p.WEB-DL-GROUP',
        'Fixture.Show.S01E03.720p.WEB-DL-GROUP',
      ]),
    );
  });

  it('reads the hearing-impaired flag and keeps the release name when the list is empty', async () => {
    const hit = findHit(await readFixtureHits(), '3197652-3213945');
    expect(hit).toMatchObject({
      languageCode: 'tur',
      isHearingImpaired: true,
      releaseNames: ['Fixture.Show.S01E03.2160p.WEB-DL-OTHER'],
    });
  });

  it('reads fps from the fps field, never from the framerate code', async () => {
    const hits = await readFixtureHits();
    expect(findHit(hits, '3197652-3213945').siteFps).toBeNull();
    expect(findHit(hits, '3197653-3213946').siteFps).toBe(25);
    const [codeOnlyHit] = await toHitsOfRows([{framerate: 3, fps: null}]);
    expect(codeOnlyHit.siteFps).toBeNull();
  });

  it('reads a full season row as a site pack', async () => {
    const hit = findHit(await readFixtureHits(), '3197653-3213946');
    expect(hit).toMatchObject({
      languageCode: 'pob',
      isSitePack: true,
      releaseNames: ['Fixture.Show.S01.1080p.WEB-DL-GROUP'],
    });
  });

  it('reads the language field, BR_PT and ZH_BG included', async () => {
    const hits = await readFixtureHits();
    expect(hits.map(hit => [hit.siteFileId, hit.languageCode])).toEqual([
      ['3197651-3213944', 'eng'],
      ['3197652-3213945', 'tur'],
      ['3197653-3213946', 'pob'],
      ['3197654-3213947', 'zho'],
    ]);
  });

  it('drops a row whose language does not map, whatever its display name says', async () => {
    const hits = await readFixtureHits();
    expect(findHit(hits, '3197655-3213948')).toBeUndefined();
  });

  it('drops a bilingual row rather than naming it after its first language', async () => {
    const hits = await toHitsOfRows([
      {language: 'EN_DE'},
      {language: 'BG_EN'},
      {language: 'br_pt', url: '/subtitle/3197657-3213950.zip'},
    ]);
    expect(hits.map(hit => [hit.siteFileId, hit.languageCode])).toEqual([
      ['3197657-3213950', 'pob'],
    ]);
  });

  it('marks every hit quota costly, so only a download the user starts spends the key', async () => {
    const hits = await readFixtureHits();
    expect(hits.map(hit => hit.isQuotaCostly)).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });

  it('gives hits that pass the hit schema', async () => {
    const hits = await readFixtureHits();
    expect(hits).toHaveLength(4);
    for (const hit of hits) {
      expect(subtitleSourceHitSchema.safeParse(hit).success).toBe(true);
    }
  });

  it('stores no api key in a subtitle row', async () => {
    const hits = await readFixtureHits();
    for (const hit of hits) {
      expect(JSON.stringify(toSubtitleRowValues(hit))).not.toContain(API_KEY);
    }
  });

  it('maps a live-shaped row whose url carries the key, and keeps the key out of every hit field', async () => {
    const [hit] = await toHitsOfRows([
      {
        url: `/subtitle/3602674-8520054.zip?api_key=${API_KEY}`,
        subtitlePage: '/s/info/fixture/fixture-show',
        language: 'EN',
        lang: 'English',
        fps: '29.970',
      },
    ]);
    expect(hit).toMatchObject({
      siteFileId: '3602674-8520054',
      siteFileUrl: 'https://dl.subdl.com/subtitle/3602674-8520054.zip',
      languageCode: 'eng',
      siteFps: 29.97,
    });
    expect(JSON.stringify(hit)).not.toContain(API_KEY);
    expect(JSON.stringify(toSubtitleRowValues(hit))).not.toContain(API_KEY);
  });

  it('drops a malformed row rather than failing', async () => {
    const hits = await toHitsOfRows([
      null,
      {url: null},
      {url: 42},
      {url: '/subtitle/.zip'},
      {language: 42},
      {url: '/subtitle/3197656-3213949.zip'},
    ]);
    expect(hits.map(hit => hit.siteFileId)).toEqual(['3197656-3213949']);
  });

  it('reads a hearing-impaired flag of the wrong kind as unknown', async () => {
    const [hit] = await toHitsOfRows([{hi: 'yes'}]);
    expect(hit.isHearingImpaired).toBeNull();
  });

  it.each([
    ['no list', {status: true, results: [], subtitles: null}],
    ['an empty list', {status: true, results: [], subtitles: []}],
    ['no body', null],
  ])('reads %s as no hits', (_, body) => {
    expect(subdlMapping.toSearchHits(toOkResponse(body))).toEqual([]);
  });

  it('reads a missing route as no hits', () => {
    expect(
      subdlMapping.toSearchHits({
        status: StatusCodes.NOT_FOUND,
        headers: {},
        body: null,
      }),
    ).toEqual([]);
  });

  it('reads a failed status body as an unavailable source, without the key', () => {
    const error = catchError(() =>
      subdlMapping.toSearchHits(
        toOkResponse({
          status: false,
          error: `Invalid request for api_key=${API_KEY}.`,
        }),
      ),
    );
    expect(error).toBeInstanceOf(SourceUnavailableError);
    expect(toErrorText(error)).not.toContain(API_KEY);
  });

  it('reads a failed status body without an error text as an unavailable source', () => {
    expect(
      catchError(() =>
        subdlMapping.toSearchHits(toOkResponse({status: false})),
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });

  it("reads a failed status body that can't find the title as no hits", () => {
    expect(
      subdlMapping.toSearchHits(
        toOkResponse({status: false, error: "Can't find movie or tv"}),
      ),
    ).toEqual([]);
  });

  it('reads a typographic apostrophe in that text as no hits too', () => {
    expect(
      subdlMapping.toSearchHits(
        toOkResponse({status: false, error: 'Can’t find movie or tv'}),
      ),
    ).toEqual([]);
  });

  it("puts the upload's own release name first, ahead of a full release list", async () => {
    const releases = Array.from(
      {length: 20},
      (_, releaseIndex) => `Fixture.Show.S01E03.Other-${releaseIndex}`,
    );
    const [hit] = await toHitsOfRows([
      {release_name: 'Fixture.Show.S01E03.Own-GROUP', releases},
    ]);
    expect(hit.releaseNames[0]).toBe('Fixture.Show.S01E03.Own-GROUP');
  });
});

describe('subdlMapping.buildDownloadRequest', () => {
  it("asks the download host for the zip bytes under the user's key, sent in a header and never in the url", () => {
    const downloadRequest = subdlMapping.buildDownloadRequest(
      subtitleRef,
      keyCredential,
    );
    expect(downloadRequest).toMatchObject({
      subtitleSource: SubtitleSource.SUBDL,
      url: 'https://dl.subdl.com/subtitle/3197651-3213944.zip',
      method: 'GET',
      headers: {'x-api-key': API_KEY},
      responseType: 'bytes',
      credentialId: keyCredential.credentialId,
    });
    expect(downloadRequest.url).not.toContain(API_KEY);
  });

  it('downloads nothing without a key', () => {
    expect(
      catchError(() => subdlMapping.buildDownloadRequest(subtitleRef, null)),
    ).toBeInstanceOf(SourceUnavailableError);
  });

  it.each([
    'http://127.0.0.1/subtitle/3197651-3213944.zip',
    'https://evil.example/subtitle/3197651-3213944.zip',
    null,
  ])('never leaves the download host for a stored file url %s', siteFileUrl => {
    const downloadUrl = new URL(
      subdlMapping.buildDownloadRequest(
        {...subtitleRef, siteFileUrl},
        keyCredential,
      ).url,
    );
    expect(downloadUrl.origin).toBe(SUBDL_DOWNLOAD_ORIGIN);
    expect(downloadUrl.pathname).toBe('/subtitle/3197651-3213944.zip');
  });

  it.each(['../users', '../../api/v1/me', '1?x=1#y'])(
    'keeps the site file id %s inside the subtitle route',
    siteFileId => {
      const downloadUrl = new URL(
        subdlMapping.buildDownloadRequest(
          {...subtitleRef, siteFileId},
          keyCredential,
        ).url,
      );
      expect(downloadUrl.origin).toBe(SUBDL_DOWNLOAD_ORIGIN);
      expect(downloadUrl.search).toBe('');
      expect(downloadUrl.hash).toBe('');
      expect(downloadUrl.pathname.split('/')).toHaveLength(3);
      expect(downloadUrl.pathname.startsWith('/subtitle/')).toBe(true);
    },
  );
});

describe('subdlMapping.toDownload', () => {
  const zipBytes = zipSync({
    'Fixture.Show.S01E03.srt': strToU8(
      '1\n00:00:01,000 --> 00:00:02,000\nMerhaba\n',
    ),
  });

  it('returns the zip bytes unchanged with the file name the site gives', () => {
    expect(
      subdlMapping.toDownload({
        status: StatusCodes.OK,
        headers: {
          'content-type': 'application/zip',
          'content-disposition':
            'attachment; filename="fixture-show-3197651-3213944.zip"',
        },
        body: zipBytes,
      }),
    ).toEqual({
      fileBytes: zipBytes,
      fileNameHint: 'fixture-show-3197651-3213944.zip',
      extractedEntryPath: null,
    });
  });

  it.each([
    ['application/json; charset=utf-8', '{"status":false}'],
    ['text/html', '<html>Error</html>'],
  ])(
    'reads a %s answer in place of the zip as unavailable',
    (contentType, bodyText) => {
      expect(
        catchError(() =>
          subdlMapping.toDownload({
            status: StatusCodes.OK,
            headers: {'content-type': contentType},
            body: Buffer.from(bodyText),
          }),
        ),
      ).toBeInstanceOf(SourceUnavailableError);
    },
  );

  it('reads an unknown file as an unavailable source', () => {
    expect(
      catchError(() =>
        subdlMapping.toDownload({
          status: StatusCodes.NOT_FOUND,
          headers: {},
          body: null,
        }),
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });
});

describe('subdl credential rejection', () => {
  it('counts the search, the download and the check against the key, so a 403 names the credential and never the key', () => {
    const keyedRequests = [
      subdlMapping.buildSearchRequest(episodeQuery, keyCredential),
      subdlMapping.buildDownloadRequest(subtitleRef, keyCredential),
      subdlMapping.buildCredentialCheckRequest(keyCredential),
    ];
    for (const keyedRequest of keyedRequests) {
      const error = toSubtitleSourceStatusError(
        {status: StatusCodes.FORBIDDEN, headers: keyedRequest.headers},
        {
          subtitleSource: keyedRequest.subtitleSource,
          credentialId: keyedRequest.credentialId,
        },
      );
      expect(error).toBeInstanceOf(SourceCredentialError);
      expect(error.credentialId).toBe(keyCredential.credentialId);
      expect(toErrorText(error)).not.toContain(API_KEY);
    }
  });
});

describe('subdlMapping.buildCredentialCheckRequest', () => {
  it('asks the account route with the key and reads its rejections itself', () => {
    const checkRequest =
      subdlMapping.buildCredentialCheckRequest(keyCredential);
    const checkUrl = new URL(checkRequest.url);
    expect(checkUrl.origin).toBe(SUBDL_API_ORIGIN);
    expect(checkUrl.pathname).toBe('/api/v1/me');
    expect(readQuery(checkRequest.url)).toEqual({api_key: API_KEY});
    expect(checkRequest).toMatchObject({
      subtitleSource: SubtitleSource.SUBDL,
      method: 'GET',
      credentialId: keyCredential.credentialId,
    });
    expect(checkRequest.acceptedStatuses).toEqual(
      expect.arrayContaining([StatusCodes.UNAUTHORIZED, StatusCodes.FORBIDDEN]),
    );
  });
});

describe('subdlMapping.toCredentialCheck', () => {
  it('reads an account answer as a valid key', async () => {
    expect(
      subdlMapping.toCredentialCheck(
        toOkResponse(await readFixture(ME_FIXTURE)),
      ),
    ).toEqual({
      credentialStatus: CredentialStatus.VALID,
      quotaRemainingCount: null,
      quotaAllowedCount: null,
      quotaResetAt: null,
    });
  });

  it.each([StatusCodes.UNAUTHORIZED, StatusCodes.FORBIDDEN])(
    'reads status %i as an invalid key',
    status => {
      expect(
        subdlMapping.toCredentialCheck({
          status,
          headers: {},
          body: {status: false, error: 'Invalid API key'},
        }),
      ).toMatchObject({credentialStatus: CredentialStatus.INVALID});
    },
  );

  it('reads a missing account route as an unavailable source', () => {
    expect(
      catchError(() =>
        subdlMapping.toCredentialCheck({
          status: StatusCodes.NOT_FOUND,
          headers: {},
          body: null,
        }),
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });

  it('reads the account answer as text, the way the check asks for it', async () => {
    expect(
      subdlMapping.toCredentialCheck({
        status: StatusCodes.OK,
        headers: {'content-type': 'application/json'},
        body: JSON.stringify(await readFixture(ME_FIXTURE)),
      }),
    ).toMatchObject({credentialStatus: CredentialStatus.VALID});
  });

  it.each([
    [
      'an error envelope',
      'application/json',
      '{"status":false,"error":"Service busy"}',
    ],
    ['an HTML page', 'text/html; charset=utf-8', '<html>Challenge</html>'],
  ])(
    'leaves the key unchecked for %s in place of the account answer',
    (_, contentType, bodyText) => {
      expect(
        catchError(() =>
          subdlMapping.toCredentialCheck({
            status: StatusCodes.OK,
            headers: {'content-type': contentType},
            body: bodyText,
          }),
        ),
      ).toBeInstanceOf(SourceUnavailableError);
    },
  );
});
