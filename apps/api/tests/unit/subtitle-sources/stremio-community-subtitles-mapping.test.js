import {MaxiosRequestError} from '@mepkg/maxios';
import {StatusCodes} from 'http-status-codes';
import {describe, expect, it} from 'vitest';
import {
  CredentialKind,
  CredentialStatus,
} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {stremioCommunitySubtitlesMapping} from '../../../src/lib/subtitle-sources/stremio-community-subtitles/stremio-community-subtitles-mapping.js';
import {subtitleSourceHitSchema} from '../../../src/lib/subtitle-sources/subtitle-source-contract.js';
import {
  SourceCredentialError,
  SourceUnavailableError,
  SubtitleSourceError,
} from '../../../src/lib/subtitle-sources/subtitle-source-errors.js';
import {
  readSubtitleSourceResponse,
  toSubtitleSourceError,
} from '../../../src/lib/subtitle-sources/subtitle-source-request.js';
import {readFixture} from '../../helpers/read-fixture.js';
import {
  makeSearchQuery,
  makeSubtitleSourceCredential,
} from '../../helpers/subtitle-source-factories.js';

const SITE_URL = 'https://stremio-community-subtitles.top';
const ACCESS_TOKEN = 'scs-fixture_token-0001-abcdEFGH';
const OTHER_ACCESS_TOKEN = 'scs-other_token-0002-ijklMNOP';
const SUBTITLES_FIXTURE =
  'subtitle-sources/stremio-community-subtitles/subtitles.json';
const ENG_PAYLOAD =
  'eyJjb250ZW50X3R5cGUiOiJtb3ZpZSIsImNvbnRlbnRfaWQiOiJ0dDAxMTExNjEiLCJsYW5nIjoiZW5nIiwidl9oYXNoIjpudWxsLCJ2X3NpemUiOm51bGwsInZfZm5hbWUiOm51bGx9';
const FRA_PAYLOAD =
  'eyJjb250ZW50X3R5cGUiOiJtb3ZpZSIsImNvbnRlbnRfaWQiOiJ0dDAxMTExNjEiLCJsYW5nIjoiZnJhIiwidl9oYXNoIjpudWxsLCJ2X3NpemUiOm51bGwsInZfZm5hbWUiOm51bGx9';
const VIDEO_HASH = '8e245d9679d31e12';
const PLACEHOLDER_MESSAGES = [
  'SCS: No Subtitles Found: Upload your own through the web interface.',
  'SCS: Fixture Provider timeout. The service is slow or unavailable, try again later.',
];
const tokenCredential = makeSubtitleSourceCredential({
  credentialKind: CredentialKind.ACCESS_TOKEN,
  apiKey: undefined,
  accessToken: ACCESS_TOKEN,
});
const movieQuery = makeSearchQuery({languageCodes: ['eng', 'fre']});
const episodeQuery = makeSearchQuery({
  videoId: 'tt0877057:1:1',
  videoType: 'series',
  imdbId: 'tt0877057',
  catalogSeason: 1,
  catalogEpisode: 1,
  languageCodes: ['tur'],
});

function toSiteUrl(sitePath) {
  return `${SITE_URL}${sitePath}`;
}

function readExtras(searchUrl) {
  const pathSegments = new URL(searchUrl).pathname.split('/');
  const extraSegment = pathSegments.at(-1);
  expect(extraSegment).toMatch(/\.json$/);
  return new URLSearchParams(extraSegment.replace(/\.json$/, ''));
}

function readSearchPath(searchUrl) {
  return new URL(searchUrl).pathname.split('/').slice(0, -1).join('/');
}

function toSubtitlesResponse(body) {
  return {
    status: StatusCodes.OK,
    headers: {'content-type': 'application/json'},
    body,
  };
}

async function readHits(searchQuery = movieQuery) {
  return stremioCommunitySubtitlesMapping.toSearchHits(
    toSubtitlesResponse(await readFixture(SUBTITLES_FIXTURE)),
    searchQuery,
  );
}

function toHitsOf(siteSubtitles, searchQuery = movieQuery) {
  return stremioCommunitySubtitlesMapping.toSearchHits(
    toSubtitlesResponse({subtitles: siteSubtitles}),
    searchQuery,
  );
}

function toSiteSubtitle(overrides = {}) {
  return {
    id: 'Fixture.Release_eng',
    url: toSiteUrl(`/${ACCESS_TOKEN}/download/${ENG_PAYLOAD}.vtt`),
    lang: 'eng',
    ...overrides,
  };
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

function toSubtitleRef(siteFileId) {
  return {
    subtitleSource: SubtitleSource.STREMIO_COMMUNITY_SUBTITLES,
    siteFileId,
    siteFileUrl: null,
    catalogSeason: null,
    catalogEpisode: null,
  };
}

function toFileResponse(fileText, contentType, status = StatusCodes.OK) {
  return {
    status,
    headers: {'content-type': contentType},
    body: new TextEncoder().encode(fileText),
  };
}

function toPlaceholderVtt(message) {
  return `WEBVTT\n\n00:00:00.000 --> 00:00:08.000\n${message}`;
}

describe('stremioCommunitySubtitlesMapping.buildSearchRequest', () => {
  it("asks for a movie under the user's own token", () => {
    const searchRequest = stremioCommunitySubtitlesMapping.buildSearchRequest(
      movieQuery,
      tokenCredential,
    );
    expect(searchRequest).toEqual({
      subtitleSource: SubtitleSource.STREMIO_COMMUNITY_SUBTITLES,
      url: expect.any(String),
      method: 'GET',
      headers: {},
      responseType: 'json',
      acceptedStatuses: [],
      credentialId: tokenCredential.credentialId,
    });
    expect(readSearchPath(searchRequest.url)).toBe(
      `/${ACCESS_TOKEN}/subtitles/movie/tt0111161`,
    );
    expect(searchRequest.url.startsWith(`${SITE_URL}/`)).toBe(true);
  });

  it('asks for one episode by its imdb video id', () => {
    expect(
      readSearchPath(
        stremioCommunitySubtitlesMapping.buildSearchRequest(
          episodeQuery,
          tokenCredential,
        ).url,
      ),
    ).toBe(`/${ACCESS_TOKEN}/subtitles/series/tt0877057:1:1`);
  });

  it('asks for an anime episode by its kitsu video id', () => {
    expect(
      readSearchPath(
        stremioCommunitySubtitlesMapping.buildSearchRequest(
          makeSearchQuery({
            videoId: 'kitsu:7442:5',
            videoType: 'series',
            imdbId: null,
            kitsuId: '7442',
            catalogSeason: 1,
            catalogEpisode: 5,
          }),
          tokenCredential,
        ).url,
      ),
    ).toBe(`/${ACCESS_TOKEN}/subtitles/series/kitsu:7442:5`);
  });

  it("sends the asked languages in the site's ISO 639-2/T codes", () => {
    const extras = readExtras(
      stremioCommunitySubtitlesMapping.buildSearchRequest(
        {...movieQuery, languageCodes: ['fre', 'ger', 'tur', 'pob']},
        tokenCredential,
      ).url,
    );
    expect(extras.get('langs')).toBe('fra,deu,tur,pob');
  });

  it('sends no video extras when the query has none', () => {
    const extras = readExtras(
      stremioCommunitySubtitlesMapping.buildSearchRequest(
        movieQuery,
        tokenCredential,
      ).url,
    );
    expect([...extras.keys()]).toEqual(['langs']);
  });

  it('sends the video hash, size and file name as extras', () => {
    const extras = readExtras(
      stremioCommunitySubtitlesMapping.buildSearchRequest(
        {
          ...movieQuery,
          videoHash: VIDEO_HASH,
          videoSizeBytes: 12909756,
          videoFilename: 'Fixture.Movie.1994.1080p.BluRay.x264-GROUP.mkv',
        },
        tokenCredential,
      ).url,
    );
    expect(Object.fromEntries(extras)).toEqual({
      videoHash: VIDEO_HASH,
      videoSize: '12909756',
      filename: 'Fixture.Movie.1994.1080p.BluRay.x264-GROUP.mkv',
      langs: 'eng,fra',
    });
  });

  it('keeps a file name with path and query characters inside one path segment', () => {
    const videoFilename = 'Fixture Movie/1994 & Co?#=.mkv';
    const searchUrl = stremioCommunitySubtitlesMapping.buildSearchRequest(
      {...movieQuery, videoFilename},
      tokenCredential,
    ).url;
    const {pathname, search, hash} = new URL(searchUrl);
    expect(search).toBe('');
    expect(hash).toBe('');
    expect(pathname.split('/')).toHaveLength(6);
    expect(readExtras(searchUrl).get('filename')).toBe(videoFilename);
  });

  it('asks nothing without a credential', () => {
    expect(
      stremioCommunitySubtitlesMapping.buildSearchRequest(movieQuery, null),
    ).toBeNull();
  });

  it('asks nothing for a credential without a token', () => {
    expect(
      stremioCommunitySubtitlesMapping.buildSearchRequest(movieQuery, {
        ...tokenCredential,
        accessToken: '',
      }),
    ).toBeNull();
  });

  it('asks nothing for a series query without its episode', () => {
    expect(
      stremioCommunitySubtitlesMapping.buildSearchRequest(
        {...episodeQuery, videoId: 'tt0877057', catalogEpisode: null},
        tokenCredential,
      ),
    ).toBeNull();
  });

  it('asks nothing for a video id made of dots', () => {
    for (const videoId of ['.', '..', 'tt0111161:..']) {
      expect(
        stremioCommunitySubtitlesMapping.buildSearchRequest(
          {...movieQuery, videoId},
          tokenCredential,
        ),
      ).toBeNull();
    }
  });
});

describe('stremioCommunitySubtitlesMapping.toSearchHits', () => {
  it('maps a VTT row to an srt hit keyed by its download tail', async () => {
    const hits = await readHits();
    expect(hits).toContainEqual({
      subtitleSource: SubtitleSource.STREMIO_COMMUNITY_SUBTITLES,
      siteFileId: `${ENG_PAYLOAD}.vtt`,
      languageCode: 'eng',
      releaseNames: ['Fixture.Movie.1994.1080p.BluRay.x264-GROUP_eng'],
      fileExtension: 'srt',
      isSitePack: false,
      isHearingImpaired: null,
      isForced: null,
      isMachineTranslated: null,
      isUploaderTrusted: null,
      isQuotaCostly: true,
      siteDownloadCount: null,
      siteFps: null,
      siteFileUrl: null,
      siteCueCount: null,
      siteDurationMs: null,
      hashMatchVideoHashes: [],
      subtitleAliases: [],
    });
  });

  it('maps an ASS twin to an ass hit', async () => {
    const hits = await readHits();
    expect(hits.find(hit => hit.siteFileId === `${ENG_PAYLOAD}.ass`)).toEqual(
      expect.objectContaining({
        fileExtension: 'ass',
        releaseNames: ['Fixture.Movie.1994.1080p.BluRay.x264-GROUP_eng_ass'],
      }),
    );
  });

  it("maps the site's ISO 639-2/T code to ours", async () => {
    const hits = await readHits();
    expect(hits.find(hit => hit.siteFileId === `${FRA_PAYLOAD}.srt`)).toEqual(
      expect.objectContaining({languageCode: 'fre', fileExtension: 'srt'}),
    );
  });

  it('drops a row whose language does not map', async () => {
    const hits = await readHits();
    expect(hits).toHaveLength(3);
    expect(hits.map(hit => hit.languageCode)).not.toContain('xxx');
  });

  it('passes every hit through the hit schema', async () => {
    for (const hit of await readHits()) {
      expect(subtitleSourceHitSchema.safeParse(hit).success).toBe(true);
    }
  });

  it('keeps no token in any hit', async () => {
    expect(JSON.stringify(await readHits())).not.toContain(ACCESS_TOKEN);
  });

  it('maps a .sub row to an srt hit', () => {
    expect(
      toHitsOf([
        toSiteSubtitle({
          url: toSiteUrl(`/${ACCESS_TOKEN}/download/${ENG_PAYLOAD}.sub`),
        }),
      ]),
    ).toEqual([
      expect.objectContaining({
        siteFileId: `${ENG_PAYLOAD}.sub`,
        fileExtension: 'srt',
      }),
    ]);
  });

  it('drops a row of a language the query did not ask', () => {
    expect(toHitsOf([toSiteSubtitle({lang: 'tur'})])).toEqual([]);
  });

  it('drops a row whose url is on another host', () => {
    expect(
      toHitsOf([
        toSiteSubtitle({
          url: `https://example.com/${ACCESS_TOKEN}/download/${ENG_PAYLOAD}.vtt`,
        }),
      ]),
    ).toEqual([]);
  });

  it('drops a row whose url is not a download link', () => {
    expect(
      toHitsOf([
        toSiteSubtitle({
          url: toSiteUrl(`/${ACCESS_TOKEN}/subtitles/movie/tt0111161.json`),
        }),
        toSiteSubtitle({
          url: toSiteUrl(`/${ACCESS_TOKEN}/download/${ENG_PAYLOAD}.exe`),
        }),
        toSiteSubtitle({
          url: toSiteUrl(`/${ACCESS_TOKEN}/download/not+base64.vtt`),
        }),
        toSiteSubtitle({url: null}),
      ]),
    ).toEqual([]);
  });

  it('drops a row whose download tail is longer than a site file id may be', () => {
    expect(
      toHitsOf([
        toSiteSubtitle({
          url: toSiteUrl(`/${ACCESS_TOKEN}/download/${'a'.repeat(520)}.vtt`),
        }),
      ]),
    ).toEqual([]);
  });

  it('reads an empty subtitle list as no hits', () => {
    expect(
      stremioCommunitySubtitlesMapping.toSearchHits(
        toSubtitlesResponse({subtitles: []}),
        movieQuery,
      ),
    ).toEqual([]);
  });

  it('reads a body without a subtitle list as no hits', () => {
    for (const body of [null, {}, {subtitles: 'none'}]) {
      expect(
        stremioCommunitySubtitlesMapping.toSearchHits(
          toSubtitlesResponse(body),
          movieQuery,
        ),
      ).toEqual([]);
    }
  });
});

describe('stremioCommunitySubtitlesMapping.buildDownloadRequest', () => {
  it("rebuilds the download link with the downloading user's token", () => {
    expect(
      stremioCommunitySubtitlesMapping.buildDownloadRequest(
        toSubtitleRef(`${ENG_PAYLOAD}.vtt`),
        tokenCredential,
      ),
    ).toEqual({
      subtitleSource: SubtitleSource.STREMIO_COMMUNITY_SUBTITLES,
      url: toSiteUrl(`/${ACCESS_TOKEN}/download/${ENG_PAYLOAD}.vtt`),
      method: 'GET',
      headers: {},
      responseType: 'bytes',
      acceptedStatuses: [StatusCodes.FORBIDDEN],
      credentialId: tokenCredential.credentialId,
    });
  });

  it('uses whichever token downloads, not the one that searched', () => {
    const otherCredential = makeSubtitleSourceCredential({
      credentialKind: CredentialKind.ACCESS_TOKEN,
      apiKey: undefined,
      accessToken: OTHER_ACCESS_TOKEN,
    });
    const downloadRequest =
      stremioCommunitySubtitlesMapping.buildDownloadRequest(
        toSubtitleRef(`${ENG_PAYLOAD}.ass`),
        otherCredential,
      );
    expect(downloadRequest.url).toBe(
      toSiteUrl(`/${OTHER_ACCESS_TOKEN}/download/${ENG_PAYLOAD}.ass`),
    );
    expect(downloadRequest.credentialId).toBe(otherCredential.credentialId);
  });

  it('refuses a stored site file id that is not a download tail, without the token', () => {
    for (const siteFileId of [
      '../manifest.json',
      `${ENG_PAYLOAD}/x.vtt`,
      `${ENG_PAYLOAD}.exe`,
      `${ENG_PAYLOAD}.vtt?x=1`,
      ENG_PAYLOAD,
    ]) {
      const error = catchError(() =>
        stremioCommunitySubtitlesMapping.buildDownloadRequest(
          toSubtitleRef(siteFileId),
          tokenCredential,
        ),
      );
      expect(error).toBeInstanceOf(SourceUnavailableError);
      expect(toErrorText(error)).not.toContain(ACCESS_TOKEN);
    }
  });

  it('refuses a download without a token', () => {
    const error = catchError(() =>
      stremioCommunitySubtitlesMapping.buildDownloadRequest(
        toSubtitleRef(`${ENG_PAYLOAD}.vtt`),
        null,
      ),
    );
    expect(error).toBeInstanceOf(SubtitleSourceError);
  });
});

describe('stremioCommunitySubtitlesMapping.toDownload', () => {
  it('returns a VTT file with a .vtt name hint', () => {
    const fileText = 'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHello there.';
    const download = stremioCommunitySubtitlesMapping.toDownload(
      toFileResponse(fileText, 'text/vtt; charset=utf-8'),
    );
    expect(new TextDecoder().decode(download.fileBytes)).toBe(fileText);
    expect(download.fileNameHint).toMatch(/\.vtt$/);
    expect(download.extractedEntryPath).toBeNull();
  });

  it('names an ASS file by the served content, not the asked suffix', () => {
    const download = stremioCommunitySubtitlesMapping.toDownload(
      toFileResponse('[Script Info]\nScriptType: v4.00+\n', 'text/x-ssa'),
    );
    expect(download.fileNameHint).toMatch(/\.ass$/);
  });

  it('keeps no token in the name hint', () => {
    const download = stremioCommunitySubtitlesMapping.toDownload(
      toFileResponse('WEBVTT\n\n', 'text/vtt'),
    );
    expect(String(download.fileNameHint)).not.toContain(ACCESS_TOKEN);
  });

  it('reads an SCS placeholder as no file', () => {
    for (const message of PLACEHOLDER_MESSAGES) {
      const error = catchError(() =>
        stremioCommunitySubtitlesMapping.toDownload(
          toFileResponse(toPlaceholderVtt(message), 'text/vtt'),
        ),
      );
      expect(error).toBeInstanceOf(SourceUnavailableError);
    }
  });

  it('keeps a real subtitle that mentions SCS after its first cue', () => {
    const fileText =
      'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHello there.\n\n00:00:04.000 --> 00:00:06.000\nSCS: a line of dialogue.';
    const download = stremioCommunitySubtitlesMapping.toDownload(
      toFileResponse(fileText, 'text/vtt'),
    );
    expect(new TextDecoder().decode(download.fileBytes)).toBe(fileText);
  });

  it('reads a missing file as an unavailable source', () => {
    const error = catchError(() =>
      stremioCommunitySubtitlesMapping.toDownload({
        status: StatusCodes.NOT_FOUND,
        headers: {},
        body: null,
      }),
    );
    expect(error).toBeInstanceOf(SourceUnavailableError);
  });

  it("reads the site's own token refusal as a rejected credential", () => {
    const error = catchError(() =>
      stremioCommunitySubtitlesMapping.toDownload(
        toFileResponse(
          toPlaceholderVtt('Invalid Access Token'),
          'text/vtt',
          StatusCodes.FORBIDDEN,
        ),
        tokenCredential,
      ),
    );
    expect(error).toBeInstanceOf(SourceCredentialError);
    expect(error.credentialId).toBe(tokenCredential.credentialId);
    expect(toErrorText(error)).not.toContain(ACCESS_TOKEN);
  });

  it('reads another 403 as an unavailable source, not a rejected token', () => {
    const error = catchError(() =>
      stremioCommunitySubtitlesMapping.toDownload(
        toFileResponse(
          '<html>Forbidden</html>',
          'text/html',
          StatusCodes.FORBIDDEN,
        ),
        tokenCredential,
      ),
    );
    expect(error).toBeInstanceOf(SourceUnavailableError);
    expect(error).not.toBeInstanceOf(SourceCredentialError);
  });
});

describe('stremioCommunitySubtitlesMapping.buildCredentialCheckRequest', () => {
  it('probes the download route, not the manifest', () => {
    const checkRequest =
      stremioCommunitySubtitlesMapping.buildCredentialCheckRequest(
        tokenCredential,
      );
    expect(
      checkRequest.url.startsWith(toSiteUrl(`/${ACCESS_TOKEN}/download/`)),
    ).toBe(true);
    expect(checkRequest.url).not.toContain('manifest.json');
    expect(checkRequest).toEqual(
      expect.objectContaining({
        subtitleSource: SubtitleSource.STREMIO_COMMUNITY_SUBTITLES,
        method: 'GET',
        headers: {},
        credentialId: tokenCredential.credentialId,
      }),
    );
  });

  it('accepts the 400 and 403 answers as plain text', () => {
    const checkRequest =
      stremioCommunitySubtitlesMapping.buildCredentialCheckRequest(
        tokenCredential,
      );
    expect(checkRequest.acceptedStatuses).toEqual(
      expect.arrayContaining([StatusCodes.BAD_REQUEST, StatusCodes.FORBIDDEN]),
    );
    expect(checkRequest.responseType).not.toBe('json');
  });
});

describe('stremioCommunitySubtitlesMapping.toCredentialCheck', () => {
  it('reads a 400 bad-link answer as a valid token', () => {
    expect(
      stremioCommunitySubtitlesMapping.toCredentialCheck({
        status: StatusCodes.BAD_REQUEST,
        headers: {'content-type': 'text/plain'},
        body: 'Invalid download link.',
      }),
    ).toEqual({
      credentialStatus: CredentialStatus.VALID,
      quotaRemainingCount: null,
      quotaAllowedCount: null,
      quotaResetAt: null,
    });
  });

  it('reads a 403 answer as an invalid token', () => {
    expect(
      stremioCommunitySubtitlesMapping.toCredentialCheck({
        status: StatusCodes.FORBIDDEN,
        headers: {'content-type': 'text/vtt'},
        body: toPlaceholderVtt('Invalid Access Token'),
      }),
    ).toEqual({
      credentialStatus: CredentialStatus.INVALID,
      quotaRemainingCount: null,
      quotaAllowedCount: null,
      quotaResetAt: null,
    });
  });

  it('never reads another answer as a valid token', () => {
    for (const status of [StatusCodes.OK, StatusCodes.NOT_FOUND]) {
      let credentialCheck = null;
      const error = catchError(() => {
        credentialCheck = stremioCommunitySubtitlesMapping.toCredentialCheck({
          status,
          headers: {'content-type': 'text/vtt'},
          body: 'WEBVTT\n\n',
        });
      });
      expect(credentialCheck?.credentialStatus).not.toBe(
        CredentialStatus.VALID,
      );
      if (error) {
        expect(error).toBeInstanceOf(SourceUnavailableError);
        expect(error).not.toBeInstanceOf(SourceCredentialError);
      }
    }
  });

  it("reads a 400 or 403 without the site's own message as an unavailable source", () => {
    for (const status of [StatusCodes.BAD_REQUEST, StatusCodes.FORBIDDEN]) {
      const error = catchError(() =>
        stremioCommunitySubtitlesMapping.toCredentialCheck({
          status,
          headers: {'content-type': 'text/html'},
          body: '<html>Blocked by the edge.</html>',
        }),
      );
      expect(error).toBeInstanceOf(SourceUnavailableError);
    }
  });
});

describe('stremioCommunitySubtitlesMapping extras encoding', () => {
  it('encodes each extra value so a file name cannot add or replace a parameter', () => {
    const videoFilename = 'a&langs=xxx&videoHash=evil =.mkv';
    const searchUrl = stremioCommunitySubtitlesMapping.buildSearchRequest(
      {...movieQuery, videoHash: VIDEO_HASH, videoFilename},
      tokenCredential,
    ).url;
    const extras = readExtras(searchUrl);
    expect([...extras.keys()].toSorted()).toEqual([
      'filename',
      'langs',
      'videoHash',
    ]);
    expect(extras.getAll('langs')).toEqual(['eng,fra']);
    expect(extras.getAll('videoHash')).toEqual([VIDEO_HASH]);
    expect(extras.get('filename')).toBe(videoFilename);
    expect(new URL(searchUrl).search).toBe('');
  });
});

describe('Community Subtitles token privacy at the transport', () => {
  const searchUrl = stremioCommunitySubtitlesMapping.buildSearchRequest(
    movieQuery,
    tokenCredential,
  ).url;

  it('keeps no token from a transport error that carries the request url', () => {
    const transportError = new MaxiosRequestError(
      `connect ECONNRESET ${searchUrl}`,
      {code: 'ECONNRESET', cause: new Error(`GET ${searchUrl}`)},
    );
    transportError.config = {url: searchUrl};
    const error = toSubtitleSourceError(transportError, {
      subtitleSource: SubtitleSource.STREMIO_COMMUNITY_SUBTITLES,
    });
    expect(error).toBeInstanceOf(SourceUnavailableError);
    expect(error.name).not.toContain(ACCESS_TOKEN);
    expect(toErrorText(error)).not.toContain(ACCESS_TOKEN);
  });

  it('keeps no token from a status error whose body echoes the url', () => {
    for (const status of [
      StatusCodes.FORBIDDEN,
      StatusCodes.INTERNAL_SERVER_ERROR,
    ]) {
      const error = catchError(() =>
        readSubtitleSourceResponse(
          {status, headers: {}, data: new TextEncoder().encode(searchUrl)},
          {
            subtitleSource: SubtitleSource.STREMIO_COMMUNITY_SUBTITLES,
            credentialId: tokenCredential.credentialId,
          },
        ),
      );
      expect(error).toBeInstanceOf(SubtitleSourceError);
      expect(toErrorText(error)).not.toContain(ACCESS_TOKEN);
    }
  });
});
