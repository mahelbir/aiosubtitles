import {StatusCodes} from 'http-status-codes';
import {describe, expect, it} from 'vitest';
import {SubtitleLanguage} from '@repo/shared/constants/subtitle-language.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {SubtitleFileExtension} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {subtitleSourceHitSchema} from '../../../src/lib/subtitle-sources/subtitle-source-contract.js';
import {SourceUnavailableError} from '../../../src/lib/subtitle-sources/subtitle-source-errors.js';
import {SUBTITLE_SOURCE_BROWSER_USER_AGENT} from '../../../src/lib/subtitle-sources/subtitle-source-request.js';
import {yifyMapping} from '../../../src/lib/subtitle-sources/yify/yify-mapping.js';
import {readFixture} from '../../helpers/read-fixture.js';
import {makeSearchQuery} from '../../helpers/subtitle-source-factories.js';

const MOVIE_PAGE_FIXTURE = 'subtitle-sources/yify/movie-imdb-tt0133093.html';
const SUBTITLE_PAGE_FIXTURE =
  'subtitle-sources/yify/subtitles-the-matrix-1999-arabic-yify-119083.html';
const SUBTITLE_SLUG = 'the-matrix-1999-arabic-yify-119083';
const ZIP_URL = `https://subtitles.yts-subs.com/subtitles/${SUBTITLE_SLUG}.zip`;
const CAPTURE_ROW_TOTAL = 229;
const ZIP_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
const EMPTY_TABLE_PAGE = `<!DOCTYPE html><html><head><title>Unknown Movie YIFY subtitles</title></head><body>
<h2 class="movie-main-title">Unknown Movie</h2>
<table class="table other-subs"><thead><tr><th>Rating</th></tr></thead><tbody></tbody></table>
</body></html>`;
const CHALLENGE_PAGE =
  '<!DOCTYPE html><html><head><title>Just a moment...</title></head><body></body></html>';
const MULTI_RELEASE_NAMES = [
  'The.Matrix.1999.REMASTERED.720p.BluRay.X264-AMIABLE',
  'The.Matrix.1999.REMASTERED.1080p.BluRay.X264-AMIABLE',
  'The.Matrix.1999.REMASTERED.720p.BluRay.H264.AAC-RARBG',
  'The.Matrix.1999.REMASTERED.1080p.BluRay.H264.AAC-RARBG',
  'The.Matrix.1999.REMASTERED.BRRip.XviD.MP3-XVID',
  'The.Matrix.1999.REMASTERED.720p.BluRay.x264-Pahe.in',
  'The.Matrix.1999.REMASTERED.480p.BluRay.x265-RMTeam',
  'The.Matrix.1999.REMASTERED.720p.BluRay.HEVC.x265-RMTeam',
  'The.Matrix.1999.REMASTERED.1080p.BluRay.AVC.TrueHD.7.1.Atmos-FGT',
];
const movieQuery = makeSearchQuery({
  videoId: 'tt0133093',
  imdbId: 'tt0133093',
  languageCodes: SubtitleLanguage.values,
});

async function readPage(fixturePath) {
  return (await readFixture(fixturePath)).toString('utf8');
}

function toPageResponse(pageHtml, status = StatusCodes.OK) {
  return {
    status,
    headers: {'content-type': 'text/html; charset=UTF-8'},
    body: pageHtml,
  };
}

async function readCaptureHits() {
  return yifyMapping.toSearchHits(
    toPageResponse(await readPage(MOVIE_PAGE_FIXTURE)),
    movieQuery,
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
  return hits?.find(hit => hit.siteFileId === siteFileId);
}

function countLanguageHits(hits, languageCode) {
  return hits?.filter(hit => hit.languageCode === languageCode).length;
}

describe('yifyMapping.buildSearchRequest', () => {
  it('asks the movie page by imdb id with a browser user agent', () => {
    const searchRequest = yifyMapping.buildSearchRequest(movieQuery);

    expect(searchRequest).toMatchObject({
      subtitleSource: SubtitleSource.YIFY,
      url: 'https://yts-subs.com/movie-imdb/tt0133093',
      method: 'GET',
      responseType: 'text',
      acceptedStatuses: [],
      credentialId: null,
    });
    expect(searchRequest?.headers?.['User-Agent']).toBe(
      SUBTITLE_SOURCE_BROWSER_USER_AGENT,
    );
  });

  it('asks nothing for a series episode', () => {
    expect(
      yifyMapping.buildSearchRequest(
        makeSearchQuery({
          videoId: 'tt0903747:1:1',
          videoType: 'series',
          imdbId: 'tt0903747',
          catalogSeason: 1,
          catalogEpisode: 1,
        }),
      ),
    ).toBeNull();
  });

  it('asks nothing without an imdb id', () => {
    expect(
      yifyMapping.buildSearchRequest(
        makeSearchQuery({videoId: 'kitsu:7442', imdbId: null, kitsuId: '7442'}),
      ),
    ).toBeNull();
  });
});

describe('yifyMapping.toSearchHits', () => {
  it('turns every row of the movie page into one hit', async () => {
    const hits = await readCaptureHits();

    expect(hits).toHaveLength(CAPTURE_ROW_TOTAL);
    expect(new Set(hits?.map(hit => hit.siteFileId)).size).toBe(
      CAPTURE_ROW_TOTAL,
    );
  });

  it('names a hit by its subtitle page slug, not by the row data-id', async () => {
    const hits = await readCaptureHits();

    expect(findHit(hits, 'the-matrix-1999-arabic-yify-119081')).toBeDefined();
    expect(findHit(hits, '248323')).toBeUndefined();
    expect(hits?.every(hit => hit.siteFileId.includes('-yify-'))).toBe(true);
  });

  it('maps a row to a keyless srt hit with no site facts', async () => {
    expect(
      findHit(await readCaptureHits(), 'the-matrix-1999-arabic-yify-119081'),
    ).toEqual({
      subtitleSource: SubtitleSource.YIFY,
      siteFileId: 'the-matrix-1999-arabic-yify-119081',
      languageCode: SubtitleLanguage.ARA,
      releaseNames: ['The Matrix'],
      fileExtension: SubtitleFileExtension.SRT,
      isSitePack: false,
      isHearingImpaired: null,
      isForced: null,
      isMachineTranslated: null,
      isUploaderTrusted: null,
      isQuotaCostly: false,
      siteDownloadCount: null,
      siteFps: null,
      siteFileUrl: null,
      siteCueCount: null,
      siteDurationMs: null,
      hashMatchVideoHashes: [],
      subtitleAliases: [],
    });
  });

  it('splits a release cell into one name per line, without the subtitle label', async () => {
    expect(
      findHit(await readCaptureHits(), 'the-matrix-1999-arabic-yify-383590')
        ?.releaseNames,
    ).toEqual(MULTI_RELEASE_NAMES);
  });

  it('reads the language from the English name, not the flag', async () => {
    const hits = await readCaptureHits();

    expect(countLanguageHits(hits, SubtitleLanguage.ENG)).toBe(79);
    expect(countLanguageHits(hits, SubtitleLanguage.ARA)).toBe(20);
    expect(
      findHit(hits, 'the-matrix-1999-bulgarian-yify-119089')?.languageCode,
    ).toBe(SubtitleLanguage.BUL);
  });

  it('maps the site names Farsi/Persian and Brazilian Portuguese', async () => {
    const hits = await readCaptureHits();

    expect(
      findHit(hits, 'the-matrix-1999-farsipersian-yify-119114')?.languageCode,
    ).toBe(SubtitleLanguage.FAS);
    expect(countLanguageHits(hits, SubtitleLanguage.FAS)).toBe(5);
    expect(
      findHit(hits, 'the-matrix-1999-brazilian-portuguese-yify-119086')
        ?.languageCode,
    ).toBe(SubtitleLanguage.POB);
  });

  it('drops a row whose language does not map', async () => {
    const pageHtml = (await readPage(MOVIE_PAGE_FIXTURE)).replaceAll(
      'sub-lang">Arabic<',
      'sub-lang">Klingon<',
    );

    const hits = yifyMapping.toSearchHits(toPageResponse(pageHtml), movieQuery);

    expect(hits).toHaveLength(CAPTURE_ROW_TOTAL - 20);
    expect(hits?.some(hit => hit.siteFileId.includes('-arabic-'))).toBe(false);
  });

  it('gives hits that pass the hit schema', async () => {
    const hits = await readCaptureHits();

    expect(hits?.length ?? 0).toBeGreaterThan(0);
    for (const hit of hits ?? []) {
      expect(subtitleSourceHitSchema.safeParse(hit).success).toBe(true);
    }
  });

  it('answers an unknown movie with no hits', () => {
    expect(
      yifyMapping.toSearchHits(
        {status: StatusCodes.NOT_FOUND, headers: {}, body: null},
        movieQuery,
      ),
    ).toEqual([]);
  });

  it('answers a movie page with an empty table with no hits', () => {
    expect(
      yifyMapping.toSearchHits(toPageResponse(EMPTY_TABLE_PAGE), movieQuery),
    ).toEqual([]);
  });

  it('treats a movie page without the subtitle table as an unavailable source', async () => {
    const pageHtml = (await readPage(MOVIE_PAGE_FIXTURE)).replace(
      'class="table other-subs"',
      'class="table"',
    );

    expect(
      catchError(() =>
        yifyMapping.toSearchHits(toPageResponse(pageHtml), movieQuery),
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });

  it('treats subtitle rows whose page links changed as an unavailable source', async () => {
    const pageHtml = (await readPage(MOVIE_PAGE_FIXTURE)).replaceAll(
      'href="/subtitles/',
      'href="/subtitle/',
    );

    expect(
      catchError(() =>
        yifyMapping.toSearchHits(toPageResponse(pageHtml), movieQuery),
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });

  it('answers rows that are readable but in no known language with no hits', async () => {
    const pageHtml = (await readPage(MOVIE_PAGE_FIXTURE)).replaceAll(
      /sub-lang">[^<]+</g,
      'sub-lang">Klingon<',
    );

    expect(
      yifyMapping.toSearchHits(toPageResponse(pageHtml), movieQuery),
    ).toEqual([]);
  });

  it('treats a movie page without its title heading as an unavailable source', async () => {
    const pageHtml = (await readPage(MOVIE_PAGE_FIXTURE)).replace(
      'movie-main-title',
      'movie-title',
    );

    expect(
      catchError(() =>
        yifyMapping.toSearchHits(toPageResponse(pageHtml), movieQuery),
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });

  it('treats a page that is not a YIFY page as an unavailable source', () => {
    expect(
      catchError(() =>
        yifyMapping.toSearchHits(toPageResponse(CHALLENGE_PAGE), movieQuery),
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });
});

describe('yifyMapping.buildDownloadRequest', () => {
  it('asks the subtitle page by its slug with a browser user agent', () => {
    const downloadRequest = yifyMapping.buildDownloadRequest({
      subtitleSource: SubtitleSource.YIFY,
      siteFileId: SUBTITLE_SLUG,
      siteFileUrl: null,
      catalogSeason: null,
      catalogEpisode: null,
    });

    expect(downloadRequest).toMatchObject({
      subtitleSource: SubtitleSource.YIFY,
      url: `https://yts-subs.com/subtitles/${SUBTITLE_SLUG}`,
      method: 'GET',
      responseType: 'text',
      acceptedStatuses: [],
      credentialId: null,
    });
    expect(downloadRequest?.headers?.['User-Agent']).toBe(
      SUBTITLE_SOURCE_BROWSER_USER_AGENT,
    );
  });
});

describe('yifyMapping.toDownloadLink', () => {
  it('decodes the base64 data-link of the download button into the zip url', async () => {
    expect(
      yifyMapping.toDownloadLink(
        toPageResponse(await readPage(SUBTITLE_PAGE_FIXTURE)),
      )?.fileUrl,
    ).toBe(ZIP_URL);
  });

  it('treats a subtitle page without the download button as an unavailable source', async () => {
    const pageHtml = (await readPage(SUBTITLE_PAGE_FIXTURE)).replace(
      'id="btn-download-subtitle"',
      'id="btn-report-subtitle"',
    );

    expect(
      catchError(() => yifyMapping.toDownloadLink(toPageResponse(pageHtml))),
    ).toBeInstanceOf(SourceUnavailableError);
  });

  it('treats a data-link that is no url as an unavailable source', async () => {
    const pageHtml = (await readPage(SUBTITLE_PAGE_FIXTURE)).replace(
      `data-link="${Buffer.from(ZIP_URL).toString('base64')}"`,
      'data-link="not a link"',
    );

    expect(
      catchError(() => yifyMapping.toDownloadLink(toPageResponse(pageHtml))),
    ).toBeInstanceOf(SourceUnavailableError);
  });

  it('treats a data-link off the YIFY hosts as an unavailable source', async () => {
    const pageHtml = (await readPage(SUBTITLE_PAGE_FIXTURE)).replace(
      `data-link="${Buffer.from(ZIP_URL).toString('base64')}"`,
      `data-link="${Buffer.from('https://files.example.com/the-matrix.zip').toString('base64')}"`,
    );

    expect(
      catchError(() => yifyMapping.toDownloadLink(toPageResponse(pageHtml))),
    ).toBeInstanceOf(SourceUnavailableError);
  });

  it.each([
    'https://yts-subs.com@evil.com/the-matrix.zip',
    'https://yts-subs.com.evil.com/the-matrix.zip',
    'https://evilyts-subs.com/the-matrix.zip',
    'http://subtitles.yts-subs.com/the-matrix.zip',
    'https://subtitles.yts-subs.com./the-matrix.zip',
    'https://subtitles.yts-subs.com:8443/the-matrix.zip',
    'https://user:secret@subtitles.yts-subs.com/the-matrix.zip',
  ])('treats the data-link %s as an unavailable source', async downloadUrl => {
    const pageHtml = (await readPage(SUBTITLE_PAGE_FIXTURE)).replace(
      `data-link="${Buffer.from(ZIP_URL).toString('base64')}"`,
      `data-link="${Buffer.from(downloadUrl).toString('base64')}"`,
    );

    expect(
      catchError(() => yifyMapping.toDownloadLink(toPageResponse(pageHtml))),
    ).toBeInstanceOf(SourceUnavailableError);
  });

  it('treats a missing subtitle page as an unavailable source', () => {
    expect(
      catchError(() =>
        yifyMapping.toDownloadLink({
          status: StatusCodes.NOT_FOUND,
          headers: {},
          body: null,
        }),
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });
});

describe('yifyMapping.buildFileRequest', () => {
  it('asks the zip as bytes with a browser user agent', () => {
    const fileRequest = yifyMapping.buildFileRequest({fileUrl: ZIP_URL});

    expect(fileRequest).toMatchObject({
      subtitleSource: SubtitleSource.YIFY,
      url: ZIP_URL,
      method: 'GET',
      responseType: 'bytes',
      acceptedStatuses: [],
      credentialId: null,
    });
    expect(fileRequest?.headers?.['User-Agent']).toBe(
      SUBTITLE_SOURCE_BROWSER_USER_AGENT,
    );
  });
});

describe('yifyMapping.toDownload', () => {
  it('hands the zip bytes on whole, for the store to expand', () => {
    expect(
      yifyMapping.toDownload({
        status: StatusCodes.OK,
        headers: {
          'content-type': 'application/zip',
          'content-disposition': `attachment; filename="${SUBTITLE_SLUG}.zip"`,
        },
        body: ZIP_BYTES,
      }),
    ).toEqual({
      fileBytes: ZIP_BYTES,
      fileNameHint: `${SUBTITLE_SLUG}.zip`,
      extractedEntryPath: null,
    });
  });

  it('treats a missing zip as an unavailable source', () => {
    expect(
      catchError(() =>
        yifyMapping.toDownload({
          status: StatusCodes.NOT_FOUND,
          headers: {},
          body: null,
        }),
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });
});
