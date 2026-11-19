import {StatusCodes} from 'http-status-codes';
import {describe, expect, it} from 'vitest';
import {
  CredentialKind,
  CredentialStatus,
} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {anisubMapping} from '../../../src/lib/subtitle-sources/anisub/anisub-mapping.js';
import {subtitleSourceHitSchema} from '../../../src/lib/subtitle-sources/subtitle-source-contract.js';
import {
  SourceCredentialError,
  SourceUnavailableError,
} from '../../../src/lib/subtitle-sources/subtitle-source-errors.js';
import {readFixture} from '../../helpers/read-fixture.js';
import {
  makeSearchQuery,
  makeSubtitleSourceCredential,
} from '../../helpers/subtitle-source-factories.js';

const ACCESS_TOKEN = '7|anisubfixturetoken';
const ADDON_FIXTURE = 'subtitle-sources/anisub/addon-subtitles.json';
const ME_FIXTURE = 'subtitle-sources/anisub/me.json';
const USAGE_STATS_FIXTURE = 'subtitle-sources/anisub/usage-stats.json';
const INTEGRATION_DOWNLOAD_FIXTURE =
  'subtitle-sources/anisub/integration-download.json';
const FILE_URL = 'https://anisub.co/stremio/file/sub-71001.srt';
const tokenCredential = makeSubtitleSourceCredential({
  credentialKind: CredentialKind.ACCESS_TOKEN,
  apiKey: undefined,
  accessToken: ACCESS_TOKEN,
});
const episodeQuery = makeSearchQuery({
  videoId: 'tt0877057:1:1',
  videoType: 'series',
  imdbId: 'tt0877057',
  catalogSeason: 1,
  catalogEpisode: 1,
  languageCodes: ['tur', 'eng'],
});
const subtitleRef = {
  subtitleSource: SubtitleSource.ANISUB,
  siteFileId: 'sub-71001',
  siteFileUrl: FILE_URL,
  catalogSeason: 1,
  catalogEpisode: 1,
};

async function readHits(searchQuery = episodeQuery) {
  return anisubMapping.toSearchHits(
    {
      status: StatusCodes.OK,
      headers: {'content-type': 'application/json'},
      body: await readFixture(ADDON_FIXTURE),
    },
    searchQuery,
  );
}

async function readAddonRows() {
  return (await readFixture(ADDON_FIXTURE)).subtitles;
}

function toHitsOf(siteSubtitles, searchQuery = episodeQuery) {
  return anisubMapping.toSearchHits(
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

function toErrorText(error) {
  return `${error.message} ${error.cause?.message} ${JSON.stringify(error)}`;
}

function findHit(hits, siteFileId) {
  return hits.find(hit => hit.siteFileId === siteFileId);
}

describe('anisubMapping.buildSearchRequest', () => {
  it('asks the token-free addon for one episode by its imdb id', () => {
    expect(anisubMapping.buildSearchRequest(episodeQuery, null)).toEqual({
      subtitleSource: SubtitleSource.ANISUB,
      url: 'https://anisub.co/subtitles/series/tt0877057:1:1.json',
      method: 'GET',
      headers: {},
      responseType: 'json',
      acceptedStatuses: [],
      credentialId: null,
    });
  });

  it('asks a movie by its imdb id alone', () => {
    expect(
      anisubMapping.buildSearchRequest(
        makeSearchQuery({videoId: 'tt2576852', imdbId: 'tt2576852'}),
        null,
      ).url,
    ).toBe('https://anisub.co/subtitles/movie/tt2576852.json');
  });

  it('asks an anime episode by its mapped imdb id, never by the kitsu id', () => {
    const searchRequest = anisubMapping.buildSearchRequest(
      makeSearchQuery({
        videoId: 'kitsu:7442:5',
        videoType: 'series',
        imdbId: 'tt2560140',
        kitsuId: '7442',
        catalogSeason: 2,
        catalogEpisode: 5,
      }),
      null,
    );
    expect(searchRequest.url).toBe(
      'https://anisub.co/subtitles/series/tt2560140:2:5.json',
    );
    expect(searchRequest.url).not.toContain('kitsu');
  });

  it('stays token-free and leaves the app User-Agent to the shared default', () => {
    const searchRequest = anisubMapping.buildSearchRequest(
      episodeQuery,
      tokenCredential,
    );
    expect(searchRequest.headers).toEqual({});
    expect(searchRequest.credentialId).toBeNull();
    expect(searchRequest.url).not.toContain(ACCESS_TOKEN);
  });

  it('sends no extras, even with a video hash, size and file name', () => {
    expect(
      anisubMapping.buildSearchRequest(
        {
          ...episodeQuery,
          videoHash: '8e245d9679d31e12',
          videoSizeBytes: 12909756,
          videoFilename: 'Show.S01E01.1080p.WEB.mkv',
        },
        null,
      ).url,
    ).toBe('https://anisub.co/subtitles/series/tt0877057:1:1.json');
  });

  it('asks nothing without an imdb id', () => {
    expect(
      anisubMapping.buildSearchRequest(
        makeSearchQuery({
          videoId: 'kitsu:7442:5',
          videoType: 'series',
          imdbId: null,
          kitsuId: '7442',
          catalogSeason: 1,
          catalogEpisode: 5,
        }),
        null,
      ),
    ).toBeNull();
  });

  it('asks nothing for a series query without its episode', () => {
    expect(
      anisubMapping.buildSearchRequest(
        {...episodeQuery, catalogEpisode: null},
        null,
      ),
    ).toBeNull();
  });
});

describe('anisubMapping.toSearchHits', () => {
  it('maps an addon row to a hit', async () => {
    expect(findHit(await readHits(), 'sub-71001')).toEqual({
      subtitleSource: SubtitleSource.ANISUB,
      siteFileId: 'sub-71001',
      languageCode: 'tur',
      releaseNames: ['Çağlayan Fansub'],
      fileExtension: 'srt',
      isSitePack: false,
      isHearingImpaired: null,
      isForced: null,
      isMachineTranslated: null,
      isUploaderTrusted: null,
      isQuotaCostly: true,
      siteDownloadCount: null,
      siteFps: null,
      siteFileUrl: FILE_URL,
      siteCueCount: null,
      siteDurationMs: null,
      hashMatchVideoHashes: [],
      subtitleAliases: [],
    });
  });

  it('keeps the file url byte for byte', async () => {
    const siteRows = await readAddonRows();
    const hits = await readHits();
    for (const siteRow of siteRows.slice(0, 4)) {
      expect(findHit(hits, siteRow.id).siteFileUrl).toBe(siteRow.url);
    }
  });

  it('keeps the letters of a Turkish release name', async () => {
    expect(findHit(await readHits(), 'sub-71002').releaseNames).toEqual([
      'Şövalye Öğrenciler Iğdır Fansub',
    ]);
  });

  it('names the release by its release info and falls back to the label', async () => {
    const hits = await readHits();
    expect(findHit(hits, 'sub-71001').releaseNames).toEqual([
      'Çağlayan Fansub',
    ]);
    expect(findHit(hits, 'sub-71003').releaseNames).toEqual([
      '[GrupX] Sezon 1 Paket',
    ]);
  });

  it('gives an empty name no release name', async () => {
    const [firstRow] = await readAddonRows();
    const hits = toHitsOf([{...firstRow, releaseInfo: ' ', label: ''}]);
    expect(hits[0].releaseNames).toEqual([]);
  });

  it('marks a Paket row as a site pack, in the label or the release info', async () => {
    const [firstRow] = await readAddonRows();
    const hits = await readHits();
    expect(findHit(hits, 'sub-71002').isSitePack).toBe(true);
    expect(findHit(hits, 'sub-71003').isSitePack).toBe(true);
    expect(
      toHitsOf([
        {...firstRow, label: 'Bölüm: 01', releaseInfo: 'Grup Paket'},
      ])[0].isSitePack,
    ).toBe(true);
  });

  it('marks no pack without the whole word Paket', async () => {
    const hits = await readHits();
    expect(findHit(hits, 'sub-71001').isSitePack).toBe(false);
    expect(findHit(hits, 'sub-71004').isSitePack).toBe(false);
  });

  it('reads the language through the shared lookup', async () => {
    const hits = await readHits();
    expect(findHit(hits, 'sub-71001').languageCode).toBe('tur');
    expect(findHit(hits, 'sub-71002').languageCode).toBe('tur');
  });

  it.each(['Türkçe', 'Turkce', 'türkçe', 'TÜRKÇE', 'TURKCE'])(
    'reads the site language word %s as Turkish',
    async lang => {
      const [firstRow] = await readAddonRows();
      expect(toHitsOf([{...firstRow, lang}])[0].languageCode).toBe('tur');
    },
  );

  it.each([undefined, null, '', '  '])(
    'reads a missing or blank language (%s) as Turkish, the only one the site serves',
    async lang => {
      const [firstRow] = await readAddonRows();
      expect(toHitsOf([{...firstRow, lang}])[0].languageCode).toBe('tur');
    },
  );

  it('drops a row whose site language word is not listed', async () => {
    const [firstRow] = await readAddonRows();
    expect(toHitsOf([{...firstRow, lang: 'Klingonca'}])).toEqual([]);
    expect(toHitsOf([{...firstRow, lang: 'İngilizce'}])).toEqual([]);
  });

  it('drops a row whose language does not map', async () => {
    const hits = await readHits();
    expect(findHit(hits, 'sub-71005')).toBeUndefined();
    expect(hits.map(hit => hit.siteFileId)).toEqual([
      'sub-71001',
      'sub-71002',
      'sub-71003',
      'sub-71004',
    ]);
  });

  it('keeps only the rows in the asked languages', async () => {
    expect(await readHits({...episodeQuery, languageCodes: ['eng']})).toEqual(
      [],
    );
  });

  it('gives hits that pass the hit schema', async () => {
    const hits = await readHits();
    expect(hits).toHaveLength(4);
    for (const hit of hits) {
      expect(subtitleSourceHitSchema.safeParse(hit).success).toBe(true);
    }
  });

  it('drops a row whose file url is on a private host', async () => {
    const [firstRow] = await readAddonRows();
    const hits = toHitsOf([
      {...firstRow, id: '1', url: 'http://127.0.0.1:11470/subtitles.srt'},
      {...firstRow, id: '2', url: 'http://localhost/subtitles.srt'},
      {...firstRow, id: '3', url: 'http://[::1]/subtitles.srt'},
      {...firstRow, id: '4'},
    ]);
    expect(hits.map(hit => hit.siteFileId)).toEqual(['4']);
  });

  it('drops a malformed row rather than failing', async () => {
    const [firstRow] = await readAddonRows();
    const hits = toHitsOf([
      null,
      {...firstRow, id: undefined},
      {...firstRow, id: ''},
      {...firstRow, id: '1', url: undefined},
      {...firstRow, id: '2', url: 'not a url'},
      {...firstRow, id: '3', lang: 42},
      {...firstRow, id: '4'},
    ]);
    expect(hits.map(hit => hit.siteFileId)).toEqual(['4']);
  });

  it('drops a row whose id is longer than the hit schema allows', async () => {
    const [firstRow] = await readAddonRows();
    const hits = toHitsOf([
      {...firstRow, id: '7'.repeat(513)},
      {...firstRow, id: '8'.repeat(512)},
    ]);
    expect(hits.map(hit => hit.siteFileId)).toEqual(['8'.repeat(512)]);
  });

  it.each([
    ['an object', {subtitles: {id: '1'}}],
    ['no list', {subtitles: null}],
    ['a text body', 'Not found.'],
  ])(
    'reads %s in place of the row list as an unavailable source',
    (_, body) => {
      expect(
        catchError(() =>
          anisubMapping.toSearchHits(
            {status: StatusCodes.OK, headers: {}, body},
            episodeQuery,
          ),
        ),
      ).toBeInstanceOf(SourceUnavailableError);
    },
  );

  it('reads an empty row list as no hits', () => {
    expect(
      anisubMapping.toSearchHits(
        {status: StatusCodes.OK, headers: {}, body: {subtitles: []}},
        episodeQuery,
      ),
    ).toEqual([]);
  });

  it('reads an unknown title as no hits', () => {
    expect(
      anisubMapping.toSearchHits(
        {status: StatusCodes.NOT_FOUND, headers: {}, body: null},
        episodeQuery,
      ),
    ).toEqual([]);
  });
});

describe('anisubMapping.buildDownloadRequest', () => {
  const expectedRequest = {
    subtitleSource: SubtitleSource.ANISUB,
    url: FILE_URL,
    method: 'GET',
    headers: {},
    responseType: 'bytes',
    acceptedStatuses: [],
    credentialId: null,
  };

  it('asks the linked file url for bytes, unchanged, and never sends the token there', () => {
    const downloadRequest = anisubMapping.buildDownloadRequest(
      subtitleRef,
      tokenCredential,
    );
    expect(downloadRequest).toEqual(expectedRequest);
    expect(JSON.stringify(downloadRequest)).not.toContain(ACCESS_TOKEN);
  });

  it.each([null, undefined, ''])(
    'reads a missing file url (%s) as an unavailable source and builds none',
    siteFileUrl => {
      const error = catchError(() =>
        anisubMapping.buildDownloadRequest(
          {...subtitleRef, siteFileUrl},
          tokenCredential,
        ),
      );
      expect(error).toBeInstanceOf(SourceUnavailableError);
      expect(error.subtitleSource).toBe(SubtitleSource.ANISUB);
      expect(toErrorText(error)).not.toContain(ACCESS_TOKEN);
    },
  );

  it.each([
    'http://127.0.0.1:11470/subtitles.srt',
    'http://localhost/subtitles.srt',
    'http://10.0.0.5/subtitles.srt',
  ])(
    'reads a file url on a private host (%s) as an unavailable source',
    siteFileUrl => {
      const error = catchError(() =>
        anisubMapping.buildDownloadRequest({...subtitleRef, siteFileUrl}, null),
      );
      expect(error).toBeInstanceOf(SourceUnavailableError);
    },
  );
});

describe('anisubMapping.toDownload', () => {
  const fileBytes = Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nŞimdi\n');

  it('returns the file bytes and the file name the site gives', () => {
    expect(
      anisubMapping.toDownload({
        status: StatusCodes.OK,
        headers: {
          'content-disposition': 'attachment; filename="sub-71001.srt"',
        },
        body: fileBytes,
      }),
    ).toEqual({
      fileBytes,
      fileNameHint: 'sub-71001.srt',
      extractedEntryPath: null,
    });
  });

  it('gives no file name when the site sends none', () => {
    expect(
      anisubMapping.toDownload({
        status: StatusCodes.OK,
        headers: {},
        body: fileBytes,
      }).fileNameHint,
    ).toBeNull();
  });

  it('reads a missing file as an unavailable source', () => {
    const error = catchError(() =>
      anisubMapping.toDownload({
        status: StatusCodes.NOT_FOUND,
        headers: {},
        body: null,
      }),
    );
    expect(error).toBeInstanceOf(SourceUnavailableError);
  });

  it('falls back to the file name the download link gave', () => {
    expect(
      anisubMapping.toDownload(
        {status: StatusCodes.OK, headers: {}, body: fileBytes},
        '2329-ONE_PIECE-1100.rar',
      ).fileNameHint,
    ).toBe('2329-ONE_PIECE-1100.rar');
  });

  it('reads a JSON answer in place of the file as an unavailable source', () => {
    const error = catchError(() =>
      anisubMapping.toDownload({
        status: StatusCodes.OK,
        headers: {'content-type': 'application/json'},
        body: Buffer.from('{"success":false}'),
      }),
    );
    expect(error).toBeInstanceOf(SourceUnavailableError);
  });
});

const jsonHeaders = {'content-type': 'application/json; charset=utf-8'};

function toJsonResponse(body, status = StatusCodes.OK) {
  return {
    status,
    headers: jsonHeaders,
    body: Buffer.from(JSON.stringify(body)),
  };
}

describe('anisubMapping.toFileDownloadLink', () => {
  it('reads file bytes as no download link', () => {
    expect(
      anisubMapping.toFileDownloadLink({
        status: StatusCodes.OK,
        headers: {'content-type': 'application/x-subrip'},
        body: Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nŞimdi\n'),
      }),
    ).toBeNull();
  });

  it('reads the public download answer as the cdn file to fetch', async () => {
    const downloadLink = anisubMapping.toFileDownloadLink(
      toJsonResponse(await readFixture(INTEGRATION_DOWNLOAD_FIXTURE)),
    );
    expect(downloadLink).toEqual({
      siteFileUrl:
        'https://cdn.anisub.co/subtitles/2025/09/2329-one-piece-1100.rar',
      fileNameHint: '2329-ONE_PIECE-1100.rar',
    });
    expect(anisubMapping.buildDownloadRequest(downloadLink)).toMatchObject({
      url: downloadLink.siteFileUrl,
      headers: {},
      responseType: 'bytes',
      credentialId: null,
    });
  });

  it.each([
    ['a failed envelope', {success: false, message: 'Bulunamadı.'}],
    ['no download url', {success: true, data: {}}],
    [
      'a private download url',
      {success: true, data: {download_url: 'http://10.0.0.5/file.rar'}},
    ],
    [
      'a download url off the AniSub hosts',
      {success: true, data: {download_url: 'https://cdn.other.test/a.rar'}},
    ],
    [
      'a download url on a look-alike host',
      {success: true, data: {download_url: 'https://evilanisub.co/a.rar'}},
    ],
    ['another JSON shape', {subtitles: []}],
  ])('reads %s as an unavailable source', (_, body) => {
    expect(
      catchError(() => anisubMapping.toFileDownloadLink(toJsonResponse(body))),
    ).toBeInstanceOf(SourceUnavailableError);
  });

  it('reads malformed JSON as an unavailable source', () => {
    expect(
      catchError(() =>
        anisubMapping.toFileDownloadLink({
          status: StatusCodes.OK,
          headers: jsonHeaders,
          body: Buffer.from('{"success":'),
        }),
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });

  it('reads a missing file as an unavailable source', () => {
    expect(
      catchError(() =>
        anisubMapping.toFileDownloadLink({
          status: StatusCodes.NOT_FOUND,
          headers: {},
          body: null,
        }),
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });
});

describe('anisubMapping.buildIntegrationDownloadRequest', () => {
  const siteRef = {
    ...subtitleRef,
    siteFileId: 'sub-2329',
    siteFileUrl: 'https://anisub.co/api/subtitles/2329/download',
    catalogSeason: null,
    catalogEpisode: null,
  };

  it('asks the token endpoint for a movie by the site id in the file url', () => {
    expect(
      anisubMapping.buildIntegrationDownloadRequest(siteRef, tokenCredential),
    ).toEqual({
      subtitleSource: SubtitleSource.ANISUB,
      url: 'https://anisub.co/api/integrations/subtitles/2329/download',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        Accept: 'application/json',
      },
      responseType: 'bytes',
      acceptedStatuses: [StatusCodes.UNAUTHORIZED, StatusCodes.FORBIDDEN],
      credentialId: tokenCredential.credentialId,
    });
  });

  it.each([undefined, true])(
    'asks one episode with the episode parameter when the pack flag is %s',
    isSitePack => {
      const downloadRequest = anisubMapping.buildIntegrationDownloadRequest(
        {...siteRef, catalogSeason: 1, catalogEpisode: 5, isSitePack},
        tokenCredential,
      );
      expect(downloadRequest.url).toBe(
        'https://anisub.co/api/integrations/subtitles/2329/download?episode=5',
      );
      expect(downloadRequest.url).not.toContain(ACCESS_TOKEN);
    },
  );

  it('sends no episode parameter for a file that is no pack', () => {
    expect(
      anisubMapping.buildIntegrationDownloadRequest(
        {...siteRef, catalogSeason: 1, catalogEpisode: 5, isSitePack: false},
        tokenCredential,
      ).url,
    ).toBe('https://anisub.co/api/integrations/subtitles/2329/download');
  });

  it('keeps the episode the site put in its own file url', () => {
    expect(
      anisubMapping.buildIntegrationDownloadRequest(
        {
          ...siteRef,
          siteFileUrl:
            'https://anisub.co/api/subtitles/2329/download?episode=3',
          catalogSeason: 1,
          catalogEpisode: 4,
          isSitePack: true,
        },
        tokenCredential,
      ).url,
    ).toBe(
      'https://anisub.co/api/integrations/subtitles/2329/download?episode=3',
    );
  });

  it('reads the site id from the subtitle page url too', () => {
    expect(
      anisubMapping.buildIntegrationDownloadRequest(
        {...siteRef, siteFileUrl: 'https://anisub.co/altyazi/2329'},
        tokenCredential,
      ).url,
    ).toBe('https://anisub.co/api/integrations/subtitles/2329/download');
  });

  it('reads the site id from the addon file link', () => {
    expect(
      anisubMapping.buildIntegrationDownloadRequest(
        {...siteRef, siteFileUrl: 'https://anisub.co/stremio/subtitle/2329'},
        tokenCredential,
      ),
    ).toEqual({
      subtitleSource: SubtitleSource.ANISUB,
      url: 'https://anisub.co/api/integrations/subtitles/2329/download',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        Accept: 'application/json',
      },
      responseType: 'bytes',
      acceptedStatuses: [StatusCodes.UNAUTHORIZED, StatusCodes.FORBIDDEN],
      credentialId: tokenCredential.credentialId,
    });
  });

  it('asks the catalog episode for an addon file link of a site pack', () => {
    expect(
      anisubMapping.buildIntegrationDownloadRequest(
        {
          ...siteRef,
          siteFileUrl: 'https://anisub.co/stremio/subtitle/2329',
          catalogSeason: 1,
          catalogEpisode: 5,
          isSitePack: true,
        },
        tokenCredential,
      ).url,
    ).toBe(
      'https://anisub.co/api/integrations/subtitles/2329/download?episode=5',
    );
  });

  it.each([
    ['an addon file url', subtitleRef],
    [
      'another host',
      {
        ...siteRef,
        siteFileUrl: 'https://evil.test/api/subtitles/2329/download',
      },
    ],
    [
      'a trailing slash',
      {...siteRef, siteFileUrl: 'https://anisub.co/altyazi/2329/'},
    ],
    ['no file url', {...siteRef, siteFileUrl: null}],
    [
      'an addon file link on a look-alike host',
      {
        ...siteRef,
        siteFileUrl: 'https://anisub.co.evil.test/stremio/subtitle/2329',
      },
    ],
    [
      'an addon file link over http',
      {...siteRef, siteFileUrl: 'http://anisub.co/stremio/subtitle/2329'},
    ],
    [
      'an addon file link with a non-numeric tail',
      {
        ...siteRef,
        siteFileUrl: 'https://anisub.co/stremio/subtitle/anisub-2329',
      },
    ],
  ])('fails a token download with %s before any request', (_, ref) => {
    const error = catchError(() =>
      anisubMapping.buildIntegrationDownloadRequest(ref, tokenCredential),
    );
    expect(error).toBeInstanceOf(SourceUnavailableError);
    expect(error.subtitleSource).toBe(SubtitleSource.ANISUB);
    expect(error.cause.message).toBe(
      'AniSub token download needs a recognised file link.',
    );
    expect(toErrorText(error)).not.toContain(ACCESS_TOKEN);
  });
});

describe('anisubMapping.toDownloadLink', () => {
  it('reads the cdn file url and file name from a JSON answer', async () => {
    expect(
      anisubMapping.toDownloadLink(
        toJsonResponse(await readFixture(INTEGRATION_DOWNLOAD_FIXTURE)),
        tokenCredential,
      ),
    ).toEqual({
      siteFileUrl:
        'https://cdn.anisub.co/subtitles/2025/09/2329-one-piece-1100.rar',
      fileNameHint: '2329-ONE_PIECE-1100.rar',
    });
  });

  it('reads a file answer as no link, so its bytes are the file', () => {
    const fileResponse = {
      status: StatusCodes.OK,
      headers: {
        'content-type': 'application/x-subrip',
        'content-disposition': 'attachment; filename="2329-e05.srt"',
      },
      body: Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nŞimdi\n'),
    };
    expect(
      anisubMapping.toDownloadLink(fileResponse, tokenCredential),
    ).toBeNull();
    expect(anisubMapping.toDownload(fileResponse)).toEqual({
      fileBytes: fileResponse.body,
      fileNameHint: '2329-e05.srt',
      extractedEntryPath: null,
    });
  });

  it('asks the cdn file with no token', async () => {
    const downloadLink = anisubMapping.toDownloadLink(
      toJsonResponse(await readFixture(INTEGRATION_DOWNLOAD_FIXTURE)),
      tokenCredential,
    );
    const fileRequest = anisubMapping.buildDownloadRequest(downloadLink, null);
    expect(fileRequest).toMatchObject({
      url: downloadLink.siteFileUrl,
      headers: {},
      responseType: 'bytes',
      credentialId: null,
    });
    expect(JSON.stringify(fileRequest)).not.toContain(ACCESS_TOKEN);
  });

  it.each([StatusCodes.UNAUTHORIZED, StatusCodes.FORBIDDEN])(
    'reads %s as a rejected token, without the token',
    status => {
      const error = catchError(() =>
        anisubMapping.toDownloadLink(
          toJsonResponse({message: 'Unauthenticated.'}, status),
          tokenCredential,
        ),
      );
      expect(error).toBeInstanceOf(SourceCredentialError);
      expect(error.subtitleSource).toBe(SubtitleSource.ANISUB);
      expect(error.credentialId).toBe(tokenCredential.credentialId);
      expect(toErrorText(error)).not.toContain(ACCESS_TOKEN);
    },
  );

  it.each([
    ['a failed envelope', {success: false, message: 'Bulunamadı.'}],
    ['no download url', {success: true, data: {}}],
    [
      'a private download url',
      {success: true, data: {download_url: 'http://127.0.0.1/file.rar'}},
    ],
    [
      'a download url off the AniSub hosts',
      {success: true, data: {download_url: 'https://cdn.other.test/a.rar'}},
    ],
    [
      'a download url on a look-alike host',
      {success: true, data: {download_url: 'https://evilanisub.co/a.rar'}},
    ],
    ['another JSON shape', {subtitles: []}],
  ])('reads %s as an unavailable source, without the token', (_, body) => {
    const error = catchError(() =>
      anisubMapping.toDownloadLink(toJsonResponse(body), tokenCredential),
    );
    expect(error).toBeInstanceOf(SourceUnavailableError);
    expect(toErrorText(error)).not.toContain(ACCESS_TOKEN);
  });

  it.each([
    [
      'malformed JSON',
      {
        status: StatusCodes.OK,
        headers: jsonHeaders,
        body: Buffer.from('{"success":'),
      },
    ],
    [
      'a missing file',
      {status: StatusCodes.NOT_FOUND, headers: {}, body: null},
    ],
  ])('reads %s as an unavailable source, without the token', (_, response) => {
    const error = catchError(() =>
      anisubMapping.toDownloadLink(response, tokenCredential),
    );
    expect(error).toBeInstanceOf(SourceUnavailableError);
    expect(toErrorText(error)).not.toContain(ACCESS_TOKEN);
  });
});

describe('anisubMapping.buildCredentialCheckRequest', () => {
  it('asks the profile with the token as a bearer and reads a rejection itself', () => {
    const checkRequest =
      anisubMapping.buildCredentialCheckRequest(tokenCredential);
    expect(checkRequest).toMatchObject({
      subtitleSource: SubtitleSource.ANISUB,
      url: 'https://anisub.co/api/me',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        Accept: 'application/json',
      },
      acceptedStatuses: [StatusCodes.UNAUTHORIZED],
      credentialId: tokenCredential.credentialId,
    });
    expect(checkRequest.url).not.toContain(ACCESS_TOKEN);
  });
});

describe('anisubMapping.toCredentialCheck', () => {
  it('reads a profile as a valid token', async () => {
    expect(
      anisubMapping.toCredentialCheck({
        status: StatusCodes.OK,
        headers: {},
        body: await readFixture(ME_FIXTURE),
      }),
    ).toEqual({
      credentialStatus: CredentialStatus.VALID,
      quotaRemainingCount: null,
      quotaAllowedCount: null,
      quotaResetAt: null,
    });
  });

  it('reads 401 as an invalid token', () => {
    expect(
      anisubMapping.toCredentialCheck({
        status: StatusCodes.UNAUTHORIZED,
        headers: {},
        body: {message: 'Unauthenticated.'},
      }).credentialStatus,
    ).toBe(CredentialStatus.INVALID);
  });

  it.each([
    ['a failed envelope', {success: false}],
    ['a text body', '<html>Login</html>'],
    ['no body', null],
  ])('reads %s on a 2xx as an unavailable source', (_, body) => {
    const error = catchError(() =>
      anisubMapping.toCredentialCheck({
        status: StatusCodes.OK,
        headers: {},
        body,
      }),
    );
    expect(error).toBeInstanceOf(SourceUnavailableError);
  });

  it('reads a missing profile route as an unavailable source without the token', () => {
    const checkRequest =
      anisubMapping.buildCredentialCheckRequest(tokenCredential);
    const error = catchError(() =>
      anisubMapping.toCredentialCheck({
        status: StatusCodes.NOT_FOUND,
        headers: checkRequest.headers,
        body: null,
      }),
    );
    expect(error).toBeInstanceOf(SourceUnavailableError);
    expect(toErrorText(error)).not.toContain(ACCESS_TOKEN);
  });
});

describe('anisubMapping.buildQuotaRequest', () => {
  it('asks the usage stats with the token as a bearer', () => {
    const quotaRequest = anisubMapping.buildQuotaRequest(tokenCredential);
    expect(quotaRequest).toEqual({
      subtitleSource: SubtitleSource.ANISUB,
      url: 'https://anisub.co/api/usage-stats',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        Accept: 'application/json',
      },
      responseType: 'json',
      acceptedStatuses: [],
      credentialId: tokenCredential.credentialId,
    });
  });
});

describe('anisubMapping.toQuota', () => {
  it('maps the usage stats to the quota', async () => {
    expect(
      anisubMapping.toQuota({
        status: StatusCodes.OK,
        headers: {},
        body: await readFixture(USAGE_STATS_FIXTURE),
      }),
    ).toEqual({
      credentialStatus: CredentialStatus.VALID,
      quotaRemainingCount: 940,
      quotaAllowedCount: 1000,
      quotaResetAt: '2026-11-18T23:59:59+03:00',
    });
  });

  it.each([
    ['no data', {success: true}],
    ['text counts', {success: true, data: {limit: 'x', remaining: null}}],
    ['a text body', 'Server Error'],
  ])('reads %s as an unknown quota', (_, body) => {
    expect(
      anisubMapping.toQuota({status: StatusCodes.OK, headers: {}, body}),
    ).toMatchObject({
      quotaRemainingCount: null,
      quotaAllowedCount: null,
      quotaResetAt: null,
    });
  });

  it.each(['tomorrow', '2026-11-18', '2026-11-18 23:59:59', 42])(
    'reads a reset time that is no ISO date-time with offset (%s) as unknown',
    resetsAt => {
      expect(
        anisubMapping.toQuota({
          status: StatusCodes.OK,
          headers: {},
          body: {
            success: true,
            data: {limit: 1000, remaining: 940, resets_at: resetsAt},
          },
        }),
      ).toMatchObject({
        quotaRemainingCount: 940,
        quotaAllowedCount: 1000,
        quotaResetAt: null,
      });
    },
  );

  it('reads a missing stats route as an unavailable source without the token', () => {
    const quotaRequest = anisubMapping.buildQuotaRequest(tokenCredential);
    const error = catchError(() =>
      anisubMapping.toQuota({
        status: StatusCodes.NOT_FOUND,
        headers: quotaRequest.headers,
        body: null,
      }),
    );
    expect(error).toBeInstanceOf(SourceUnavailableError);
    expect(toErrorText(error)).not.toContain(ACCESS_TOKEN);
  });
});
