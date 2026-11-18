import {StatusCodes} from 'http-status-codes';
import {describe, expect, it} from 'vitest';
import {CredentialStatus} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {subtitleSourceHitSchema} from '../../../src/lib/subtitle-sources/subtitle-source-contract.js';
import {SourceUnavailableError} from '../../../src/lib/subtitle-sources/subtitle-source-errors.js';
import {thesubtitledbMapping} from '../../../src/lib/subtitle-sources/thesubtitledb/thesubtitledb-mapping.js';
import {readFixture} from '../../helpers/read-fixture.js';
import {
  makeSearchQuery,
  makeSubtitleSourceCredential,
} from '../../helpers/subtitle-source-factories.js';

const API_KEY = 'sdb_fixturekey1234';
const EPISODE_FIXTURE = 'subtitle-sources/thesubtitledb/by-imdb-episode.json';
const keyCredential = makeSubtitleSourceCredential({apiKey: API_KEY});
const episodeQuery = makeSearchQuery({
  videoId: 'tt0944947:1:1',
  videoType: 'series',
  imdbId: 'tt0944947',
  catalogSeason: 1,
  catalogEpisode: 1,
  languageCodes: ['tur', 'eng'],
});

async function readEpisodeHits() {
  return thesubtitledbMapping.toSearchHits({
    status: StatusCodes.OK,
    headers: {'content-type': 'application/json'},
    body: await readFixture(EPISODE_FIXTURE),
  });
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

function findHit(hits, siteFileId) {
  return hits.find(hit => hit.siteFileId === siteFileId);
}

describe('thesubtitledbMapping.buildSearchRequest', () => {
  it('asks one episode in the user languages', () => {
    const searchRequest = thesubtitledbMapping.buildSearchRequest(
      episodeQuery,
      null,
    );
    const searchUrl = new URL(searchRequest.url);
    expect(searchUrl.origin).toBe('https://api.thesubtitledb.org');
    expect(searchUrl.pathname).toBe('/v1/by-imdb/tt0944947/season/1/episode/1');
    expect(searchUrl.searchParams.get('lang')).toBe('tr,en');
    expect(searchUrl.searchParams.get('limit')).toBe('100');
    expect(searchRequest).toMatchObject({
      subtitleSource: SubtitleSource.THESUBTITLEDB,
      method: 'GET',
      responseType: 'json',
      acceptedStatuses: [],
      credentialId: null,
    });
  });

  it('asks a movie by its imdb id alone', () => {
    const searchRequest = thesubtitledbMapping.buildSearchRequest(
      makeSearchQuery({imdbId: 'tt0111161', languageCodes: ['eng']}),
      null,
    );
    const searchUrl = new URL(searchRequest.url);
    expect(searchUrl.pathname).toBe('/v1/by-imdb/tt0111161');
    expect(searchUrl.searchParams.get('lang')).toBe('en');
    expect(searchUrl.searchParams.get('limit')).toBe('100');
  });

  it('leaves the app User-Agent to the shared default and sends no key without one', () => {
    expect(
      thesubtitledbMapping.buildSearchRequest(episodeQuery, null).headers,
    ).toEqual({});
  });

  it('sends a key as a bearer token, never in the url', () => {
    const searchRequest = thesubtitledbMapping.buildSearchRequest(
      episodeQuery,
      keyCredential,
    );
    expect(searchRequest.headers).toEqual({
      Authorization: `Bearer ${API_KEY}`,
    });
    expect(searchRequest.credentialId).toBe(keyCredential.credentialId);
    expect(searchRequest.url).not.toContain(API_KEY);
  });

  it('asks a regional language by its site code', () => {
    const searchUrl = new URL(
      thesubtitledbMapping.buildSearchRequest(
        makeSearchQuery({languageCodes: ['pob', 'spa']}),
        null,
      ).url,
    );
    expect(searchUrl.searchParams.get('lang')).toBe('pb,es,sp');
  });

  it('asks at most the 16 languages the site takes', () => {
    const searchUrl = new URL(
      thesubtitledbMapping.buildSearchRequest(
        makeSearchQuery({
          languageCodes: [
            'spa',
            'por',
            'zho',
            'tur',
            'eng',
            'fre',
            'ger',
            'ita',
            'jpn',
            'kor',
            'rus',
            'ara',
            'pol',
            'nld',
            'swe',
          ],
        }),
        null,
      ).url,
    );
    expect(searchUrl.searchParams.get('lang').split(',')).toHaveLength(16);
  });

  it('asks nothing for a series query without its episode', () => {
    expect(
      thesubtitledbMapping.buildSearchRequest(
        {...episodeQuery, catalogEpisode: null},
        null,
      ),
    ).toBeNull();
  });

  it('asks nothing without an imdb id', () => {
    expect(
      thesubtitledbMapping.buildSearchRequest(
        makeSearchQuery({
          videoId: 'kitsu:1:1',
          videoType: 'series',
          imdbId: null,
          kitsuId: '1',
          catalogSeason: 1,
          catalogEpisode: 1,
        }),
        null,
      ),
    ).toBeNull();
  });
});

describe('thesubtitledbMapping.toSearchHits', () => {
  it('maps a lookup item and its list-time hints', async () => {
    const hits = await readEpisodeHits();
    expect(findHit(hits, '9100001')).toEqual({
      subtitleSource: SubtitleSource.THESUBTITLEDB,
      siteFileId: '9100001',
      languageCode: 'tur',
      releaseNames: [
        'Show.S01E01.1080p.WEB-DL-NTb',
        'Show.S01E01.720p.WEB-DL-NTb',
      ],
      fileExtension: 'srt',
      isSitePack: false,
      isHearingImpaired: false,
      isForced: null,
      isMachineTranslated: false,
      isUploaderTrusted: null,
      isQuotaCostly: false,
      siteDownloadCount: null,
      siteFps: null,
      siteFileUrl: null,
      siteCueCount: 812,
      siteDurationMs: 2580000,
      hashMatchVideoHashes: [],
      subtitleAliases: [],
    });
  });

  it('reads ass and ssa files as ass and every other format as srt', async () => {
    const hits = await readEpisodeHits();
    expect(findHit(hits, '9100002').fileExtension).toBe('ass');
    expect(findHit(hits, '9100003').fileExtension).toBe('ass');
    expect(findHit(hits, '9100004').fileExtension).toBe('srt');
  });

  it('marks a translated file as machine-made and a transcribed one as unknown', async () => {
    const hits = await readEpisodeHits();
    expect(findHit(hits, '9100002').isMachineTranslated).toBe(true);
    expect(findHit(hits, '9100003').isMachineTranslated).toBeNull();
    expect(findHit(hits, '9100004').isMachineTranslated).toBe(false);
  });

  it('keeps hearing-impaired, fps and a rounded duration', async () => {
    const hits = await readEpisodeHits();
    expect(findHit(hits, '9100002')).toMatchObject({
      languageCode: 'eng',
      isHearingImpaired: true,
      siteFps: 23.976,
      siteCueCount: 790,
      siteDurationMs: 2579600,
    });
  });

  it('gives an empty release name no names', async () => {
    const hits = await readEpisodeHits();
    expect(findHit(hits, '9100003').releaseNames).toEqual([]);
  });

  it('drops an item whose language does not map', async () => {
    const hits = await readEpisodeHits();
    expect(findHit(hits, '9100005')).toBeUndefined();
    expect(hits.map(hit => hit.siteFileId)).toEqual([
      '9100001',
      '9100002',
      '9100003',
      '9100004',
    ]);
  });

  it('gives hits that pass the hit schema', async () => {
    const hits = await readEpisodeHits();
    for (const hit of hits) {
      expect(subtitleSourceHitSchema.safeParse(hit).success).toBe(true);
    }
  });

  it('reads the site language codes of regional languages', async () => {
    const episodeBody = await readFixture(EPISODE_FIXTURE);
    const [firstItem] = episodeBody.subtitles.items;
    const hits = thesubtitledbMapping.toSearchHits({
      status: StatusCodes.OK,
      headers: {},
      body: {
        subtitles: {
          items: [
            {...firstItem, id: 1, language: 'pb'},
            {...firstItem, id: 2, language: 'ea'},
            {...firstItem, id: 3, language: 'me'},
          ],
        },
      },
    });
    expect(hits.map(hit => [hit.siteFileId, hit.languageCode])).toEqual([
      ['1', 'pob'],
      ['2', 'spl'],
    ]);
  });

  it('drops an item in a format the product cannot use', async () => {
    const episodeBody = await readFixture(EPISODE_FIXTURE);
    const [firstItem] = episodeBody.subtitles.items;
    const hits = thesubtitledbMapping.toSearchHits({
      status: StatusCodes.OK,
      headers: {},
      body: {
        subtitles: {
          items: [
            {...firstItem, id: 1, format: 'idx'},
            {...firstItem, id: 2, format: 'sup'},
            {...firstItem, id: 3, format: 'sub'},
          ],
        },
      },
    });
    expect(hits.map(hit => hit.siteFileId)).toEqual(['3']);
  });

  it('drops a malformed item rather than failing', async () => {
    const episodeBody = await readFixture(EPISODE_FIXTURE);
    const [firstItem] = episodeBody.subtitles.items;
    const hits = thesubtitledbMapping.toSearchHits({
      status: StatusCodes.OK,
      headers: {},
      body: {
        subtitles: {
          items: [
            null,
            {...firstItem, id: undefined},
            {...firstItem, id: 0},
            {...firstItem, id: 7, language: 42},
            {...firstItem, id: 8},
          ],
        },
      },
    });
    expect(hits.map(hit => hit.siteFileId)).toEqual(['8']);
  });

  it.each([
    ['an object', {subtitles: {items: {id: 1}}}],
    ['no list', {subtitles: null}],
    ['a text body', 'Not found.'],
  ])('reads %s in place of the item list as no hits', (_, body) => {
    expect(
      thesubtitledbMapping.toSearchHits({
        status: StatusCodes.OK,
        headers: {},
        body,
      }),
    ).toEqual([]);
  });

  it('reads an unknown title as no hits', () => {
    expect(
      thesubtitledbMapping.toSearchHits({
        status: StatusCodes.NOT_FOUND,
        headers: {},
        body: null,
      }),
    ).toEqual([]);
  });
});

describe('thesubtitledbMapping.buildDownloadRequest', () => {
  const subtitleRef = {
    subtitleSource: SubtitleSource.THESUBTITLEDB,
    siteFileId: '42',
    siteFileUrl: null,
    catalogSeason: null,
    catalogEpisode: null,
  };

  it('asks the counted download route for bytes and follows its redirect', () => {
    expect(
      thesubtitledbMapping.buildDownloadRequest(subtitleRef, null),
    ).toEqual(
      expect.objectContaining({
        subtitleSource: SubtitleSource.THESUBTITLEDB,
        url: 'https://api.thesubtitledb.org/get/42',
        method: 'GET',
        headers: {},
        responseType: 'bytes',
        acceptedStatuses: [],
        credentialId: null,
      }),
    );
  });

  it('sends a key and counts the download against it', () => {
    const downloadRequest = thesubtitledbMapping.buildDownloadRequest(
      subtitleRef,
      keyCredential,
    );
    expect(downloadRequest.headers).toEqual({
      Authorization: `Bearer ${API_KEY}`,
    });
    expect(downloadRequest.credentialId).toBe(keyCredential.credentialId);
    expect(downloadRequest.url).not.toContain(API_KEY);
  });
});

describe('thesubtitledbMapping.toDownload', () => {
  const fileBytes = Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nHi\n');

  it('returns the file bytes and the file name the site gives', () => {
    expect(
      thesubtitledbMapping.toDownload({
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

  it('reads an unknown file id as an unavailable source without the key', () => {
    const downloadRequest = thesubtitledbMapping.buildDownloadRequest(
      {siteFileId: '42'},
      keyCredential,
    );
    const error = catchError(() =>
      thesubtitledbMapping.toDownload({
        status: StatusCodes.NOT_FOUND,
        headers: downloadRequest.headers,
        body: null,
      }),
    );
    expect(error).toBeInstanceOf(SourceUnavailableError);
    expect(toErrorText(error)).not.toContain(API_KEY);
  });
});

describe('thesubtitledbMapping.buildCredentialCheckRequest', () => {
  it('asks one known title with the key and reads its rejections itself', () => {
    const checkRequest =
      thesubtitledbMapping.buildCredentialCheckRequest(keyCredential);
    const checkUrl = new URL(checkRequest.url);
    expect(checkUrl.origin).toBe('https://api.thesubtitledb.org');
    expect(checkUrl.pathname).toBe('/v1/by-imdb/tt0133093');
    expect(checkUrl.searchParams.get('limit')).toBe('1');
    expect(checkRequest.url).not.toContain(API_KEY);
    expect(checkRequest).toMatchObject({
      subtitleSource: SubtitleSource.THESUBTITLEDB,
      method: 'GET',
      headers: {Authorization: `Bearer ${API_KEY}`},
      responseType: 'text',
      credentialId: keyCredential.credentialId,
    });
    expect([...checkRequest.acceptedStatuses].sort()).toEqual([
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.TOO_MANY_REQUESTS,
    ]);
  });
});

describe('thesubtitledbMapping.toCredentialCheck', () => {
  it.each([
    [StatusCodes.OK, CredentialStatus.VALID, {subtitles: {items: []}}],
    [StatusCodes.UNAUTHORIZED, CredentialStatus.INVALID, {error: 'bad_key'}],
    [StatusCodes.FORBIDDEN, CredentialStatus.INVALID, '<html>Forbidden</html>'],
    [StatusCodes.TOO_MANY_REQUESTS, CredentialStatus.LIMITED, null],
  ])('reads status %i as %s', (status, credentialStatus, body) => {
    expect(
      thesubtitledbMapping.toCredentialCheck({status, headers: {}, body}),
    ).toEqual({
      credentialStatus,
      quotaRemainingCount: null,
      quotaAllowedCount: null,
      quotaResetAt: null,
    });
  });

  it('reads a missing check title as an unavailable source without the key', () => {
    const checkRequest =
      thesubtitledbMapping.buildCredentialCheckRequest(keyCredential);
    const error = catchError(() =>
      thesubtitledbMapping.toCredentialCheck({
        status: StatusCodes.NOT_FOUND,
        headers: checkRequest.headers,
        body: null,
      }),
    );
    expect(error).toBeInstanceOf(SourceUnavailableError);
    expect(toErrorText(error)).not.toContain(API_KEY);
  });
});
