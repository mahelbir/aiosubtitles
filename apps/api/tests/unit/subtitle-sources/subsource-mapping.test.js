import {strToU8, zipSync} from 'fflate';
import {StatusCodes} from 'http-status-codes';
import {describe, expect, it} from 'vitest';
import {CredentialStatus} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {subtitleSourceHitSchema} from '../../../src/lib/subtitle-sources/subtitle-source-contract.js';
import {
  SourceCredentialError,
  SourceUnavailableError,
} from '../../../src/lib/subtitle-sources/subtitle-source-errors.js';
import {
  SUBTITLE_SOURCE_BROWSER_USER_AGENT,
  toSubtitleSourceStatusError,
} from '../../../src/lib/subtitle-sources/subtitle-source-request.js';
import {subsourceMapping} from '../../../src/lib/subtitle-sources/subsource/subsource-mapping.js';
import {catchError, toErrorText} from '../../helpers/caught-error.js';
import {readFixture} from '../../helpers/read-fixture.js';
import {
  makeSearchQuery,
  makeSubtitleSourceCredential,
} from '../../helpers/subtitle-source-factories.js';

const API_KEY = 'fixture-subsource-key';
const MOVIES_SEARCH_FIXTURE = 'subtitle-sources/subsource/movies-search.json';
const SUBTITLES_FIXTURE = 'subtitle-sources/subsource/subtitles.json';
const SUBSOURCE_ORIGIN = 'https://api.subsource.net';
const MOVIE_ID = 81003;
const keyCredential = makeSubtitleSourceCredential({apiKey: API_KEY});
const keyHeaders = {
  'X-API-Key': API_KEY,
  'User-Agent': SUBTITLE_SOURCE_BROWSER_USER_AGENT,
};
const movieQuery = makeSearchQuery({
  imdbId: 'tt0111161',
  languageCodes: ['tur', 'eng'],
});
const seasonQuery = makeSearchQuery({
  videoId: 'tt9900001:1:3',
  videoType: 'series',
  imdbId: 'tt9900001',
  catalogSeason: 1,
  catalogEpisode: 3,
  languageCodes: ['tur', 'eng'],
});
const subtitleRef = {
  subtitleSource: SubtitleSource.SUBSOURCE,
  siteFileId: '9200001',
  siteFileUrl: null,
  catalogSeason: null,
  catalogEpisode: null,
};

function toOkResponse(body) {
  return {
    status: StatusCodes.OK,
    headers: {'content-type': 'application/json'},
    body,
  };
}

async function readSubtitlesBody() {
  return readFixture(SUBTITLES_FIXTURE);
}

async function readFixtureHits() {
  return subsourceMapping.toSearchHits(toOkResponse(await readSubtitlesBody()));
}

async function toHitsOfItems(itemOverrides) {
  const [firstItem] = (await readSubtitlesBody()).data;
  return subsourceMapping.toSearchHits(
    toOkResponse({
      success: true,
      data: itemOverrides.map(itemOverride =>
        itemOverride === null ? null : {...firstItem, ...itemOverride},
      ),
    }),
  );
}

function findHit(hits, siteFileId) {
  return hits.find(hit => hit.siteFileId === siteFileId);
}

function readQuery(siteUrl) {
  return Object.fromEntries(new URL(siteUrl).searchParams);
}

function listAskedLanguageWords(languageCodes) {
  return subsourceMapping
    .buildSubtitlesRequests(
      MOVIE_ID,
      makeSearchQuery({languageCodes}),
      keyCredential,
    )
    .map(subtitlesRequest => readQuery(subtitlesRequest.url).language);
}

describe('subsourceMapping.buildMovieSearchRequest', () => {
  it('looks a movie up by its imdb id with the key', () => {
    const searchRequest = subsourceMapping.buildMovieSearchRequest(
      movieQuery,
      keyCredential,
    );
    const searchUrl = new URL(searchRequest.url);
    expect(searchUrl.origin).toBe(SUBSOURCE_ORIGIN);
    expect(searchUrl.pathname).toBe('/api/v1/movies/search');
    expect(readQuery(searchRequest.url)).toEqual({
      searchType: 'imdb',
      imdb: 'tt0111161',
    });
    expect(searchRequest).toMatchObject({
      subtitleSource: SubtitleSource.SUBSOURCE,
      method: 'GET',
      responseType: 'json',
      acceptedStatuses: [],
      credentialId: keyCredential.credentialId,
    });
  });

  it('looks a series up by its imdb id and the asked season', () => {
    const searchRequest = subsourceMapping.buildMovieSearchRequest(
      seasonQuery,
      keyCredential,
    );
    expect(readQuery(searchRequest.url)).toEqual({
      searchType: 'imdb',
      imdb: 'tt9900001',
      season: '1',
    });
  });

  it('sends the key in X-API-Key with the browser User-Agent, never in the url', () => {
    const searchRequest = subsourceMapping.buildMovieSearchRequest(
      seasonQuery,
      keyCredential,
    );
    expect(searchRequest.headers).toEqual(keyHeaders);
    expect(searchRequest.url).not.toContain(API_KEY);
  });

  it('asks nothing without a credential', () => {
    expect(
      subsourceMapping.buildMovieSearchRequest(movieQuery, null),
    ).toBeNull();
  });

  it('asks nothing when no user language has a site word', () => {
    expect(
      subsourceMapping.buildMovieSearchRequest(
        {...movieQuery, languageCodes: ['aar', 'yor']},
        keyCredential,
      ),
    ).toBeNull();
  });

  it('asks nothing without an imdb id', () => {
    expect(
      subsourceMapping.buildMovieSearchRequest(
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

  it('asks nothing for a series query without its season', () => {
    expect(
      subsourceMapping.buildMovieSearchRequest(
        {...seasonQuery, catalogSeason: null},
        keyCredential,
      ),
    ).toBeNull();
  });
});

describe('subsourceMapping.findMovieId', () => {
  it('keeps the item of the asked imdb id and season 1 only', async () => {
    const moviesBody = await readFixture(MOVIES_SEARCH_FIXTURE);
    expect(
      subsourceMapping.findMovieId(toOkResponse(moviesBody), seasonQuery),
    ).toBe(81003);
  });

  it('keeps the item of season 2 for a season 2 query', async () => {
    const moviesBody = await readFixture(MOVIES_SEARCH_FIXTURE);
    expect(
      subsourceMapping.findMovieId(toOkResponse(moviesBody), {
        ...seasonQuery,
        catalogSeason: 2,
      }),
    ).toBe(81002);
  });

  it('keeps the movie item whose imdb id matches, not the first one', () => {
    expect(
      subsourceMapping.findMovieId(
        toOkResponse({
          success: true,
          data: [
            {movieId: 5001, imdbId: 'tt0000001', season: null},
            {movieId: 5002, imdbId: 'tt0111161', season: null},
          ],
        }),
        movieQuery,
      ),
    ).toBe(5002);
  });

  it('finds nothing for a season the site does not list', async () => {
    const moviesBody = await readFixture(MOVIES_SEARCH_FIXTURE);
    expect(
      subsourceMapping.findMovieId(toOkResponse(moviesBody), {
        ...seasonQuery,
        catalogSeason: 3,
      }),
    ).toBeNull();
  });

  it.each([
    ['an empty list', {success: true, data: []}],
    [
      'an item without a movie id',
      {success: true, data: [{imdbId: 'tt0111161', season: null}]},
    ],
  ])('finds nothing in %s', (_, body) => {
    expect(
      subsourceMapping.findMovieId(toOkResponse(body), movieQuery),
    ).toBeNull();
  });

  it.each([
    ['an object', {success: true, data: {movieId: 5002}}],
    ['no body', null],
    ['a text body', 'Not found.'],
  ])(
    'reads %s in place of the movie list as an unavailable source',
    (_, body) => {
      expect(
        catchError(() =>
          subsourceMapping.findMovieId(toOkResponse(body), movieQuery),
        ),
      ).toBeInstanceOf(SourceUnavailableError);
    },
  );
});

describe('subsourceMapping.buildSubtitlesRequests', () => {
  it('asks the found title once per language: turkish and english', () => {
    const subtitlesRequests = subsourceMapping.buildSubtitlesRequests(
      MOVIE_ID,
      seasonQuery,
      keyCredential,
    );
    expect(subtitlesRequests).toHaveLength(2);
    for (const subtitlesRequest of subtitlesRequests) {
      const subtitlesUrl = new URL(subtitlesRequest.url);
      expect(subtitlesUrl.origin).toBe(SUBSOURCE_ORIGIN);
      expect(subtitlesUrl.pathname).toBe('/api/v1/subtitles');
      expect(subtitlesRequest.url).not.toContain(API_KEY);
      expect(subtitlesRequest).toMatchObject({
        subtitleSource: SubtitleSource.SUBSOURCE,
        method: 'GET',
        headers: keyHeaders,
        responseType: 'json',
        acceptedStatuses: [],
        credentialId: keyCredential.credentialId,
      });
    }
    expect(
      subtitlesRequests.map(subtitlesRequest =>
        readQuery(subtitlesRequest.url),
      ),
    ).toEqual([
      {movieId: '81003', language: 'turkish', limit: '100', sort: 'popular'},
      {movieId: '81003', language: 'english', limit: '100', sort: 'popular'},
    ]);
  });

  it.each([
    ['pob', 'brazilian_portuguese,brazillian_portuguese'],
    ['spl', 'spanish_latin_america'],
    ['fas', 'farsi_persian'],
    ['spa', 'spanish,spanish_spain'],
    ['khm', 'khmer'],
    ['heb', 'hebrew'],
  ])('asks %s by the site words %s', (languageCode, languageWords) => {
    expect(listAskedLanguageWords([languageCode])).toEqual([languageWords]);
  });

  it('asks the regional languages each by their own words', () => {
    expect(listAskedLanguageWords(['pob', 'spl', 'fas'])).toEqual([
      'brazilian_portuguese,brazillian_portuguese',
      'spanish_latin_america',
      'farsi_persian',
    ]);
  });

  it('skips a language the site has no word for', () => {
    expect(listAskedLanguageWords(['aar', 'tur'])).toEqual(['turkish']);
    expect(listAskedLanguageWords(['aar'])).toEqual([]);
  });
});

describe('subsourceMapping.toSearchHits', () => {
  it('maps a subtitle item and its list-time hints', async () => {
    const hits = await readFixtureHits();
    expect(findHit(hits, '9200001')).toMatchObject({
      subtitleSource: SubtitleSource.SUBSOURCE,
      siteFileId: '9200001',
      languageCode: 'tur',
      releaseNames: [
        'Fixture.Show.S01E01.1080p.WEB-DL-GROUP',
        'Fixture.Show.S01E01.720p.WEB-DL-GROUP',
      ],
      fileExtension: 'srt',
      isHearingImpaired: false,
      isForced: false,
      isMachineTranslated: null,
      siteDownloadCount: 150,
      siteFps: 23.976,
      siteFileUrl: null,
    });
  });

  it('reads hearing-impaired, foreign parts and an AI production as flags', async () => {
    const hits = await readFixtureHits();
    expect(findHit(hits, '9200002')).toMatchObject({
      languageCode: 'eng',
      isHearingImpaired: true,
      isForced: true,
      isMachineTranslated: true,
      siteDownloadCount: 0,
      siteFps: 25,
    });
  });

  it('reads a frame rate the site leaves open as unknown', async () => {
    const hits = await readFixtureHits();
    expect(findHit(hits, '9200003')).toMatchObject({
      siteFps: null,
      releaseNames: [],
    });
  });

  it.each([
    ['AI / Machine Translated', true],
    ['machine translated', true],
    ['translated', null],
    ['Translated a Subtitle', null],
    ['ai_machine_translated', true],
    ['machine_translated', true],
    ['ai-translated', true],
    ['retail', null],
    ['from_retail', null],
    ['From Retail', null],
    ['detail_aide', null],
    ['Improved a Subtitle', null],
    [null, null],
  ])(
    'reads production type %s as machine translated %s',
    async (productionType, isMachineTranslated) => {
      const [hit] = await toHitsOfItems([{productionType}]);
      expect(hit.isMachineTranslated).toBe(isMachineTranslated);
    },
  );

  it('reads flags, counts and release names of the wrong kind as unknown', async () => {
    const [hit] = await toHitsOfItems([
      {
        hearingImpaired: 'yes',
        foreignParts: 1,
        downloads: -3,
        framerate: null,
        releaseInfo: 'Fixture.Show.S01E01.1080p.WEB-DL-GROUP',
      },
    ]);
    expect(hit).toMatchObject({
      isHearingImpaired: null,
      isForced: null,
      siteDownloadCount: null,
      siteFps: null,
      releaseNames: [],
    });
  });

  it('drops an item whose language does not map', async () => {
    const hits = await readFixtureHits();
    expect(findHit(hits, '9200004')).toBeUndefined();
    expect(hits.map(hit => hit.siteFileId)).toEqual([
      '9200001',
      '9200002',
      '9200003',
    ]);
  });

  it('reads the site words of regional languages back to their codes', async () => {
    const hits = await toHitsOfItems([
      {subtitleId: 1, language: 'brazillian_portuguese'},
      {subtitleId: 2, language: 'spanish_latin_america'},
      {subtitleId: 3, language: 'farsi_persian'},
      {subtitleId: 4, language: 'spanish'},
      {subtitleId: 5, language: 'turkish'},
      {subtitleId: 6, language: 'english'},
      {subtitleId: 7, language: 'khmer'},
      {subtitleId: 8, language: 'hebrew'},
    ]);
    expect(hits.map(hit => [hit.siteFileId, hit.languageCode])).toEqual([
      ['1', 'pob'],
      ['2', 'spl'],
      ['3', 'fas'],
      ['4', 'spa'],
      ['5', 'tur'],
      ['6', 'eng'],
      ['7', 'khm'],
      ['8', 'heb'],
    ]);
  });

  it('reads every site word of one language back to that language', async () => {
    const hits = await toHitsOfItems([
      {subtitleId: 1, language: 'spanish_spain'},
      {subtitleId: 2, language: 'chinese_traditional'},
      {subtitleId: 3, language: 'dari'},
      {subtitleId: 4, language: 'big_5_code'},
      {subtitleId: 5, language: 'gaelician'},
      {subtitleId: 6, language: 'brazilian_portuguese'},
      {subtitleId: 7, language: 'brazillian_portuguese'},
    ]);
    expect(hits.map(hit => [hit.siteFileId, hit.languageCode])).toEqual([
      ['1', 'spa'],
      ['2', 'zho'],
      ['4', 'zho'],
      ['5', 'glg'],
      ['6', 'pob'],
      ['7', 'pob'],
    ]);
  });

  it('reads a site word given in its label form', async () => {
    const hits = await toHitsOfItems([
      {subtitleId: 1, language: 'Chinese (Traditional)'},
      {subtitleId: 2, language: 'brazillian portuguese'},
      {subtitleId: 3, language: 'Farsi/Persian'},
      {subtitleId: 4, language: 'big 5 code'},
      {subtitleId: 5, language: ' Northen Sami '},
    ]);
    expect(hits.map(hit => [hit.siteFileId, hit.languageCode])).toEqual([
      ['1', 'zho'],
      ['2', 'pob'],
      ['3', 'fas'],
      ['4', 'zho'],
      ['5', 'sme'],
    ]);
  });

  it('asks a language of several site words by all of them in one request', () => {
    expect(listAskedLanguageWords(['spa', 'zho', 'fre'])).toEqual([
      'spanish,spanish_spain',
      'chinese,chinese_simplified,chinese_traditional,chinese_bg_code,big_5_code',
      'french,french_france,french_canada',
    ]);
  });

  it('never asks Cantonese or bilingual Chinese, which have no language here', async () => {
    expect(listAskedLanguageWords(['zho'])[0].split(',')).not.toEqual(
      expect.arrayContaining(['chinese_cantonese']),
    );
    expect(listAskedLanguageWords(['zho'])[0].split(',')).not.toEqual(
      expect.arrayContaining(['chinese_bilingual']),
    );
    const hits = await toHitsOfItems([
      {subtitleId: 1, language: 'chinese_cantonese'},
      {subtitleId: 2, language: 'Chinese Bilingual'},
    ]);
    expect(hits).toEqual([]);
  });

  it('never takes a url the site gives, even a private one', async () => {
    const hits = await toHitsOfItems([
      {
        subtitleId: 1,
        link: 'http://127.0.0.1/subtitle/fixture/english/1',
        downloadUrl: 'http://localhost/download/1.zip',
        url: 'http://10.0.0.5/1.zip',
      },
    ]);
    expect(hits).toHaveLength(1);
    expect(hits[0].siteFileUrl).toBeNull();
  });

  it('gives hits that pass the hit schema', async () => {
    const hits = await readFixtureHits();
    expect(hits).toHaveLength(3);
    for (const hit of hits) {
      expect(subtitleSourceHitSchema.safeParse(hit).success).toBe(true);
    }
  });

  it('drops a malformed item rather than failing', async () => {
    const hits = await toHitsOfItems([
      null,
      {subtitleId: undefined},
      {subtitleId: 0},
      {subtitleId: 7, language: 42},
      {subtitleId: 8},
    ]);
    expect(hits.map(hit => hit.siteFileId)).toEqual(['8']);
  });

  it.each([
    ['an object', {success: true, data: {subtitleId: 1}}],
    ['no list', {success: true, data: null}],
    ['a text body', 'Not found.'],
    ['no body', null],
  ])(
    'reads %s in place of the item list as an unavailable source',
    (_, body) => {
      expect(
        catchError(() => subsourceMapping.toSearchHits(toOkResponse(body))),
      ).toBeInstanceOf(SourceUnavailableError);
    },
  );

  it('reads an empty item list as no hits', () => {
    expect(
      subsourceMapping.toSearchHits(toOkResponse({success: true, data: []})),
    ).toEqual([]);
  });

  it('reads a movie the site does not know (404) as no hits', () => {
    expect(
      subsourceMapping.toSearchHits({
        status: StatusCodes.NOT_FOUND,
        headers: {},
        body: null,
      }),
    ).toEqual([]);
  });
});

describe('subsourceMapping.buildDownloadRequest', () => {
  it('asks the download route for bytes with the key', () => {
    const downloadRequest = subsourceMapping.buildDownloadRequest(
      subtitleRef,
      keyCredential,
    );
    expect(downloadRequest).toEqual(
      expect.objectContaining({
        subtitleSource: SubtitleSource.SUBSOURCE,
        url: `${SUBSOURCE_ORIGIN}/api/v1/subtitles/9200001/download`,
        method: 'GET',
        headers: keyHeaders,
        responseType: 'bytes',
        acceptedStatuses: [],
        credentialId: keyCredential.credentialId,
      }),
    );
    expect(downloadRequest.url).not.toContain(API_KEY);
  });

  it('sends no key and names no credential without one', () => {
    const downloadRequest = subsourceMapping.buildDownloadRequest(
      subtitleRef,
      null,
    );
    expect(downloadRequest.headers).toEqual({
      'User-Agent': SUBTITLE_SOURCE_BROWSER_USER_AGENT,
    });
    expect(downloadRequest.credentialId).toBeNull();
  });

  it('ignores a file url on the ref, even a private one', () => {
    const downloadRequest = subsourceMapping.buildDownloadRequest(
      {...subtitleRef, siteFileUrl: 'http://127.0.0.1/evil.zip'},
      keyCredential,
    );
    expect(downloadRequest.url).toBe(
      `${SUBSOURCE_ORIGIN}/api/v1/subtitles/9200001/download`,
    );
  });

  it.each(['../users', '../../users/1', 'http://127.0.0.1/x', '1?x=1#y'])(
    'keeps the site file id %s inside the download route',
    siteFileId => {
      const downloadUrl = new URL(
        subsourceMapping.buildDownloadRequest(
          {...subtitleRef, siteFileId},
          keyCredential,
        ).url,
      );
      const pathSegments = downloadUrl.pathname.split('/');
      expect(downloadUrl.origin).toBe(SUBSOURCE_ORIGIN);
      expect(downloadUrl.search).toBe('');
      expect(downloadUrl.hash).toBe('');
      expect(pathSegments).toHaveLength(6);
      expect(pathSegments.slice(0, 4)).toEqual(['', 'api', 'v1', 'subtitles']);
      expect(pathSegments[5]).toBe('download');
    },
  );

  it.each(['.', '..'])(
    'refuses the dot segment %s as a site file id',
    siteFileId => {
      const error = catchError(() =>
        subsourceMapping.buildDownloadRequest(
          {...subtitleRef, siteFileId},
          keyCredential,
        ),
      );
      expect(error).toBeInstanceOf(SourceUnavailableError);
      expect(toErrorText(error)).not.toContain(API_KEY);
    },
  );
});

describe('subsourceMapping.toDownload', () => {
  const zipBytes = zipSync({
    'Fixture.Show.S01E01.srt': strToU8(
      '1\n00:00:01,000 --> 00:00:02,000\nMerhaba\n',
    ),
  });

  it('returns the zip bytes unchanged and the file name the site gives', () => {
    const download = subsourceMapping.toDownload({
      status: StatusCodes.OK,
      headers: {
        'content-type': 'application/zip',
        'content-disposition':
          'attachment; filename="fixture_show_tr_9200001-[SubSource].zip"',
      },
      body: zipBytes,
    });
    expect(download.fileBytes).toBe(zipBytes);
    expect(download).toEqual({
      fileBytes: zipBytes,
      fileNameHint: 'fixture_show_tr_9200001-[SubSource].zip',
      extractedEntryPath: null,
    });
  });

  it.each([
    ['application/json; charset=utf-8', '{"success":false}'],
    ['text/html', '<html>Error</html>'],
  ])(
    'reads a %s answer in place of the zip as unavailable',
    (contentType, bodyText) => {
      expect(
        catchError(() =>
          subsourceMapping.toDownload({
            status: StatusCodes.OK,
            headers: {'content-type': contentType},
            body: Buffer.from(bodyText),
          }),
        ),
      ).toBeInstanceOf(SourceUnavailableError);
    },
  );

  it('reads an unknown file id as an unavailable source without the key', () => {
    const downloadRequest = subsourceMapping.buildDownloadRequest(
      subtitleRef,
      keyCredential,
    );
    const error = catchError(() =>
      subsourceMapping.toDownload({
        status: StatusCodes.NOT_FOUND,
        headers: downloadRequest.headers,
        body: null,
      }),
    );
    expect(error).toBeInstanceOf(SourceUnavailableError);
    expect(toErrorText(error)).not.toContain(API_KEY);
  });
});

describe('subsource credential rejection', () => {
  it('counts every call against the key, so a 401 names the credential and never the key', () => {
    const searchRequests = [
      subsourceMapping.buildMovieSearchRequest(seasonQuery, keyCredential),
      ...subsourceMapping.buildSubtitlesRequests(
        MOVIE_ID,
        seasonQuery,
        keyCredential,
      ),
      subsourceMapping.buildDownloadRequest(subtitleRef, keyCredential),
    ];
    for (const searchRequest of searchRequests) {
      expect(searchRequest.acceptedStatuses).not.toContain(
        StatusCodes.UNAUTHORIZED,
      );
      const error = toSubtitleSourceStatusError(
        {status: StatusCodes.UNAUTHORIZED, headers: searchRequest.headers},
        {
          subtitleSource: searchRequest.subtitleSource,
          credentialId: searchRequest.credentialId,
        },
      );
      expect(error).toBeInstanceOf(SourceCredentialError);
      expect(error.credentialId).toBe(keyCredential.credentialId);
      expect(toErrorText(error)).not.toContain(API_KEY);
    }
  });
});

describe('subsourceMapping.buildCredentialCheckRequest', () => {
  it('runs one text search with the key and reads its rejections itself', () => {
    const checkRequest =
      subsourceMapping.buildCredentialCheckRequest(keyCredential);
    const checkUrl = new URL(checkRequest.url);
    expect(checkUrl.origin).toBe(SUBSOURCE_ORIGIN);
    expect(checkUrl.pathname).toBe('/api/v1/movies/search');
    expect(readQuery(checkRequest.url)).toEqual({
      searchType: 'text',
      q: 'matrix',
    });
    expect(checkRequest.url).not.toContain(API_KEY);
    expect(checkRequest).toMatchObject({
      subtitleSource: SubtitleSource.SUBSOURCE,
      method: 'GET',
      headers: keyHeaders,
      credentialId: keyCredential.credentialId,
    });
    expect([...checkRequest.acceptedStatuses].sort()).toEqual([
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.TOO_MANY_REQUESTS,
    ]);
  });
});

describe('subsourceMapping.toCredentialCheck', () => {
  it.each([
    [StatusCodes.OK, CredentialStatus.VALID, {success: true, data: []}],
    [StatusCodes.UNAUTHORIZED, CredentialStatus.INVALID, {success: false}],
    [StatusCodes.FORBIDDEN, CredentialStatus.INVALID, '<html>Forbidden</html>'],
    [StatusCodes.TOO_MANY_REQUESTS, CredentialStatus.LIMITED, null],
  ])('reads status %i as %s', (status, credentialStatus, body) => {
    expect(
      subsourceMapping.toCredentialCheck({status, headers: {}, body}),
    ).toEqual({
      credentialStatus,
      quotaRemainingCount: null,
      quotaAllowedCount: null,
      quotaResetAt: null,
    });
  });

  it('reads a missing search route as an unavailable source', () => {
    expect(
      catchError(() =>
        subsourceMapping.toCredentialCheck({
          status: StatusCodes.NOT_FOUND,
          headers: {},
          body: null,
        }),
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });
});
