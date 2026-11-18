import {StatusCodes} from 'http-status-codes';
import {describe, expect, it} from 'vitest';
import {CredentialStatus} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {altyazidbMapping} from '../../../src/lib/subtitle-sources/altyazidb/altyazidb-mapping.js';
import {subtitleSourceHitSchema} from '../../../src/lib/subtitle-sources/subtitle-source-contract.js';
import {SourceUnavailableError} from '../../../src/lib/subtitle-sources/subtitle-source-errors.js';
import {catchError, toErrorText} from '../../helpers/caught-error.js';
import {readFixture} from '../../helpers/read-fixture.js';
import {
  makeSearchQuery,
  makeSubtitleSourceCredential,
} from '../../helpers/subtitle-source-factories.js';

const API_KEY = 'fixture-altyazidb-key';
const EPISODE_FIXTURE = 'subtitle-sources/altyazidb/search-episode.json';
const PACK_FIXTURE = 'subtitle-sources/altyazidb/search-pack.json';
const TURKISH_RELEASE_NAME = 'Gölge.Çağı.S01E04.İlk.Işık.1080p.WEB.h264-FLUX';
const keyCredential = makeSubtitleSourceCredential({apiKey: API_KEY});
const episodeQuery = makeSearchQuery({
  videoId: 'tt9900001:1:4',
  videoType: 'series',
  imdbId: 'tt9900001',
  catalogSeason: 1,
  catalogEpisode: 4,
  languageCodes: ['tur'],
});
const movieQuery = makeSearchQuery({
  imdbId: 'tt9900002',
  videoId: 'tt9900002',
  languageCodes: ['tur', 'eng'],
});
const subtitleFileBytes = Buffer.from(
  '1\n00:00:01,000 --> 00:00:02,000\nSelam\n',
);

async function readSearchHits(fixturePath, isPackSearch) {
  return altyazidbMapping.toSearchHits(
    {
      status: StatusCodes.OK,
      headers: {'content-type': 'application/json'},
      body: await readFixture(fixturePath),
    },
    {isPackSearch},
  );
}

async function readFirstEpisodeItem() {
  const episodeBody = await readFixture(EPISODE_FIXTURE);
  return episodeBody.data[0];
}

function toSearchHitsOf(siteItems) {
  return altyazidbMapping.toSearchHits(
    {
      status: StatusCodes.OK,
      headers: {},
      body: {success: true, data: siteItems},
    },
    {isPackSearch: false},
  );
}

function findHit(hits, siteFileId) {
  return hits.find(hit => hit.siteFileId === siteFileId);
}

function toSearchUrls(searchRequests) {
  return searchRequests.map(({searchRequest}) => new URL(searchRequest.url));
}

function makeSubtitleRef(overrides = {}) {
  return {
    subtitleSource: SubtitleSource.ALTYAZIDB,
    siteFileId: '510003',
    siteFileUrl: null,
    catalogSeason: null,
    catalogEpisode: null,
    isSitePack: false,
    ...overrides,
  };
}

describe('altyazidbMapping.buildSearchRequests', () => {
  it('asks a series episode twice, once for the episode and once for its season packs', () => {
    const searchRequests = altyazidbMapping.buildSearchRequests(
      episodeQuery,
      keyCredential,
    );
    expect(searchRequests).toHaveLength(2);
    const episodeSearch = searchRequests.find(
      ({isPackSearch}) => !isPackSearch,
    );
    const packSearch = searchRequests.find(({isPackSearch}) => isPackSearch);
    const episodeUrl = new URL(episodeSearch.searchRequest.url);
    const packUrl = new URL(packSearch.searchRequest.url);
    expect(episodeUrl.origin).toBe('https://altyazidb.com');
    expect(episodeUrl.pathname).toBe('/api/v1/search');
    expect(Object.fromEntries(episodeUrl.searchParams)).toEqual({
      imdb_id: 'tt9900001',
      lang: 'tr',
      season: '1',
      episode: '4',
      limit: '50',
    });
    expect(packUrl.origin).toBe('https://altyazidb.com');
    expect(packUrl.pathname).toBe('/api/v1/search');
    expect(Object.fromEntries(packUrl.searchParams)).toEqual({
      imdb_id: 'tt9900001',
      lang: 'tr',
      season: '1',
      episode: 'PAKET',
      limit: '50',
    });
  });

  it('sends the key in the X-API-Key header and counts the search against it', () => {
    const searchRequests = altyazidbMapping.buildSearchRequests(
      episodeQuery,
      keyCredential,
    );
    for (const {searchRequest} of searchRequests) {
      expect(searchRequest).toMatchObject({
        subtitleSource: SubtitleSource.ALTYAZIDB,
        method: 'GET',
        responseType: 'json',
        acceptedStatuses: [],
        credentialId: keyCredential.credentialId,
      });
      expect(searchRequest.headers).toEqual({'X-API-Key': API_KEY});
      expect(searchRequest.url).not.toContain(API_KEY);
    }
  });

  it('asks a movie once per language without season or episode', () => {
    const searchRequests = altyazidbMapping.buildSearchRequests(
      movieQuery,
      keyCredential,
    );
    expect(searchRequests.map(({isPackSearch}) => isPackSearch)).toEqual([
      false,
      false,
    ]);
    expect(
      toSearchUrls(searchRequests)
        .map(searchUrl => Object.fromEntries(searchUrl.searchParams))
        .sort((left, right) => left.lang.localeCompare(right.lang)),
    ).toEqual([
      {imdb_id: 'tt9900002', lang: 'en', limit: '50'},
      {imdb_id: 'tt9900002', lang: 'tr', limit: '50'},
    ]);
  });

  it('asks a series episode in both site languages with four calls', () => {
    const searchRequests = altyazidbMapping.buildSearchRequests(
      {...episodeQuery, languageCodes: ['tur', 'eng']},
      keyCredential,
    );
    expect(
      toSearchUrls(searchRequests)
        .map(
          searchUrl =>
            `${searchUrl.searchParams.get('lang')}:${searchUrl.searchParams.get('episode')}`,
        )
        .sort(),
    ).toEqual(['en:4', 'en:PAKET', 'tr:4', 'tr:PAKET']);
  });

  it('asks only the languages the site has', () => {
    const searchRequests = altyazidbMapping.buildSearchRequests(
      {...movieQuery, languageCodes: ['ger', 'tur', 'fre']},
      keyCredential,
    );
    expect(
      toSearchUrls(searchRequests).map(searchUrl =>
        searchUrl.searchParams.get('lang'),
      ),
    ).toEqual(['tr']);
  });

  it('asks nothing for a language the site does not have', () => {
    expect(
      altyazidbMapping.buildSearchRequests(
        {...episodeQuery, languageCodes: ['ger']},
        keyCredential,
      ),
    ).toEqual([]);
  });

  it('asks nothing without a key', () => {
    expect(altyazidbMapping.buildSearchRequests(episodeQuery, null)).toEqual(
      [],
    );
  });

  it('asks nothing without an imdb id', () => {
    expect(
      altyazidbMapping.buildSearchRequests(
        makeSearchQuery({
          videoId: 'kitsu:1:1',
          videoType: 'series',
          imdbId: null,
          kitsuId: '1',
          catalogSeason: 1,
          catalogEpisode: 1,
          languageCodes: ['tur'],
        }),
        keyCredential,
      ),
    ).toEqual([]);
  });

  it('asks nothing for a series query without its episode', () => {
    expect(
      altyazidbMapping.buildSearchRequests(
        {...episodeQuery, catalogEpisode: null},
        keyCredential,
      ),
    ).toEqual([]);
  });
});

describe('altyazidbMapping.toSearchHits', () => {
  it('maps an episode item and its list-time hints', async () => {
    const hits = await readSearchHits(EPISODE_FIXTURE, false);
    expect(findHit(hits, '510001')).toMatchObject({
      subtitleSource: SubtitleSource.ALTYAZIDB,
      siteFileId: '510001',
      languageCode: 'tur',
      releaseNames: [
        'Golge.Cagi.S01E04.1080p.WEB-DL.DDP5.1.H.264-NTb',
        'Golge.Cagi.S01E04.720p.WEB-DL.H.264-NTb',
      ],
      fileExtension: 'srt',
      isSitePack: false,
      isHearingImpaired: false,
      isForced: false,
      isMachineTranslated: false,
      isUploaderTrusted: null,
      siteDownloadCount: 120,
      siteFps: 23.976,
      siteFileUrl: null,
      hashMatchVideoHashes: [],
      subtitleAliases: [],
    });
  });

  it('keeps the Turkish letters of a release name', async () => {
    const hits = await readSearchHits(EPISODE_FIXTURE, false);
    expect(findHit(hits, '510002').releaseNames).toEqual([
      TURKISH_RELEASE_NAME,
    ]);
  });

  it('reads the 1/0 flags as booleans', async () => {
    const hits = await readSearchHits(EPISODE_FIXTURE, false);
    expect(findHit(hits, '510002')).toMatchObject({
      languageCode: 'eng',
      isHearingImpaired: true,
      isForced: false,
      isMachineTranslated: true,
      siteDownloadCount: 7,
      siteFps: 25,
    });
    expect(findHit(hits, '510003').isForced).toBe(true);
  });

  it('reads forced from the forced field alone, never from foreign parts', async () => {
    const firstItem = await readFirstEpisodeItem();
    const hits = toSearchHitsOf([
      {...firstItem, id: '1', forced: 0, foreign_parts: 1},
      {...firstItem, id: '2', forced: undefined, foreign_parts: 1},
    ]);
    expect(hits.map(hit => hit.isForced)).toEqual([false, null]);
  });

  it('marks an episode-call item with is_package 1 as a site pack', async () => {
    const hits = await readSearchHits(EPISODE_FIXTURE, false);
    expect(findHit(hits, '510003').isSitePack).toBe(true);
  });

  it('reads is_package itself, not the episode text', async () => {
    const firstItem = await readFirstEpisodeItem();
    const hits = toSearchHitsOf([
      {...firstItem, id: '1', is_package: 1},
      {...firstItem, id: '2', is_package: 0},
      {...firstItem, id: '3', is_package: '1'},
    ]);
    expect(hits.map(hit => [hit.siteFileId, hit.isSitePack])).toEqual([
      ['1', true],
      ['2', false],
      ['3', true],
    ]);
  });

  it('marks every item of the PAKET call as a site pack', async () => {
    const hits = await readSearchHits(PACK_FIXTURE, true);
    expect(hits.map(hit => [hit.siteFileId, hit.isSitePack])).toEqual([
      ['510003', true],
      ['510006', true],
    ]);
  });

  it('gives unknown for missing flags and no pack without is_package', async () => {
    const hits = await readSearchHits(EPISODE_FIXTURE, false);
    expect(findHit(hits, '510005')).toMatchObject({
      releaseNames: ['Golge.Cagi.S01E04.HDTV.x264-LOL'],
      isSitePack: false,
      isHearingImpaired: null,
      isForced: null,
      isMachineTranslated: null,
      siteDownloadCount: null,
      siteFps: null,
    });
  });

  it('reads an empty or unreadable fps as unknown', async () => {
    const firstItem = await readFirstEpisodeItem();
    const hits = toSearchHitsOf([
      {...firstItem, id: '1', fps: ''},
      {...firstItem, id: '2', fps: 'N/A'},
      {...firstItem, id: '3', fps: '0'},
    ]);
    expect(hits.map(hit => hit.siteFps)).toEqual([null, null, null]);
  });

  it('reads the video runtime the site gives into milliseconds', async () => {
    const hits = await readSearchHits(EPISODE_FIXTURE, false);
    expect(findHit(hits, '510001').siteDurationMs).toBe(3345000);
    expect(findHit(hits, '510003').siteDurationMs).toBeNull();
    expect(findHit(hits, '510005').siteDurationMs).toBeNull();
  });

  it('reads the runtime forms the docs name and drops unreadable ones', async () => {
    const firstItem = await readFirstEpisodeItem();
    const hits = toSearchHitsOf([
      {...firstItem, id: '1', duration: '01:37:30.123'},
      {...firstItem, id: '2', duration: '00.55.45'},
      {...firstItem, id: '3', duration: null, sure_bilgisi: '00:01:02'},
      {...firstItem, id: '4', duration: '00:61:00'},
      {...firstItem, id: '5', duration: 'N/A'},
    ]);
    expect(hits.map(hit => hit.siteDurationMs)).toEqual([
      5850123,
      3345000,
      62000,
      null,
      null,
    ]);
  });

  it('leaves the download quota cost unknown', async () => {
    const hits = await readSearchHits(EPISODE_FIXTURE, false);
    expect(hits.map(hit => hit.isQuotaCostly)).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  it('keeps a numeric site id as a string', async () => {
    const firstItem = await readFirstEpisodeItem();
    const [hit] = toSearchHitsOf([{...firstItem, id: 510001}]);
    expect(hit.siteFileId).toBe('510001');
  });

  it('drops an item whose language does not map', async () => {
    const hits = await readSearchHits(EPISODE_FIXTURE, false);
    expect(findHit(hits, '510004')).toBeUndefined();
    expect(hits.map(hit => hit.siteFileId)).toEqual([
      '510001',
      '510002',
      '510003',
      '510005',
    ]);
  });

  it('drops a malformed item rather than failing', async () => {
    const firstItem = await readFirstEpisodeItem();
    const hits = toSearchHitsOf([
      null,
      {...firstItem, id: undefined},
      {...firstItem, id: ''},
      {...firstItem, id: '7', language: 42},
      {...firstItem, id: '8'},
    ]);
    expect(hits.map(hit => hit.siteFileId)).toEqual(['8']);
  });

  it('gives hits that pass the hit schema', async () => {
    const hits = [
      ...(await readSearchHits(EPISODE_FIXTURE, false)),
      ...(await readSearchHits(PACK_FIXTURE, true)),
    ];
    expect(hits).toHaveLength(6);
    for (const hit of hits) {
      expect(subtitleSourceHitSchema.safeParse(hit).success).toBe(true);
    }
  });

  it('reads an unknown title as no hits', () => {
    expect(
      altyazidbMapping.toSearchHits(
        {status: StatusCodes.NOT_FOUND, headers: {}, body: null},
        {isPackSearch: false},
      ),
    ).toEqual([]);
  });

  it('reads an error envelope as an unavailable source', () => {
    const error = catchError(() =>
      altyazidbMapping.toSearchHits(
        {
          status: StatusCodes.OK,
          headers: {},
          body: {success: false, error: `Geçersiz istek: ${API_KEY}`},
        },
        {isPackSearch: false},
      ),
    );
    expect(error).toBeInstanceOf(SourceUnavailableError);
    expect(toErrorText(error)).not.toContain(API_KEY);
  });

  it('drops an item of another season or episode than the one asked', async () => {
    const firstItem = await readFirstEpisodeItem();
    const hits = altyazidbMapping.toSearchHits(
      {
        status: StatusCodes.OK,
        headers: {},
        body: {
          success: true,
          data: [
            {...firstItem, id: '1'},
            {...firstItem, id: '2', season: 2},
            {...firstItem, id: '3', episode: '5'},
            {...firstItem, id: '4', episode: 'PAKET', is_package: 1},
            {...firstItem, id: '5', season: 2, is_package: 1},
            {...firstItem, id: '6', season: null, episode: null},
          ],
        },
      },
      {isPackSearch: false, catalogSeason: 1, catalogEpisode: 4},
    );
    expect(hits.map(hit => hit.siteFileId)).toEqual(['1', '4', '6']);
  });

  it('keeps every season and episode for a movie search', async () => {
    const firstItem = await readFirstEpisodeItem();
    const [hit] = altyazidbMapping.toSearchHits(
      {
        status: StatusCodes.OK,
        headers: {},
        body: {success: true, data: [{...firstItem, id: '1', season: 3}]},
      },
      {isPackSearch: false, catalogSeason: null, catalogEpisode: null},
    );
    expect(hit.siteFileId).toBe('1');
  });

  it('reads a negative fps as unknown', async () => {
    const firstItem = await readFirstEpisodeItem();
    const [hit] = toSearchHitsOf([{...firstItem, id: '1', fps: '-1'}]);
    expect(hit.siteFps).toBeNull();
  });

  it('reads a runtime past the column range as unknown', async () => {
    const firstItem = await readFirstEpisodeItem();
    const [hit] = toSearchHitsOf([
      {...firstItem, id: '1', duration: '999:00:00'},
    ]);
    expect(hit.siteDurationMs).toBeNull();
  });
});

describe('altyazidbMapping.mergeSearchHits', () => {
  it('merges the episode and PAKET hits, keeping each file once', async () => {
    const mergedHits = altyazidbMapping.mergeSearchHits([
      await readSearchHits(EPISODE_FIXTURE, false),
      await readSearchHits(PACK_FIXTURE, true),
    ]);
    expect(mergedHits.map(hit => hit.siteFileId).sort()).toEqual([
      '510001',
      '510002',
      '510003',
      '510005',
      '510006',
    ]);
    expect(findHit(mergedHits, '510003').isSitePack).toBe(true);
    expect(findHit(mergedHits, '510006').isSitePack).toBe(true);
  });
});

describe('altyazidbMapping.buildDownloadRequest', () => {
  it('asks the subtitle stream route for bytes with the key', () => {
    const downloadRequest = altyazidbMapping.buildDownloadRequest(
      makeSubtitleRef({siteFileId: '510001'}),
      keyCredential,
    );
    expect(downloadRequest).toEqual(
      expect.objectContaining({
        subtitleSource: SubtitleSource.ALTYAZIDB,
        url: 'https://altyazidb.com/api/v1/subtitle?sub_id=510001',
        method: 'GET',
        headers: {'X-API-Key': API_KEY},
        responseType: 'bytes',
        acceptedStatuses: [],
        credentialId: keyCredential.credentialId,
      }),
    );
  });

  it('asks one episode out of a pack by season and episode', () => {
    const downloadUrl = new URL(
      altyazidbMapping.buildDownloadRequest(
        makeSubtitleRef({
          catalogSeason: 1,
          catalogEpisode: 4,
          isSitePack: true,
        }),
        keyCredential,
      ).url,
    );
    expect(downloadUrl.pathname).toBe('/api/v1/subtitle');
    expect(Object.fromEntries(downloadUrl.searchParams)).toEqual({
      sub_id: '510003',
      season: '1',
      episode: '4',
    });
    expect(downloadUrl.href).not.toContain(API_KEY);
  });

  it('sends no key header for a credential without a key', () => {
    const keylessCredential = makeSubtitleSourceCredential({apiKey: undefined});
    expect(
      altyazidbMapping.buildDownloadRequest(
        makeSubtitleRef(),
        keylessCredential,
      ).headers,
    ).toStrictEqual({});
    expect(
      altyazidbMapping.buildCredentialCheckRequest(keylessCredential).headers,
    ).toStrictEqual({});
  });

  it('asks a single episode file as is, even with its season and episode', () => {
    const downloadUrl = new URL(
      altyazidbMapping.buildDownloadRequest(
        makeSubtitleRef({catalogSeason: 1, catalogEpisode: 4}),
        keyCredential,
      ).url,
    );
    expect(Object.fromEntries(downloadUrl.searchParams)).toEqual({
      sub_id: '510003',
    });
  });
});

describe('altyazidbMapping.toDownload', () => {
  const fileResponse = {
    status: StatusCodes.OK,
    headers: {
      'content-type': 'application/x-subrip',
      'content-disposition': 'attachment; filename="Golge.Cagi.S01E04.srt"',
    },
    body: subtitleFileBytes,
  };

  it('returns the file bytes and the file name the site gives', () => {
    expect(
      altyazidbMapping.toDownload(
        fileResponse,
        makeSubtitleRef({siteFileId: '510001'}),
      ),
    ).toEqual({
      fileBytes: subtitleFileBytes,
      fileNameHint: 'Golge.Cagi.S01E04.srt',
      extractedEntryPath: null,
    });
  });

  it.each([
    [1, 4, 'S01E04'],
    [12, 104, 'S12E104'],
  ])(
    'names the episode the site cut out of a pack for S%iE%i',
    (catalogSeason, catalogEpisode, extractedEntryPath) => {
      expect(
        altyazidbMapping.toDownload(
          fileResponse,
          makeSubtitleRef({catalogSeason, catalogEpisode, isSitePack: true}),
        ).extractedEntryPath,
      ).toBe(extractedEntryPath);
    },
  );

  it('names no entry for a single episode file', () => {
    expect(
      altyazidbMapping.toDownload(
        fileResponse,
        makeSubtitleRef({catalogSeason: 1, catalogEpisode: 4}),
      ).extractedEntryPath,
    ).toBeNull();
  });

  it.each(['application/json', 'application/json; charset=utf-8'])(
    'maps a JSON error body on /subtitle (%s)',
    contentType => {
      const error = catchError(() =>
        altyazidbMapping.toDownload(
          {
            status: StatusCodes.OK,
            headers: {'content-type': contentType},
            body: Buffer.from(
              JSON.stringify({
                success: false,
                error: `Altyazı bulunamadı: ${API_KEY}`,
              }),
            ),
          },
          makeSubtitleRef(),
        ),
      );
      expect(error).toBeInstanceOf(SourceUnavailableError);
      expect(toErrorText(error)).not.toContain(API_KEY);
    },
  );

  it('reads an unknown file id as an unavailable source', () => {
    const error = catchError(() =>
      altyazidbMapping.toDownload(
        {status: StatusCodes.NOT_FOUND, headers: {}, body: null},
        makeSubtitleRef(),
      ),
    );
    expect(error).toBeInstanceOf(SourceUnavailableError);
    expect(toErrorText(error)).not.toContain(API_KEY);
  });
});

describe('altyazidbMapping.buildCredentialCheckRequest', () => {
  it('asks /me with the key and reads its rejections itself', () => {
    const checkRequest =
      altyazidbMapping.buildCredentialCheckRequest(keyCredential);
    expect(checkRequest).toMatchObject({
      subtitleSource: SubtitleSource.ALTYAZIDB,
      url: 'https://altyazidb.com/api/v1/me',
      method: 'GET',
      headers: {'X-API-Key': API_KEY},
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

describe('altyazidbMapping.toCredentialCheck', () => {
  it.each([
    [StatusCodes.OK, CredentialStatus.VALID, '{"success":true}'],
    [StatusCodes.UNAUTHORIZED, CredentialStatus.INVALID, '{"error":"key"}'],
    [StatusCodes.FORBIDDEN, CredentialStatus.INVALID, '<html>Forbidden</html>'],
    [StatusCodes.TOO_MANY_REQUESTS, CredentialStatus.LIMITED, ''],
  ])('reads status %i as %s', (status, credentialStatus, body) => {
    expect(
      altyazidbMapping.toCredentialCheck({status, headers: {}, body}),
    ).toEqual({
      credentialStatus,
      quotaRemainingCount: null,
      quotaAllowedCount: null,
      quotaResetAt: null,
    });
  });
});
