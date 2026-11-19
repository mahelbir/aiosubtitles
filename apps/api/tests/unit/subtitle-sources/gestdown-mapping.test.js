import {StatusCodes} from 'http-status-codes';
import {describe, expect, it} from 'vitest';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {gestdownMapping} from '../../../src/lib/subtitle-sources/gestdown/gestdown-mapping.js';
import {subtitleSourceHitSchema} from '../../../src/lib/subtitle-sources/subtitle-source-contract.js';
import {SourceUnavailableError} from '../../../src/lib/subtitle-sources/subtitle-source-errors.js';
import {readFixture} from '../../helpers/read-fixture.js';
import {makeSearchQuery} from '../../helpers/subtitle-source-factories.js';

const SHOWS_FIXTURE = 'subtitle-sources/gestdown/shows-external-tvdb.json';
const SUBTITLES_FIXTURE = 'subtitle-sources/gestdown/subtitles-get.json';
const SHOW_ID = '3kq7Fixture0Show00000A';
const UNCATALOGED_PACK_ID = 'sp_5RtyFixture0Pack0001_ep_3';
const CATALOGED_PACK_ID = 'sp_5RtyFixture0Pack0002_entry_7HjkFixture0Entry001';
const episodeQuery = makeSearchQuery({
  videoId: 'tt0903747:2:3',
  videoType: 'series',
  imdbId: 'tt0903747',
  catalogSeason: 2,
  catalogEpisode: 3,
  tvdbId: '81189',
  languageCodes: ['pob'],
});

async function readHits(languageCode = 'pob') {
  return gestdownMapping.toSearchHits(
    {
      status: StatusCodes.OK,
      headers: {'content-type': 'application/json'},
      body: await readFixture(SUBTITLES_FIXTURE),
    },
    languageCode,
  );
}

async function readSubtitleRows() {
  return (await readFixture(SUBTITLES_FIXTURE)).matchingSubtitles;
}

function toHitsOf(siteSubtitles, languageCode = 'pob') {
  return gestdownMapping.toSearchHits(
    {
      status: StatusCodes.OK,
      headers: {},
      body: {matchingSubtitles: siteSubtitles},
    },
    languageCode,
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

function readLanguageSegment(subtitlesRequest) {
  return new URL(subtitlesRequest.url).pathname.split('/').at(-1);
}

describe('gestdownMapping.buildShowRequest', () => {
  it('looks the show up by its tvdb id', () => {
    expect(gestdownMapping.buildShowRequest(episodeQuery)).toEqual({
      subtitleSource: SubtitleSource.GESTDOWN,
      url: 'https://api.gestdown.info/shows/external/tvdb/81189',
      method: 'GET',
      headers: {},
      responseType: 'json',
      acceptedStatuses: [],
      credentialId: null,
    });
  });

  it('asks nothing for a movie, even with a tvdb id', () => {
    expect(
      gestdownMapping.buildShowRequest(
        makeSearchQuery({videoId: 'tt0133093', tvdbId: '169'}),
      ),
    ).toBeNull();
  });

  it('asks nothing for a series without a tvdb id', () => {
    expect(
      gestdownMapping.buildShowRequest({...episodeQuery, tvdbId: null}),
    ).toBeNull();
  });

  it.each([
    ['season', {catalogSeason: null}],
    ['episode', {catalogEpisode: null}],
  ])('asks nothing for a series query without its %s', (_, overrides) => {
    expect(
      gestdownMapping.buildShowRequest({...episodeQuery, ...overrides}),
    ).toBeNull();
  });
});

describe('gestdownMapping.findShowId', () => {
  it('reads the show id from the show list', async () => {
    expect(
      gestdownMapping.findShowId(
        {
          status: StatusCodes.OK,
          headers: {},
          body: await readFixture(SHOWS_FIXTURE),
        },
        episodeQuery,
      ),
    ).toBe(SHOW_ID);
  });

  it('keeps the show whose tvdb id matches, not the first one', async () => {
    const {shows} = await readFixture(SHOWS_FIXTURE);
    expect(
      gestdownMapping.findShowId(
        {
          status: StatusCodes.OK,
          headers: {},
          body: {
            shows: [
              {...shows[0], id: '9zzzOtherShow000000000', tvDbId: 70000},
              shows[0],
            ],
          },
        },
        episodeQuery,
      ),
    ).toBe(SHOW_ID);
  });

  it('finds nothing for an unknown show', () => {
    expect(
      gestdownMapping.findShowId(
        {status: StatusCodes.NOT_FOUND, headers: {}, body: null},
        episodeQuery,
      ),
    ).toBeNull();
  });

  it.each([
    ['an empty list', {shows: []}],
    ['a show without an id', {shows: [{tvDbId: 81189}]}],
    ['a show with a numeric id', {shows: [{id: 42, tvDbId: 81189}]}],
    ['a show with an empty id', {shows: [{id: '', tvDbId: 81189}]}],
  ])('finds nothing in %s', (_, body) => {
    expect(
      gestdownMapping.findShowId(
        {status: StatusCodes.OK, headers: {}, body},
        episodeQuery,
      ),
    ).toBeNull();
  });

  it.each([
    ['no list', {shows: null}],
    ['a bare show', {id: SHOW_ID, tvDbId: 81189}],
    ['a text body', 'Show not found'],
  ])(
    'reads %s in place of the show list as an unavailable source',
    (_, body) => {
      expect(
        catchError(() =>
          gestdownMapping.findShowId(
            {status: StatusCodes.OK, headers: {}, body},
            episodeQuery,
          ),
        ),
      ).toBeInstanceOf(SourceUnavailableError);
    },
  );
});

describe('gestdownMapping.buildSubtitlesRequests', () => {
  it('asks one episode in one language, reading 423 itself', () => {
    expect(
      gestdownMapping.buildSubtitlesRequests(SHOW_ID, episodeQuery, 'eng'),
    ).toEqual([
      {
        subtitleSource: SubtitleSource.GESTDOWN,
        url: `https://api.gestdown.info/subtitles/get/${SHOW_ID}/2/3/en`,
        method: 'GET',
        headers: {},
        responseType: 'json',
        acceptedStatuses: [StatusCodes.LOCKED],
        credentialId: null,
      },
    ]);
  });

  it.each([
    ['eng', ['en']],
    ['tur', ['tr']],
    ['ger', ['de']],
    ['nob', ['nb']],
    ['aze', ['az']],
    ['pob', ['pt-br']],
    ['por', ['pt']],
    ['spl', ['es-419']],
    ['spa', ['es', 'es-es']],
    ['zho', ['zh-hans', 'zh-hant']],
    ['fre', ['fr', 'fr-ca']],
  ])('asks %s by the culture names %j', (languageCode, cultures) => {
    expect(
      gestdownMapping
        .buildSubtitlesRequests(SHOW_ID, episodeQuery, languageCode)
        .map(readLanguageSegment),
    ).toEqual(cultures);
  });

  it('asks nothing for a language the site has no code for', () => {
    expect(
      gestdownMapping.buildSubtitlesRequests(SHOW_ID, episodeQuery, 'xxx'),
    ).toEqual([]);
  });

  it('keeps the show id inside its own path segment', () => {
    const [subtitlesRequest] = gestdownMapping.buildSubtitlesRequests(
      'a/b?c',
      episodeQuery,
      'eng',
    );
    expect(new URL(subtitlesRequest.url).pathname).toBe(
      '/subtitles/get/a%2Fb%3Fc/2/3/en',
    );
  });
});

describe('gestdownMapping.toSearchHits', () => {
  it('maps an Addic7ed row, naming it by its version', async () => {
    expect(findHit(await readHits(), '0VBJFixture0Sub000001A')).toEqual({
      subtitleSource: SubtitleSource.GESTDOWN,
      siteFileId: '0VBJFixture0Sub000001A',
      languageCode: 'pob',
      releaseNames: ['HDTV'],
      fileExtension: 'srt',
      isSitePack: false,
      isHearingImpaired: false,
      isForced: null,
      isMachineTranslated: null,
      isUploaderTrusted: null,
      isQuotaCostly: false,
      siteDownloadCount: 100,
      siteFps: null,
      siteFileUrl: null,
      siteCueCount: null,
      siteDurationMs: null,
      hashMatchVideoHashes: [],
      subtitleAliases: [],
    });
  });

  it('names a row by its release when the site gives one', async () => {
    expect(findHit(await readHits(), '0VBJFixture0Sub000002B')).toMatchObject({
      releaseNames: ['Fixture.Show.S02E03.1080p.WEB.h264-GRP'],
      isHearingImpaired: true,
      siteDownloadCount: 7,
    });
  });

  it('names a row by its version when its release is empty', async () => {
    const [firstRow] = await readSubtitleRows();
    const [hit] = toHitsOf([{...firstRow, release: '', version: 'WEB'}]);
    expect(hit.releaseNames).toEqual(['WEB']);
  });

  it('gives each hit the asked language, not the English name the site sends', async () => {
    const hits = await readHits('pob');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every(hit => hit.languageCode === 'pob')).toBe(true);
  });

  it('skips a row the site marks as not completed', async () => {
    expect(findHit(await readHits(), '0VBJFixture0Sub000003C')).toBeUndefined();
  });

  it('keeps season pack ids as the site gives them, as single files', async () => {
    const hits = await readHits();
    expect(findHit(hits, UNCATALOGED_PACK_ID)).toMatchObject({
      siteFileId: UNCATALOGED_PACK_ID,
      isSitePack: false,
      releaseNames: ['Fixture.Show.S02.720p.BluRay.x264-PACK'],
    });
    expect(findHit(hits, CATALOGED_PACK_ID)).toMatchObject({
      siteFileId: CATALOGED_PACK_ID,
      isSitePack: false,
      releaseNames: ['DUB'],
    });
  });

  it('keeps the rows in site order', async () => {
    expect((await readHits()).map(hit => hit.siteFileId)).toEqual([
      '0VBJFixture0Sub000001A',
      '0VBJFixture0Sub000002B',
      UNCATALOGED_PACK_ID,
      CATALOGED_PACK_ID,
    ]);
  });

  it('gives hits that pass the hit schema', async () => {
    const hits = await readHits();
    expect(hits).toHaveLength(4);
    for (const hit of hits) {
      expect(subtitleSourceHitSchema.safeParse(hit).success).toBe(true);
    }
  });

  it('reads flags and counts of the wrong kind as unknown', async () => {
    const [firstRow] = await readSubtitleRows();
    const [hit] = toHitsOf([
      {...firstRow, hearingImpaired: 'yes', downloadCount: -1},
    ]);
    expect(hit).toMatchObject({
      isHearingImpaired: null,
      siteDownloadCount: null,
    });
  });

  it('reads a count past the column cap as unknown', async () => {
    const [firstRow] = await readSubtitleRows();
    const [hit] = toHitsOf([{...firstRow, downloadCount: 2147483648}]);
    expect(hit.siteDownloadCount).toBeNull();
  });

  it('drops a malformed row rather than failing', async () => {
    const [firstRow] = await readSubtitleRows();
    const hits = toHitsOf([
      null,
      {...firstRow, subtitleId: undefined},
      {...firstRow, subtitleId: ''},
      {...firstRow, subtitleId: 42},
      {...firstRow, subtitleId: 'x'.repeat(513)},
      {...firstRow, subtitleId: 'kept0Fixture0Row000001'},
    ]);
    expect(hits.map(hit => hit.siteFileId)).toEqual(['kept0Fixture0Row000001']);
  });

  it('reads a language the site does not know (423) as no hits', () => {
    expect(
      gestdownMapping.toSearchHits(
        {status: StatusCodes.LOCKED, headers: {}, body: null},
        'pob',
      ),
    ).toEqual([]);
  });

  it('reads an unknown show id (404) as no hits', () => {
    expect(
      gestdownMapping.toSearchHits(
        {status: StatusCodes.NOT_FOUND, headers: {}, body: null},
        'pob',
      ),
    ).toEqual([]);
  });

  it('reads an empty row list as no hits', () => {
    expect(
      gestdownMapping.toSearchHits(
        {status: StatusCodes.OK, headers: {}, body: {matchingSubtitles: []}},
        'pob',
      ),
    ).toEqual([]);
  });

  it.each([
    ['an object', {matchingSubtitles: {subtitleId: '1'}}],
    ['no list', {matchingSubtitles: null}],
    ['a text body', 'Not found.'],
  ])(
    'reads %s in place of the row list as an unavailable source',
    (_, body) => {
      expect(
        catchError(() =>
          gestdownMapping.toSearchHits(
            {status: StatusCodes.OK, headers: {}, body},
            'pob',
          ),
        ),
      ).toBeInstanceOf(SourceUnavailableError);
    },
  );
});

describe('gestdownMapping.buildDownloadRequest', () => {
  const subtitleRef = {
    subtitleSource: SubtitleSource.GESTDOWN,
    siteFileId: '0VBJFixture0Sub000001A',
    siteFileUrl: null,
    catalogSeason: 2,
    catalogEpisode: 3,
  };

  it('asks the download route for bytes', () => {
    expect(gestdownMapping.buildDownloadRequest(subtitleRef)).toEqual({
      subtitleSource: SubtitleSource.GESTDOWN,
      url: 'https://api.gestdown.info/subtitles/download/0VBJFixture0Sub000001A',
      method: 'GET',
      headers: {},
      responseType: 'bytes',
      acceptedStatuses: [],
      credentialId: null,
    });
  });

  it.each([UNCATALOGED_PACK_ID, CATALOGED_PACK_ID])(
    'downloads the season pack id %s as the site gave it',
    siteFileId => {
      expect(
        gestdownMapping.buildDownloadRequest({
          ...subtitleRef,
          siteFileId,
          isSitePack: false,
        }).url,
      ).toBe(`https://api.gestdown.info/subtitles/download/${siteFileId}`);
    },
  );

  it('keeps the file id inside its own path segment', () => {
    expect(
      new URL(
        gestdownMapping.buildDownloadRequest({
          ...subtitleRef,
          siteFileId: '../a?b',
        }).url,
      ).pathname,
    ).toBe('/subtitles/download/..%2Fa%3Fb');
  });

  it('ignores a file url on the ref', () => {
    expect(
      gestdownMapping.buildDownloadRequest({
        ...subtitleRef,
        siteFileUrl: 'http://127.0.0.1/subtitles.srt',
      }).url,
    ).toBe(
      'https://api.gestdown.info/subtitles/download/0VBJFixture0Sub000001A',
    );
  });
});

describe('gestdownMapping.toDownload', () => {
  const fileBytes = Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nOi\n');

  it('returns the file bytes and the file name the site gives', () => {
    expect(
      gestdownMapping.toDownload({
        status: StatusCodes.OK,
        headers: {
          'content-type': 'text/srt',
          'content-disposition':
            'attachment; filename="Fixture.Show.S02E03.srt"',
        },
        body: fileBytes,
      }),
    ).toEqual({
      fileBytes,
      fileNameHint: 'Fixture.Show.S02E03.srt',
      extractedEntryPath: null,
    });
  });

  it('reports no extracted entry for a season pack episode file', () => {
    expect(
      gestdownMapping.toDownload({
        status: StatusCodes.OK,
        headers: {'content-type': 'text/srt'},
        body: fileBytes,
      }).extractedEntryPath,
    ).toBeNull();
  });

  it('gives no file name when the site sends none', () => {
    expect(
      gestdownMapping.toDownload({
        status: StatusCodes.OK,
        headers: {},
        body: fileBytes,
      }).fileNameHint,
    ).toBeNull();
  });

  it('reads a missing file as an unavailable source', () => {
    const error = catchError(() =>
      gestdownMapping.toDownload({
        status: StatusCodes.NOT_FOUND,
        headers: {},
        body: null,
      }),
    );
    expect(error).toBeInstanceOf(SourceUnavailableError);
    expect(error.subtitleSource).toBe(SubtitleSource.GESTDOWN);
  });
});
