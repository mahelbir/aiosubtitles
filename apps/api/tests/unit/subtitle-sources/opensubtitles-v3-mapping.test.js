import {StatusCodes} from 'http-status-codes';
import {describe, expect, it} from 'vitest';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {opensubtitlesV3Mapping} from '../../../src/lib/subtitle-sources/opensubtitles-v3/opensubtitles-v3-mapping.js';
import {subtitleSourceHitSchema} from '../../../src/lib/subtitle-sources/subtitle-source-contract.js';
import {SourceUnavailableError} from '../../../src/lib/subtitle-sources/subtitle-source-errors.js';
import {readFixture} from '../../helpers/read-fixture.js';
import {makeSearchQuery} from '../../helpers/subtitle-source-factories.js';

const SERIES_FIXTURE =
  'subtitle-sources/opensubtitles-v3/subtitles-series.json';
const MOVIE_FIXTURE = 'subtitle-sources/opensubtitles-v3/subtitles-movie.json';
const SENC_FILE_URL =
  'https://subs5.strem.io/en/download/subencoding-stremio-utf8/src-api/file/9100004?senc=cp1250';
const episodeQuery = makeSearchQuery({
  videoId: 'tt0903747:1:1',
  videoType: 'series',
  imdbId: 'tt0903747',
  catalogSeason: 1,
  catalogEpisode: 1,
  languageCodes: ['tur', 'pob'],
});
const movieQuery = makeSearchQuery({
  videoId: 'tt0133093',
  imdbId: 'tt0133093',
  languageCodes: ['tur', 'pob'],
});

async function readHits(fixturePath, searchQuery) {
  return opensubtitlesV3Mapping.toSearchHits(
    {
      status: StatusCodes.OK,
      headers: {'content-type': 'application/json'},
      body: await readFixture(fixturePath),
    },
    searchQuery,
  );
}

async function readSeriesRows() {
  return (await readFixture(SERIES_FIXTURE)).subtitles;
}

function toHitsOf(siteSubtitles, searchQuery) {
  return opensubtitlesV3Mapping.toSearchHits(
    {status: StatusCodes.OK, headers: {}, body: {subtitles: siteSubtitles}},
    searchQuery,
  );
}

function catchError(callback) {
  try {
    callback();
  } catch (error) {
    return error;
  }
  return null;
}

function findHit(hits, siteFileId) {
  return hits.find(hit => hit.siteFileId === siteFileId);
}

describe('opensubtitlesV3Mapping.buildSearchRequest', () => {
  it('asks one episode by its imdb id, season and episode', () => {
    expect(opensubtitlesV3Mapping.buildSearchRequest(episodeQuery)).toEqual({
      subtitleSource: SubtitleSource.OPENSUBTITLES_V3,
      url: 'https://opensubtitles-v3.strem.io/subtitles/series/tt0903747:1:1.json',
      method: 'GET',
      headers: {},
      responseType: 'json',
      acceptedStatuses: [],
      credentialId: null,
    });
  });

  it('asks a movie by its imdb id alone', () => {
    expect(opensubtitlesV3Mapping.buildSearchRequest(movieQuery).url).toBe(
      'https://opensubtitles-v3.strem.io/subtitles/movie/tt0133093.json',
    );
  });

  it('asks an anime episode by its mapped imdb id, never by the kitsu id', () => {
    const searchRequest = opensubtitlesV3Mapping.buildSearchRequest(
      makeSearchQuery({
        videoId: 'kitsu:7442:5',
        videoType: 'series',
        imdbId: 'tt2560140',
        kitsuId: '7442',
        catalogSeason: 2,
        catalogEpisode: 5,
      }),
    );
    expect(searchRequest.url).toBe(
      'https://opensubtitles-v3.strem.io/subtitles/series/tt2560140:2:5.json',
    );
    expect(searchRequest.url).not.toContain('kitsu');
  });

  it('sends no extras, even with a video hash, size and file name', () => {
    expect(
      opensubtitlesV3Mapping.buildSearchRequest({
        ...episodeQuery,
        videoHash: '8e245d9679d31e12',
        videoSizeBytes: 12909756,
        videoFilename: 'Show.S01E01.720p.HDTV.x264-GRP.mkv',
      }).url,
    ).toBe(
      'https://opensubtitles-v3.strem.io/subtitles/series/tt0903747:1:1.json',
    );
  });

  it('asks nothing without an imdb id', () => {
    expect(
      opensubtitlesV3Mapping.buildSearchRequest(
        makeSearchQuery({
          videoId: 'kitsu:7442:5',
          videoType: 'series',
          imdbId: null,
          kitsuId: '7442',
          catalogSeason: 1,
          catalogEpisode: 5,
        }),
      ),
    ).toBeNull();
  });

  it('asks nothing for a series query without its episode', () => {
    expect(
      opensubtitlesV3Mapping.buildSearchRequest({
        ...episodeQuery,
        catalogEpisode: null,
      }),
    ).toBeNull();
  });
});

describe('opensubtitlesV3Mapping.toSearchHits', () => {
  it('maps a feed row to a hit', async () => {
    const hits = await readHits(SERIES_FIXTURE, episodeQuery);
    expect(findHit(hits, '7100001')).toEqual({
      subtitleSource: SubtitleSource.OPENSUBTITLES_V3,
      siteFileId: '7100001',
      languageCode: 'pob',
      releaseNames: [
        'Show.S01E01.720p.HDTV.x264-GRP',
        'Show.S01E01.720p.HDTV.x264-GRP.srt',
      ],
      fileExtension: 'srt',
      isSitePack: false,
      isHearingImpaired: null,
      isForced: null,
      isMachineTranslated: null,
      isUploaderTrusted: null,
      isQuotaCostly: false,
      siteDownloadCount: null,
      siteFps: 23.976,
      siteFileUrl:
        'https://subs5.strem.io/en/download/subencoding-stremio-utf8/src-api/file/9100001',
      siteCueCount: null,
      siteDurationMs: null,
      hashMatchVideoHashes: [],
      subtitleAliases: [],
    });
  });

  it('keeps only the rows in the asked languages', async () => {
    const hits = await readHits(SERIES_FIXTURE, episodeQuery);
    expect(hits.map(hit => [hit.siteFileId, hit.languageCode])).toEqual([
      ['7100001', 'pob'],
      ['7100002', 'tur'],
      ['7100005', 'tur'],
      ['7100006', 'pob'],
    ]);
  });

  it('drops a ger row for the languages tur and pob', async () => {
    const movieHits = await readHits(MOVIE_FIXTURE, movieQuery);
    expect(findHit(movieHits, '8200001')).toBeUndefined();
    expect(movieHits.map(hit => hit.siteFileId)).toEqual(['8200002']);
    const seriesHits = await readHits(SERIES_FIXTURE, episodeQuery);
    expect(findHit(seriesHits, '7100003')).toBeUndefined();
  });

  it('keeps a ger row when ger is asked', async () => {
    const hits = await readHits(
      MOVIE_FIXTURE,
      makeSearchQuery({imdbId: 'tt0133093', languageCodes: ['ger']}),
    );
    expect(hits.map(hit => [hit.siteFileId, hit.languageCode])).toEqual([
      ['8200001', 'ger'],
    ]);
  });

  it('reads a bibliographic three-letter code through the shared language lookup', async () => {
    const hits = await readHits(SERIES_FIXTURE, {
      ...episodeQuery,
      languageCodes: ['ces'],
    });
    expect(hits.map(hit => [hit.siteFileId, hit.languageCode])).toEqual([
      ['7100004', 'ces'],
    ]);
  });

  it('keeps the file url byte for byte, its encoding query included', async () => {
    const siteRow = (await readSeriesRows()).find(
      siteSubtitle => siteSubtitle.id === '7100004',
    );
    const hits = await readHits(SERIES_FIXTURE, {
      ...episodeQuery,
      languageCodes: ['ces'],
    });
    expect(findHit(hits, '7100004').siteFileUrl).toBe(siteRow.url);
    expect(findHit(hits, '7100004').siteFileUrl).toBe(SENC_FILE_URL);
  });

  it('reads fpsMilli as frames per second and its absence as null', async () => {
    const hits = await readHits(SERIES_FIXTURE, episodeQuery);
    expect(findHit(hits, '7100001').siteFps).toBe(23.976);
    expect(findHit(hits, '7100002').siteFps).toBe(25);
    expect(findHit(hits, '7100005').siteFps).toBeNull();
  });

  it('names the release by its release name and file name, each once', async () => {
    const hits = await readHits(SERIES_FIXTURE, episodeQuery);
    expect(findHit(hits, '7100002').releaseNames).toEqual([
      'Show.S01E01.1080p.WEB-DL-NTb',
      'Show.S01E01.1080p.WEB-DL.tr.srt',
    ]);
    expect(findHit(hits, '7100005').releaseNames).toEqual(['Show 1x01.srt']);
    expect(findHit(hits, '7100006').releaseNames).toEqual(['Show.S01E01']);
  });

  it('gives an empty name no release name', async () => {
    const [firstRow] = await readSeriesRows();
    const hits = toHitsOf(
      [{...firstRow, movieReleaseName: ' ', subtitleFileName: ''}],
      episodeQuery,
    );
    expect(hits[0].releaseNames).toEqual([]);
  });

  it('drops a row whose language does not map', async () => {
    const hits = await readHits(SERIES_FIXTURE, {
      ...episodeQuery,
      languageCodes: ['tur', 'pob', 'ger', 'ces'],
    });
    expect(findHit(hits, '7100007')).toBeUndefined();
    expect(hits).toHaveLength(6);
  });

  it('gives hits that pass the hit schema', async () => {
    const hits = [
      ...(await readHits(SERIES_FIXTURE, {
        ...episodeQuery,
        languageCodes: ['tur', 'pob', 'ger', 'ces'],
      })),
      ...(await readHits(
        MOVIE_FIXTURE,
        makeSearchQuery({languageCodes: ['ger', 'pob', 'hrv']}),
      )),
    ];
    expect(hits).toHaveLength(9);
    for (const hit of hits) {
      expect(subtitleSourceHitSchema.safeParse(hit).success).toBe(true);
    }
  });

  it('drops a malformed row rather than failing', async () => {
    const [firstRow] = await readSeriesRows();
    const hits = toHitsOf(
      [
        null,
        {...firstRow, id: undefined},
        {...firstRow, id: ''},
        {...firstRow, id: '1', url: undefined},
        {...firstRow, id: '2', url: 'not a url'},
        {...firstRow, id: '3', lang: 42},
        {...firstRow, id: '4'},
      ],
      episodeQuery,
    );
    expect(hits.map(hit => hit.siteFileId)).toEqual(['4']);
  });

  it('reads a numeric id as text and drops one that is not a positive integer', async () => {
    const [firstRow] = await readSeriesRows();
    const hits = toHitsOf(
      [
        {...firstRow, id: 7100001},
        {...firstRow, id: 0},
        {...firstRow, id: 1.5},
      ],
      episodeQuery,
    );
    expect(hits.map(hit => hit.siteFileId)).toEqual(['7100001']);
  });

  it('drops a row whose id is longer than the hit schema allows', async () => {
    const [firstRow] = await readSeriesRows();
    const hits = toHitsOf(
      [
        {...firstRow, id: '7'.repeat(513)},
        {...firstRow, id: '8'.repeat(512)},
      ],
      episodeQuery,
    );
    expect(hits.map(hit => hit.siteFileId)).toEqual(['8'.repeat(512)]);
    expect(subtitleSourceHitSchema.safeParse(hits[0]).success).toBe(true);
  });

  it('drops a row whose file url is on a private host', async () => {
    const [firstRow] = await readSeriesRows();
    const hits = toHitsOf(
      [
        {...firstRow, id: '1', url: 'http://127.0.0.1:11470/subtitles.vtt'},
        {...firstRow, id: '2', url: 'http://localhost/subtitles.srt'},
        {...firstRow, id: '3'},
      ],
      episodeQuery,
    );
    expect(hits.map(hit => hit.siteFileId)).toEqual(['3']);
  });

  it.each([
    ['an object', {subtitles: {id: '1'}}],
    ['no list', {subtitles: null}],
    ['a text body', 'Not found.'],
  ])('reads %s in place of the row list as no hits', (_, body) => {
    expect(
      opensubtitlesV3Mapping.toSearchHits(
        {status: StatusCodes.OK, headers: {}, body},
        episodeQuery,
      ),
    ).toEqual([]);
  });

  it('reads an unknown title as no hits', () => {
    expect(
      opensubtitlesV3Mapping.toSearchHits(
        {status: StatusCodes.NOT_FOUND, headers: {}, body: null},
        episodeQuery,
      ),
    ).toEqual([]);
  });
});

describe('opensubtitlesV3Mapping.buildDownloadRequest', () => {
  const subtitleRef = {
    subtitleSource: SubtitleSource.OPENSUBTITLES_V3,
    siteFileId: '7100004',
    siteFileUrl: SENC_FILE_URL,
    catalogSeason: 1,
    catalogEpisode: 1,
  };

  it('asks the file url the feed gave for bytes, unchanged', () => {
    expect(opensubtitlesV3Mapping.buildDownloadRequest(subtitleRef)).toEqual({
      subtitleSource: SubtitleSource.OPENSUBTITLES_V3,
      url: SENC_FILE_URL,
      method: 'GET',
      headers: {},
      responseType: 'bytes',
      acceptedStatuses: [],
      credentialId: null,
    });
  });

  it.each([null, undefined, ''])(
    'reads a missing file url (%s) as an unavailable source and builds none',
    siteFileUrl => {
      const error = catchError(() =>
        opensubtitlesV3Mapping.buildDownloadRequest({
          ...subtitleRef,
          siteFileUrl,
        }),
      );
      expect(error).toBeInstanceOf(SourceUnavailableError);
      expect(error.subtitleSource).toBe(SubtitleSource.OPENSUBTITLES_V3);
    },
  );

  it('reads a file url on a private host as an unavailable source', () => {
    const error = catchError(() =>
      opensubtitlesV3Mapping.buildDownloadRequest({
        ...subtitleRef,
        siteFileUrl: 'http://127.0.0.1:11470/subtitles.vtt',
      }),
    );
    expect(error).toBeInstanceOf(SourceUnavailableError);
  });
});

describe('opensubtitlesV3Mapping.toDownload', () => {
  const fileBytes = Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nOi\n');

  it('returns the file bytes and the file name the site gives', () => {
    expect(
      opensubtitlesV3Mapping.toDownload({
        status: StatusCodes.OK,
        headers: {
          'content-disposition': 'attachment; filename="Show.S01E01.srt"',
        },
        body: fileBytes,
      }),
    ).toEqual({
      fileBytes,
      fileNameHint: 'Show.S01E01.srt',
      extractedEntryPath: null,
    });
  });

  it('gives no file name when the site sends none', () => {
    expect(
      opensubtitlesV3Mapping.toDownload({
        status: StatusCodes.OK,
        headers: {},
        body: fileBytes,
      }).fileNameHint,
    ).toBeNull();
  });

  it('reads a missing file as an unavailable source', () => {
    const error = catchError(() =>
      opensubtitlesV3Mapping.toDownload({
        status: StatusCodes.NOT_FOUND,
        headers: {},
        body: null,
      }),
    );
    expect(error).toBeInstanceOf(SourceUnavailableError);
  });
});
