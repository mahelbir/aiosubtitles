import {strToU8, zipSync} from 'fflate';
import {StatusCodes} from 'http-status-codes';
import {describe, expect, it} from 'vitest';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {betaseriesMapping} from '../../../src/lib/subtitle-sources/betaseries/betaseries-mapping.js';
import {
  subtitleSourceHitSchema,
  toSubtitleRowValues,
} from '../../../src/lib/subtitle-sources/subtitle-source-contract.js';
import {
  SourceCredentialError,
  SourceUnavailableError,
} from '../../../src/lib/subtitle-sources/subtitle-source-errors.js';
import {
  SUBTITLE_SOURCE_BROWSER_USER_AGENT,
  toSubtitleSourceError,
  toSubtitleSourceStatusError,
} from '../../../src/lib/subtitle-sources/subtitle-source-request.js';
import {catchError, toErrorText} from '../../helpers/caught-error.js';
import {readFixture} from '../../helpers/read-fixture.js';
import {
  makeSearchQuery,
  makeSubtitleSourceCredential,
} from '../../helpers/subtitle-source-factories.js';

const API_KEY = 'fixture-betaseries-key';
const BETASERIES_API_ORIGIN = 'https://api.betaseries.com';
const SHOW_ID = 9900481;
const EPISODE_ID = 9939477;
const SHOWS_DISPLAY_FIXTURE = 'subtitle-sources/betaseries/shows-display.json';
const SHOWS_EPISODES_FIXTURE =
  'subtitle-sources/betaseries/shows-episodes.json';
const SUBTITLES_FIXTURE = 'subtitle-sources/betaseries/subtitles-episode.json';
const keyCredential = makeSubtitleSourceCredential({apiKey: API_KEY});
const episodeQuery = makeSearchQuery({
  videoId: 'tt9900001:1:3',
  videoType: 'series',
  imdbId: 'tt9900001',
  catalogSeason: 1,
  catalogEpisode: 3,
  languageCodes: ['fre', 'eng'],
});
const subtitleRef = {
  subtitleSource: SubtitleSource.BETASERIES,
  siteFileId: '9970001',
  siteFileUrl: 'https://www.betaseries.com/srt/9970001',
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

function toErrorResponse(errors) {
  return {
    status: StatusCodes.BAD_REQUEST,
    headers: {'content-type': 'application/json'},
    body: {errors},
  };
}

function readQuery(siteUrl) {
  return Object.fromEntries(new URL(siteUrl).searchParams);
}

function buildRequestChain(searchQuery = episodeQuery) {
  return [
    betaseriesMapping.buildShowRequest(searchQuery, keyCredential),
    betaseriesMapping.buildEpisodeRequest(SHOW_ID, searchQuery, keyCredential),
    betaseriesMapping.buildSubtitlesRequest(
      EPISODE_ID,
      searchQuery,
      keyCredential,
    ),
  ];
}

const errorReaders = [
  [
    'the show lookup',
    response => betaseriesMapping.findShowId(response, keyCredential),
  ],
  [
    'the episode lookup',
    response =>
      betaseriesMapping.findEpisodeId(response, episodeQuery, keyCredential),
  ],
  [
    'the subtitle list',
    response => betaseriesMapping.toSearchHits(response, keyCredential),
  ],
];

async function readFixtureHits() {
  return betaseriesMapping.toSearchHits(
    toOkResponse(await readFixture(SUBTITLES_FIXTURE)),
    keyCredential,
  );
}

async function toHitsOfRows(rowOverrides) {
  const {subtitles} = await readFixture(SUBTITLES_FIXTURE);
  return betaseriesMapping.toSearchHits(
    toOkResponse({
      subtitles: rowOverrides.map(rowOverride =>
        rowOverride === null ? null : {...subtitles[0], ...rowOverride},
      ),
      errors: [],
    }),
    keyCredential,
  );
}

function findHit(hits, siteFileId) {
  return hits.find(hit => hit.siteFileId === siteFileId);
}

describe('betaseries request headers', () => {
  it('sends the key and the API version as headers on every lookup', () => {
    for (const siteRequest of buildRequestChain()) {
      expect(siteRequest.headers).toMatchObject({
        'X-BetaSeries-Key': API_KEY,
        'X-BetaSeries-Version': '3.0',
      });
    }
  });

  it('keeps the key out of every lookup url', () => {
    for (const siteRequest of buildRequestChain()) {
      expect(new URL(siteRequest.url).origin).toBe(BETASERIES_API_ORIGIN);
      expect(siteRequest.url).not.toContain(API_KEY);
      expect(new URL(siteRequest.url).searchParams.has('key')).toBe(false);
    }
  });

  it('sends our own user agent, never a browser one', () => {
    for (const siteRequest of buildRequestChain()) {
      expect(siteRequest.headers['X-BetaSeries-Key']).toBe(API_KEY);
      expect(siteRequest.headers['User-Agent']).not.toBe(
        SUBTITLE_SOURCE_BROWSER_USER_AGENT,
      );
    }
  });

  it('counts every lookup against the key and reads the 400 error body itself', () => {
    for (const siteRequest of buildRequestChain()) {
      expect(siteRequest).toMatchObject({
        subtitleSource: SubtitleSource.BETASERIES,
        method: 'GET',
        responseType: 'json',
        acceptedStatuses: [StatusCodes.BAD_REQUEST],
        credentialId: keyCredential.credentialId,
      });
    }
  });
});

describe('betaseriesMapping.buildShowRequest', () => {
  it('looks the show up by its imdb id', () => {
    const showRequest = betaseriesMapping.buildShowRequest(
      episodeQuery,
      keyCredential,
    );
    expect(new URL(showRequest.url).pathname).toBe('/shows/display');
    expect(readQuery(showRequest.url)).toEqual({imdb_id: 'tt9900001'});
  });

  it('asks nothing for a movie', () => {
    expect(
      betaseriesMapping.buildShowRequest(
        makeSearchQuery({languageCodes: ['fre']}),
        keyCredential,
      ),
    ).toBeNull();
  });

  it.each([
    ['no credential', episodeQuery, null],
    [
      'no imdb id',
      {...episodeQuery, videoId: 'kitsu:7442:5', imdbId: null, kitsuId: '7442'},
      keyCredential,
    ],
    ['no season', {...episodeQuery, catalogSeason: null}, keyCredential],
    ['no episode', {...episodeQuery, catalogEpisode: null}, keyCredential],
  ])('asks nothing with %s', (_, searchQuery, credential) => {
    expect(
      betaseriesMapping.buildShowRequest(searchQuery, credential),
    ).toBeNull();
  });

  it('asks nothing when no french or english subtitle is wanted', () => {
    expect(
      betaseriesMapping.buildShowRequest(
        {...episodeQuery, languageCodes: ['ger']},
        keyCredential,
      ),
    ).toBeNull();
    expect(
      betaseriesMapping.buildShowRequest(
        {...episodeQuery, languageCodes: ['ger', 'fre']},
        keyCredential,
      ),
    ).not.toBeNull();
  });
});

describe('betaseriesMapping.findShowId', () => {
  it('reads the show id', async () => {
    expect(
      betaseriesMapping.findShowId(
        toOkResponse(await readFixture(SHOWS_DISPLAY_FIXTURE)),
        keyCredential,
      ),
    ).toBe(SHOW_ID);
  });

  it('reads a show id that comes as a string', () => {
    expect(
      betaseriesMapping.findShowId(
        toOkResponse({show: {id: String(SHOW_ID)}, errors: []}),
        keyCredential,
      ),
    ).toBe(SHOW_ID);
  });

  it.each([
    ['no show', {errors: []}],
    ['a show without an id', {show: {title: 'Fixture Show'}, errors: []}],
    ['no body', null],
  ])('reads %s as no show', (_, body) => {
    expect(
      betaseriesMapping.findShowId(toOkResponse(body), keyCredential),
    ).toBeNull();
  });
});

describe('betaseriesMapping.buildEpisodeRequest', () => {
  it('asks the episode by show id, season and episode', () => {
    const episodeRequest = betaseriesMapping.buildEpisodeRequest(
      SHOW_ID,
      episodeQuery,
      keyCredential,
    );
    expect(new URL(episodeRequest.url).pathname).toBe('/shows/episodes');
    expect(readQuery(episodeRequest.url)).toEqual({
      id: String(SHOW_ID),
      season: '1',
      episode: '3',
    });
  });
});

describe('betaseriesMapping.findEpisodeId', () => {
  it('reads the id of the asked episode', async () => {
    expect(
      betaseriesMapping.findEpisodeId(
        toOkResponse(await readFixture(SHOWS_EPISODES_FIXTURE)),
        episodeQuery,
        keyCredential,
      ),
    ).toBe(EPISODE_ID);
  });

  it('reads an episode whose id, season and number come as strings', () => {
    expect(
      betaseriesMapping.findEpisodeId(
        toOkResponse({
          episodes: [{id: String(EPISODE_ID), season: '1', episode: '3'}],
          errors: [],
        }),
        episodeQuery,
        keyCredential,
      ),
    ).toBe(EPISODE_ID);
  });

  it('ignores an episode of another season or number', async () => {
    const body = await readFixture(SHOWS_EPISODES_FIXTURE);
    expect(
      betaseriesMapping.findEpisodeId(
        toOkResponse(body),
        {...episodeQuery, catalogSeason: 2},
        keyCredential,
      ),
    ).toBeNull();
    expect(
      betaseriesMapping.findEpisodeId(
        toOkResponse(body),
        {...episodeQuery, catalogEpisode: 4},
        keyCredential,
      ),
    ).toBeNull();
  });

  it('reads no episodes as no episode', () => {
    expect(
      betaseriesMapping.findEpisodeId(
        toOkResponse({episodes: [], errors: []}),
        episodeQuery,
        keyCredential,
      ),
    ).toBeNull();
  });

  it.each([
    ['no list', {errors: []}],
    ['no body', null],
  ])('reads %s as an unavailable source', (_, body) => {
    expect(
      catchError(() =>
        betaseriesMapping.findEpisodeId(
          toOkResponse(body),
          episodeQuery,
          keyCredential,
        ),
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });
});

describe('betaseriesMapping.buildSubtitlesRequest', () => {
  it.each([
    [['fre'], 'vf'],
    [['eng'], 'vo'],
    [['fre', 'eng'], 'all'],
    [['ger', 'eng', 'tur'], 'vo'],
  ])(
    'asks the subtitles of the episode for %j as %s',
    (languageCodes, language) => {
      const subtitlesRequest = betaseriesMapping.buildSubtitlesRequest(
        EPISODE_ID,
        {...episodeQuery, languageCodes},
        keyCredential,
      );
      expect(new URL(subtitlesRequest.url).pathname).toBe('/subtitles/episode');
      expect(readQuery(subtitlesRequest.url)).toEqual({
        id: String(EPISODE_ID),
        language,
      });
    },
  );
});

describe('betaseriesMapping.toSearchHits', () => {
  it('maps a subtitle row', async () => {
    const hit = findHit(await readFixtureHits(), '9970001');
    expect(hit).toMatchObject({
      subtitleSource: SubtitleSource.BETASERIES,
      siteFileId: '9970001',
      languageCode: 'fre',
      releaseNames: ['Fixture.Show.S01E03.1080p.WEB-DL-GROUP.fr.srt'],
      fileExtension: 'srt',
      siteFileUrl: 'https://www.betaseries.com/srt/9970001',
      hashMatchVideoHashes: [],
      subtitleAliases: [],
    });
  });

  it('reads VF as french and VO as english, in any case', async () => {
    const hits = await readFixtureHits();
    expect(findHit(hits, '9970001').languageCode).toBe('fre');
    expect(findHit(hits, '9970002').languageCode).toBe('eng');
    expect(findHit(hits, '9970003').languageCode).toBe('fre');
  });

  it('reads an ass file as ass', async () => {
    expect(findHit(await readFixtureHits(), '9970004').fileExtension).toBe(
      'ass',
    );
  });

  it('drops a row whose language does not map', async () => {
    const hits = await readFixtureHits();
    expect(findHit(hits, '9970001')).toBeDefined();
    expect(findHit(hits, '9970005')).toBeUndefined();
  });

  it('drops a row from the dead seriessub source', async () => {
    const hits = await readFixtureHits();
    expect(findHit(hits, '9970003')).toBeDefined();
    expect(findHit(hits, '9970006')).toBeUndefined();
  });

  it('keeps every other fixture row', async () => {
    expect((await readFixtureHits()).map(hit => hit.siteFileId)).toEqual([
      '9970001',
      '9970002',
      '9970003',
      '9970004',
    ]);
  });

  it.each([
    ['no url', {id: 9970101, url: null}],
    ['a non-http url', {id: 9970102, url: 'ftp://files.example/9970102.srt'}],
    ['no id', {id: null}],
    ['a bad id', {id: -1}],
  ])('drops a row with %s', async (_, rowOverride) => {
    const hits = await toHitsOfRows([rowOverride, {id: 9970103}]);
    expect(hits.map(hit => hit.siteFileId)).toEqual(['9970103']);
  });

  it('drops a row whose file url carries the key, so no stored value holds it', async () => {
    const hits = await toHitsOfRows([
      {
        id: 9970105,
        url: `https://www.betaseries.com/srt/9970105?key=${API_KEY}`,
      },
      {id: 9970106},
    ]);
    expect(hits.map(hit => hit.siteFileId)).toEqual(['9970106']);
  });

  it('keeps a row whose id comes as a string', async () => {
    const hits = await toHitsOfRows([{id: '9970107'}, {id: true}]);
    expect(hits.map(hit => hit.siteFileId)).toEqual(['9970107']);
  });

  it('drops a malformed row rather than failing', async () => {
    const hits = await toHitsOfRows([null, {id: 9970104}]);
    expect(hits.map(hit => hit.siteFileId)).toEqual(['9970104']);
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
    expect(hits).toHaveLength(4);
    for (const hit of hits) {
      expect(JSON.stringify(toSubtitleRowValues(hit))).not.toContain(API_KEY);
    }
  });

  it('reads an empty list as no hits', () => {
    expect(
      betaseriesMapping.toSearchHits(
        toOkResponse({subtitles: [], errors: []}),
        keyCredential,
      ),
    ).toEqual([]);
  });

  it.each([
    ['no list', {errors: []}],
    ['no body', null],
  ])('reads %s as an unavailable source', (_, body) => {
    expect(
      catchError(() =>
        betaseriesMapping.toSearchHits(toOkResponse(body), keyCredential),
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });
});

describe('betaseries download quota', () => {
  it('marks no hit as quota costly, since no per-key download limit is known', async () => {
    const hits = await readFixtureHits();
    expect(hits).toHaveLength(4);
    for (const hit of hits) {
      expect(hit.isQuotaCostly).toBe(false);
    }
  });
});

describe('betaseries error body', () => {
  it.each(errorReaders)(
    'reads code 1001 from %s as a rejected credential',
    (_, readResponse) => {
      const error = catchError(() =>
        readResponse(toErrorResponse([{code: 1001, text: 'Invalid API key.'}])),
      );
      expect(error).toBeInstanceOf(SourceCredentialError);
      expect(error.credentialId).toBe(keyCredential.credentialId);
    },
  );

  it.each(errorReaders.map((errorReader, index) => [...errorReader, index]))(
    'reads code 4001 from %s as nothing found',
    (_, readResponse, index) => {
      expect(
        readResponse(toErrorResponse([{code: 4001, text: 'Show not found.'}])),
      ).toEqual([null, null, []][index]);
    },
  );

  it.each(errorReaders)(
    'reads another 400 from %s as an unavailable source',
    (_, readResponse) => {
      expect(
        catchError(() =>
          readResponse(toErrorResponse([{code: 2001, text: 'Bad call.'}])),
        ),
      ).toBeInstanceOf(SourceUnavailableError);
      expect(
        catchError(() =>
          readResponse({
            status: StatusCodes.BAD_REQUEST,
            headers: {},
            body: null,
          }),
        ),
      ).toBeInstanceOf(SourceUnavailableError);
    },
  );

  it('never echoes the key from an error text', () => {
    const errorTexts = [
      `Invalid key ${API_KEY}.`,
      `Unknown call for key=${API_KEY}.`,
    ];
    const errors = [
      catchError(() =>
        betaseriesMapping.findShowId(
          toErrorResponse([{code: 1001, text: errorTexts[0]}]),
          keyCredential,
        ),
      ),
      catchError(() =>
        betaseriesMapping.findShowId(
          toErrorResponse([{code: 2001, text: errorTexts[1]}]),
          keyCredential,
        ),
      ),
    ];
    expect(errors[0]).toBeInstanceOf(SourceCredentialError);
    expect(errors[1]).toBeInstanceOf(SourceUnavailableError);
    for (const error of errors) {
      expect(toErrorText(error)).not.toContain(API_KEY);
    }
  });
});

describe('betaseries key in a transport error', () => {
  it('keeps the key out of an error that carries the request headers and url', () => {
    for (const siteRequest of buildRequestChain()) {
      const transportError = Object.assign(
        new Error(`connect ECONNRESET ${siteRequest.url}`),
        {
          code: 'ECONNRESET',
          config: {url: siteRequest.url, headers: siteRequest.headers},
          request: {headers: siteRequest.headers},
        },
      );
      expect(JSON.stringify(transportError.config)).toContain(API_KEY);
      const error = toSubtitleSourceError(transportError, {
        subtitleSource: siteRequest.subtitleSource,
      });
      expect(error).toBeInstanceOf(SourceUnavailableError);
      expect(toErrorText(error)).not.toContain(API_KEY);
    }
  });

  it('keeps the key out of a status error built from the request headers', () => {
    for (const siteRequest of buildRequestChain()) {
      const error = toSubtitleSourceStatusError(
        {status: StatusCodes.FORBIDDEN, headers: siteRequest.headers},
        {
          subtitleSource: siteRequest.subtitleSource,
          credentialId: siteRequest.credentialId,
        },
      );
      expect(error).toBeInstanceOf(SourceCredentialError);
      expect(toErrorText(error)).not.toContain(API_KEY);
    }
  });
});

describe('betaseriesMapping.buildDownloadRequest', () => {
  it('asks the stored file url for bytes, with no key and no credential', () => {
    const downloadRequest = betaseriesMapping.buildDownloadRequest(
      subtitleRef,
      keyCredential,
    );
    expect(downloadRequest).toMatchObject({
      subtitleSource: SubtitleSource.BETASERIES,
      url: 'https://www.betaseries.com/srt/9970001',
      method: 'GET',
      responseType: 'bytes',
      credentialId: null,
    });
    expect(downloadRequest.headers?.['X-BetaSeries-Key']).toBeUndefined();
    expect(JSON.stringify(downloadRequest)).not.toContain(API_KEY);
  });

  it.each([null, 'ftp://files.example/9970001.srt', 'not a url'])(
    'refuses a stored file url %s',
    siteFileUrl => {
      expect(
        catchError(() =>
          betaseriesMapping.buildDownloadRequest(
            {...subtitleRef, siteFileUrl},
            keyCredential,
          ),
        ),
      ).toBeInstanceOf(SourceUnavailableError);
    },
  );
});

describe('betaseriesMapping.toDownload', () => {
  const zipBytes = zipSync({
    'Fixture.Show.S01E03.fr.srt': strToU8(
      '1\n00:00:01,000 --> 00:00:02,000\nBonjour\n',
    ),
  });

  it('returns the zip bytes unchanged for the archive path', () => {
    expect(
      betaseriesMapping.toDownload({
        status: StatusCodes.OK,
        headers: {
          'content-type': 'application/zip',
          'content-disposition':
            'attachment; filename="Fixture.Show.S01E03.HDTV-GROUP.zip"',
        },
        body: zipBytes,
      }),
    ).toEqual({
      fileBytes: zipBytes,
      fileNameHint: 'Fixture.Show.S01E03.HDTV-GROUP.zip',
      extractedEntryPath: null,
    });
  });

  it('returns a plain subtitle file unchanged', () => {
    const fileBytes = Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nHi\n');
    expect(
      betaseriesMapping.toDownload({
        status: StatusCodes.OK,
        headers: {'content-type': 'application/x-subrip'},
        body: fileBytes,
      }),
    ).toMatchObject({fileBytes, extractedEntryPath: null});
  });

  it.each([
    ['application/json; charset=utf-8', '{"errors":[{"code":4001}]}'],
    ['text/html', '<html>Error</html>'],
  ])(
    'reads a %s answer in place of the file as unavailable',
    (contentType, bodyText) => {
      expect(
        catchError(() =>
          betaseriesMapping.toDownload({
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
        betaseriesMapping.toDownload({
          status: StatusCodes.NOT_FOUND,
          headers: {},
          body: null,
        }),
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });
});
