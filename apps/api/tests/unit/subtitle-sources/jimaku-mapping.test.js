import {inspect} from 'node:util';
import {StatusCodes} from 'http-status-codes';
import {describe, expect, it} from 'vitest';
import {CredentialStatus} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {jimakuMapping} from '../../../src/lib/subtitle-sources/jimaku/jimaku-mapping.js';
import {subtitleSourceHitSchema} from '../../../src/lib/subtitle-sources/subtitle-source-contract.js';
import {
  SourceRateLimitError,
  SourceUnavailableError,
  SubtitleSourceError,
} from '../../../src/lib/subtitle-sources/subtitle-source-errors.js';
import {
  SUBTITLE_SOURCE_RETRY_AFTER_DEFAULT,
  SUBTITLE_SOURCE_RETRY_AFTER_MAX,
  toSubtitleSourceError,
} from '../../../src/lib/subtitle-sources/subtitle-source-request.js';
import {catchError} from '../../helpers/caught-error.js';
import {readFixture} from '../../helpers/read-fixture.js';
import {
  makeSearchQuery,
  makeSubtitleSourceCredential,
} from '../../helpers/subtitle-source-factories.js';

const API_KEY = 'fixture-jimaku-key';
const keyCredential = makeSubtitleSourceCredential({apiKey: API_KEY});
const kitsuEpisodeQuery = makeSearchQuery({
  videoId: 'kitsu:46474:5',
  videoType: 'series',
  imdbId: 'tt22248376',
  kitsuId: '46474',
  catalogSeason: 2,
  catalogEpisode: 1,
  kitsuEpisode: 5,
  languageCodes: ['tur', 'jpn'],
});
const jsonHeaders = {'content-type': 'application/json'};
const rateLimitedResponse = {
  status: StatusCodes.TOO_MANY_REQUESTS,
  headers: {
    ...jsonHeaders,
    'x-ratelimit-limit': '25',
    'x-ratelimit-remaining': '0',
    'x-ratelimit-reset-after': '12.5',
  },
  body: {error: 'Too many requests.', code: 3},
};
const SINGLE_FILE_NAME = '[FixtureSubs] Sousou no Frieren - 05.ass';
const SINGLE_FILE_URL =
  'https://jimaku.cc/entry/1234/download/%5BFixtureSubs%5D%20Sousou%20no%20Frieren%20-%2005.ass';

async function readFilesResponse() {
  return {
    status: StatusCodes.OK,
    headers: jsonHeaders,
    body: await readFixture('subtitle-sources/jimaku/entry-files.json'),
  };
}

describe('jimakuMapping.toSearchTarget', () => {
  it('targets a kitsu video by its Kitsu id and Kitsu episode, not the IMDb episode', () => {
    expect(
      jimakuMapping.toSearchTarget(kitsuEpisodeQuery, keyCredential),
    ).toEqual({kitsuId: '46474', kitsuEpisode: 5});
  });

  it('targets a kitsu movie with no episode', () => {
    expect(
      jimakuMapping.toSearchTarget(
        makeSearchQuery({
          videoId: 'kitsu:46474',
          kitsuId: '46474',
          imdbId: null,
          languageCodes: ['jpn'],
        }),
        keyCredential,
      ),
    ).toEqual({kitsuId: '46474', kitsuEpisode: null});
  });

  it('reads the Kitsu id and episode the query carries, not the video id', () => {
    expect(
      jimakuMapping.toSearchTarget(
        {...kitsuEpisodeQuery, videoId: 'kitsu:46474', kitsuEpisode: 7},
        keyCredential,
      ),
    ).toEqual({kitsuId: '46474', kitsuEpisode: 7});
  });

  it('has no target without a key', () => {
    expect(jimakuMapping.toSearchTarget(kitsuEpisodeQuery, null)).toBeNull();
  });

  it('has no target for a video that is not anime', () => {
    expect(
      jimakuMapping.toSearchTarget(
        makeSearchQuery({
          videoId: 'tt9900001:1:5',
          videoType: 'series',
          imdbId: 'tt9900001',
          catalogSeason: 1,
          catalogEpisode: 5,
          languageCodes: ['jpn'],
        }),
        keyCredential,
      ),
    ).toBeNull();
  });
});

describe('jimakuMapping.buildEntrySearchRequest', () => {
  it('asks the entry of the AniList id with the key in Authorization, counted against the credential', () => {
    const searchRequest = jimakuMapping.buildEntrySearchRequest(
      154587,
      keyCredential,
    );
    const searchUrl = new URL(searchRequest.url);
    expect(searchRequest).toMatchObject({
      subtitleSource: SubtitleSource.JIMAKU,
      method: 'GET',
      headers: {Authorization: API_KEY},
      responseType: 'json',
      acceptedStatuses: [StatusCodes.TOO_MANY_REQUESTS],
      credentialId: keyCredential.credentialId,
    });
    expect(searchUrl.origin).toBe('https://jimaku.cc');
    expect(searchUrl.pathname).toBe('/api/entries/search');
    expect(searchUrl.searchParams.get('anilist_id')).toBe('154587');
  });

  it('sends the key with no Bearer prefix and never in the url', () => {
    const searchRequest = jimakuMapping.buildEntrySearchRequest(
      154587,
      keyCredential,
    );
    expect(searchRequest.headers.Authorization).toBe(API_KEY);
    expect(searchRequest.url).not.toContain(API_KEY);
  });
});

describe('jimakuMapping.toEntryIds', () => {
  it('reads the entry ids of the search answer', async () => {
    expect(
      jimakuMapping.toEntryIds({
        status: StatusCodes.OK,
        headers: jsonHeaders,
        body: await readFixture('subtitle-sources/jimaku/entries-search.json'),
      }),
    ).toEqual([1234]);
  });

  it('answers no entries for an empty search', () => {
    expect(
      jimakuMapping.toEntryIds({
        status: StatusCodes.OK,
        headers: jsonHeaders,
        body: [],
      }),
    ).toEqual([]);
  });

  it('keeps at most three entries', () => {
    expect(
      jimakuMapping.toEntryIds({
        status: StatusCodes.OK,
        headers: jsonHeaders,
        body: [1, 2, 3, 4, 5].map(id => ({id})),
      }),
    ).toEqual([1, 2, 3]);
  });

  it('throws SourceUnavailableError for an answer that is not a list', () => {
    expect(
      catchError(() =>
        jimakuMapping.toEntryIds({
          status: StatusCodes.OK,
          headers: jsonHeaders,
          body: {error: 'changed'},
        }),
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });
});

describe('jimakuMapping.buildFileListRequest', () => {
  it('lists the files of the entry for the Kitsu episode through the docs episode filter', () => {
    const fileListRequest = jimakuMapping.buildFileListRequest(
      1234,
      5,
      keyCredential,
    );
    const fileListUrl = new URL(fileListRequest.url);
    expect(fileListUrl.origin).toBe('https://jimaku.cc');
    expect(fileListUrl.pathname).toBe('/api/entries/1234/files');
    expect(fileListUrl.searchParams.get('episode')).toBe('5');
    expect(fileListRequest).toMatchObject({
      subtitleSource: SubtitleSource.JIMAKU,
      method: 'GET',
      headers: {Authorization: API_KEY},
      responseType: 'json',
      credentialId: keyCredential.credentialId,
    });
  });

  it('lists every file of a movie entry', () => {
    const fileListUrl = new URL(
      jimakuMapping.buildFileListRequest(1234, null, keyCredential).url,
    );
    expect(fileListUrl.searchParams.has('episode')).toBe(false);
  });
});

describe('jimakuMapping.toSearchHits', () => {
  it('maps every subtitle and archive file to a Japanese hit that passes the hit schema', async () => {
    const hits = jimakuMapping.toSearchHits(await readFilesResponse(), 5);
    expect(hits.map(hit => hit.siteFileId)).toEqual([
      `1234/${SINGLE_FILE_NAME}`,
      '1234/Sousou.no.Frieren.S01E05.WEB.ja.srt',
      '1234/[FixtureSubs] Sousou no Frieren (01-28).zip',
    ]);
    for (const hit of hits) {
      expect(subtitleSourceHitSchema.parse(hit)).toBeTruthy();
      expect(hit.languageCode).toBe('jpn');
      expect(hit.subtitleSource).toBe(SubtitleSource.JIMAKU);
    }
  });

  it("maps one file to a full hit that spends no one's quota", async () => {
    const [hit] = jimakuMapping.toSearchHits(await readFilesResponse(), 5);
    expect(hit).toEqual({
      subtitleSource: SubtitleSource.JIMAKU,
      siteFileId: `1234/${SINGLE_FILE_NAME}`,
      languageCode: 'jpn',
      releaseNames: [SINGLE_FILE_NAME],
      fileExtension: 'ass',
      isSitePack: false,
      isHearingImpaired: null,
      isForced: null,
      isMachineTranslated: null,
      isUploaderTrusted: null,
      isQuotaCostly: false,
      siteDownloadCount: null,
      siteFps: null,
      siteFileUrl: SINGLE_FILE_URL,
      siteCueCount: null,
      siteDurationMs: null,
      hashMatchVideoHashes: [],
      subtitleAliases: [],
    });
  });

  it('reads an srt file as srt', async () => {
    const hits = jimakuMapping.toSearchHits(await readFilesResponse(), 5);
    expect(hits[1].fileExtension).toBe('srt');
  });

  it('marks an archive of several episodes as a pack and an episode archive as one file', async () => {
    const packHits = jimakuMapping.toSearchHits(await readFilesResponse(), 5);
    expect(packHits[2].isSitePack).toBe(true);
    const [episodeArchiveHit] = jimakuMapping.toSearchHits(
      {
        status: StatusCodes.OK,
        headers: jsonHeaders,
        body: [
          {
            url: '/entry/1234/download/Sousou%20no%20Frieren%20-%2005.zip',
            name: 'Sousou no Frieren - 05.zip',
            size: 1000,
            last_modified: '2024-03-22T15:04:05Z',
          },
        ],
      },
      5,
    );
    expect(episodeArchiveHit.isSitePack).toBe(false);
  });

  it('drops a file that is neither a subtitle nor an archive', async () => {
    const hits = jimakuMapping.toSearchHits(await readFilesResponse(), 5);
    expect(hits.some(hit => hit.siteFileId.endsWith('.txt'))).toBe(false);
  });

  it('drops a file whose url leaves the site', async () => {
    const hits = jimakuMapping.toSearchHits(await readFilesResponse(), 5);
    expect(hits.some(hit => hit.siteFileId.endsWith('stray.srt'))).toBe(false);
  });

  it('answers no hits for an empty list', () => {
    expect(
      jimakuMapping.toSearchHits(
        {status: StatusCodes.OK, headers: jsonHeaders, body: []},
        5,
      ),
    ).toEqual([]);
  });

  it('answers no hits for an entry that is gone', () => {
    expect(
      jimakuMapping.toSearchHits(
        {status: StatusCodes.NOT_FOUND, headers: jsonHeaders, body: null},
        5,
      ),
    ).toEqual([]);
  });

  it('throws SourceUnavailableError for a file list that is not a list', () => {
    expect(
      catchError(() =>
        jimakuMapping.toSearchHits(
          {status: StatusCodes.OK, headers: jsonHeaders, body: {files: []}},
          5,
        ),
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });
});

describe('jimakuMapping.buildDownloadRequest', () => {
  const subtitleRef = {
    subtitleSource: SubtitleSource.JIMAKU,
    siteFileId: `1234/${SINGLE_FILE_NAME}`,
    siteFileUrl: 'https://elsewhere.example/stolen.ass',
    catalogSeason: 2,
    catalogEpisode: 1,
  };

  it('downloads the public file from the site path rebuilt from the file id, without the key and counted against no credential', () => {
    const downloadRequest = jimakuMapping.buildDownloadRequest(
      subtitleRef,
      keyCredential,
    );
    expect(downloadRequest).toMatchObject({
      subtitleSource: SubtitleSource.JIMAKU,
      url: SINGLE_FILE_URL,
      method: 'GET',
      headers: {},
      responseType: 'bytes',
      credentialId: null,
    });
    expect(JSON.stringify(downloadRequest)).not.toContain(API_KEY);
  });

  it('downloads the same public file without any key', () => {
    expect(jimakuMapping.buildDownloadRequest(subtitleRef, null)).toEqual(
      jimakuMapping.buildDownloadRequest(subtitleRef, keyCredential),
    );
  });

  it('refuses a file id that names no entry', () => {
    expect(
      catchError(() =>
        jimakuMapping.buildDownloadRequest(
          {...subtitleRef, siteFileId: 'no-entry.ass'},
          keyCredential,
        ),
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });
});

describe('jimakuMapping.toDownload', () => {
  const subtitleRef = {
    subtitleSource: SubtitleSource.JIMAKU,
    siteFileId: `1234/${SINGLE_FILE_NAME}`,
    siteFileUrl: SINGLE_FILE_URL,
    catalogSeason: 2,
    catalogEpisode: 1,
  };

  it('returns the bytes with the file name as the hint', () => {
    const fileBytes = new TextEncoder().encode('[Script Info]\n');
    expect(
      jimakuMapping.toDownload(
        {
          status: StatusCodes.OK,
          headers: {'content-type': 'application/octet-stream'},
          body: fileBytes,
        },
        subtitleRef,
      ),
    ).toEqual({
      fileBytes,
      fileNameHint: SINGLE_FILE_NAME,
      extractedEntryPath: null,
    });
  });

  it('throws for a file that is gone', () => {
    expect(
      catchError(() =>
        jimakuMapping.toDownload(
          {status: StatusCodes.NOT_FOUND, headers: {}, body: null},
          subtitleRef,
        ),
      ),
    ).toBeInstanceOf(SubtitleSourceError);
  });

  it('throws SourceUnavailableError for an error page in place of the file', () => {
    expect(
      catchError(() =>
        jimakuMapping.toDownload(
          {
            status: StatusCodes.OK,
            headers: {'content-type': 'text/html; charset=utf-8'},
            body: new TextEncoder().encode('<html></html>'),
          },
          subtitleRef,
        ),
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });
});

describe('jimakuMapping credential check', () => {
  it('makes one cheap keyed search, letting the transport map 401 and 403 to the key and reading 429 itself', () => {
    const checkRequest =
      jimakuMapping.buildCredentialCheckRequest(keyCredential);
    expect(new URL(checkRequest.url).pathname).toBe('/api/entries/search');
    expect(checkRequest).toMatchObject({
      headers: {Authorization: API_KEY},
      acceptedStatuses: [StatusCodes.TOO_MANY_REQUESTS],
      credentialId: keyCredential.credentialId,
    });
  });

  it("leaves the key unchecked when the server's shared address is rate limited", () => {
    const checkError = catchError(() =>
      jimakuMapping.toCredentialCheck(rateLimitedResponse),
    );
    expect(checkError).toBeInstanceOf(SourceRateLimitError);
    expect(checkError.credentialId).toBeNull();
  });

  it('reads a list answer as a valid key', () => {
    expect(
      jimakuMapping.toCredentialCheck({
        status: StatusCodes.OK,
        headers: jsonHeaders,
        body: [],
      }),
    ).toEqual({
      credentialStatus: CredentialStatus.VALID,
      quotaRemainingCount: null,
      quotaAllowedCount: null,
      quotaResetAt: null,
    });
  });

  it('leaves the key unchecked for an answer that is not a list', () => {
    expect(
      catchError(() =>
        jimakuMapping.toCredentialCheck({
          status: StatusCodes.OK,
          headers: jsonHeaders,
          body: {changed: true},
        }),
      ),
    ).toBeInstanceOf(SourceUnavailableError);
    expect(
      catchError(() =>
        jimakuMapping.toCredentialCheck({
          status: StatusCodes.NOT_FOUND,
          headers: {},
          body: null,
        }),
      ),
    ).toBeInstanceOf(SubtitleSourceError);
  });
});

describe('jimaku shared-address rate limit', () => {
  const subtitleRef = {
    subtitleSource: SubtitleSource.JIMAKU,
    siteFileId: '1234/Sousou.no.Frieren.S01E05.WEB.ja.srt',
    siteFileUrl: null,
    catalogSeason: 2,
    catalogEpisode: 1,
  };

  it('lets every site call read a 429 itself', () => {
    for (const siteRequest of [
      jimakuMapping.buildEntrySearchRequest(154587, keyCredential),
      jimakuMapping.buildFileListRequest(1234, 5, keyCredential),
      jimakuMapping.buildDownloadRequest(subtitleRef, keyCredential),
      jimakuMapping.buildCredentialCheckRequest(keyCredential),
    ]) {
      expect(siteRequest.acceptedStatuses).toEqual([
        StatusCodes.TOO_MANY_REQUESTS,
      ]);
    }
  });

  it.each([
    ['the entry search', () => jimakuMapping.toEntryIds(rateLimitedResponse)],
    ['the file list', () => jimakuMapping.toSearchHits(rateLimitedResponse, 5)],
    [
      'the download',
      () => jimakuMapping.toDownload(rateLimitedResponse, subtitleRef),
    ],
  ])(
    'reads a 429 on %s as the source rate limit, never the key',
    (unused, readResponse) => {
      const rateLimitError = catchError(readResponse);
      expect(rateLimitError).toBeInstanceOf(SourceRateLimitError);
      expect(rateLimitError.subtitleSource).toBe(SubtitleSource.JIMAKU);
      expect(rateLimitError.credentialId).toBeNull();
    },
  );

  it('waits as long as the site says before the limit resets', () => {
    expect(
      catchError(() => jimakuMapping.toEntryIds(rateLimitedResponse))
        .retryAfterMs,
    ).toBe(12500);
  });

  it('falls back to the shared wait, still never the key, when the site gives no reset time', () => {
    const rateLimitError = catchError(() =>
      jimakuMapping.toEntryIds({
        ...rateLimitedResponse,
        headers: jsonHeaders,
      }),
    );
    expect(rateLimitError).toBeInstanceOf(SourceRateLimitError);
    expect(rateLimitError.credentialId).toBeNull();
    expect(rateLimitError.retryAfterMs).toBe(
      SUBTITLE_SOURCE_RETRY_AFTER_DEFAULT,
    );
  });

  it.each(['0', '0.0'])(
    'falls back to the shared wait for a reset time of %s',
    resetAfter => {
      expect(
        catchError(() =>
          jimakuMapping.toEntryIds({
            ...rateLimitedResponse,
            headers: {
              ...rateLimitedResponse.headers,
              'x-ratelimit-reset-after': resetAfter,
            },
          }),
        ).retryAfterMs,
      ).toBe(SUBTITLE_SOURCE_RETRY_AFTER_DEFAULT);
    },
  );

  it('caps a reset time longer than the shared maximum', () => {
    expect(
      catchError(() =>
        jimakuMapping.toEntryIds({
          ...rateLimitedResponse,
          headers: {
            ...rateLimitedResponse.headers,
            'x-ratelimit-reset-after': String(
              SUBTITLE_SOURCE_RETRY_AFTER_MAX / 1000 + 60,
            ),
          },
        }),
      ).retryAfterMs,
    ).toBe(SUBTITLE_SOURCE_RETRY_AFTER_MAX);
  });
});

describe('jimaku key privacy', () => {
  it('keeps the key out of an error built from a transport error that carries the request headers', () => {
    const transportError = Object.assign(new Error('socket hang up'), {
      code: 'ECONNRESET',
      config: {
        url: 'https://jimaku.cc/api/entries/search?anilist_id=154587',
        headers: {Authorization: API_KEY},
      },
      request: {headers: {authorization: API_KEY}},
    });
    const sourceError = toSubtitleSourceError(transportError, {
      subtitleSource: SubtitleSource.JIMAKU,
    });
    expect(sourceError).toBeInstanceOf(SourceUnavailableError);
    expect(inspect(sourceError, {depth: null})).not.toContain(API_KEY);
    expect(JSON.stringify(sourceError)).not.toContain(API_KEY);
  });

  it('keeps the key out of every hit', async () => {
    const hits = jimakuMapping.toSearchHits(await readFilesResponse(), 5);
    expect(JSON.stringify(hits)).not.toContain(API_KEY);
  });
});
