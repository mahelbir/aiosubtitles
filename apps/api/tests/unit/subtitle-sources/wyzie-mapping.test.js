import {StatusCodes} from 'http-status-codes';
import iconv from 'iconv-lite';
import {describe, expect, it} from 'vitest';
import {CredentialStatus} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {buildFileFacts} from '@repo/subtitle-core/file-format/file-facts.js';
import {parseSubtitleText} from '@repo/subtitle-core/file-format/parse-subtitle.js';
import {subtitleSourceHitSchema} from '../../../src/lib/subtitle-sources/subtitle-source-contract.js';
import {
  SourceCredentialError,
  SourceRateLimitError,
  SourceUnavailableError,
  SubtitleSourceError,
} from '../../../src/lib/subtitle-sources/subtitle-source-errors.js';
import {wyzieMapping} from '../../../src/lib/subtitle-sources/wyzie/wyzie-mapping.js';
import {catchError, toErrorText} from '../../helpers/caught-error.js';
import {readFixture} from '../../helpers/read-fixture.js';
import {
  makeSearchQuery,
  makeSubtitleSourceCredential,
} from '../../helpers/subtitle-source-factories.js';

const WYZIE_ORIGIN = 'https://sub.wyzie.io';
const API_KEY = 'fixture-wyzie-key-a';
const VIDEO_HASH = '8e245d9679d31e12';
const SEARCH_FIXTURE = 'subtitle-sources/wyzie/search.json';
const REGIONAL_SEARCH_FIXTURE = 'subtitle-sources/wyzie/search-regional.json';
const SOURCES_FIXTURE = 'subtitle-sources/wyzie/sources-key.json';
const USAGE_FIXTURE = 'subtitle-sources/wyzie/usage.json';
const UPSELL_TEXT =
  "You're on the free plan. Unlock every source, AI translation & ad-free subs";
const FREE_CODENAMES = ['charlie', 'xray'];
const keyCredential = makeSubtitleSourceCredential({apiKey: API_KEY});
const movieQuery = makeSearchQuery({
  videoId: 'tt0133093',
  imdbId: 'tt0133093',
  languageCodes: ['eng', 'tur'],
});
const episodeQuery = makeSearchQuery({
  videoId: 'tt9900001:1:3',
  videoType: 'series',
  imdbId: 'tt9900001',
  catalogSeason: 1,
  catalogEpisode: 3,
  languageCodes: ['eng'],
});
const kitsuQuery = makeSearchQuery({
  videoId: 'kitsu:7442:15',
  videoType: 'series',
  imdbId: 'tt2560140',
  kitsuId: '7442',
  catalogSeason: 2,
  catalogEpisode: 3,
  kitsuEpisode: 15,
  languageCodes: ['eng'],
});

function toResponse(status, body, headers = {}) {
  return {status, headers, body};
}

function toOkResponse(body) {
  return toResponse(StatusCodes.OK, body, {
    'content-type': 'application/json',
  });
}

function readQuery(siteUrl) {
  return Object.fromEntries(new URL(siteUrl).searchParams);
}

async function readFixtureHits(searchQuery = movieQuery) {
  return wyzieMapping.toSearchHits(
    toOkResponse(await readFixture(SEARCH_FIXTURE)),
    {searchQuery, credential: keyCredential, codenames: FREE_CODENAMES},
  );
}

function findHit(hits, siteFileId) {
  return hits.find(hit => hit.siteFileId === siteFileId);
}

function toSrtBytes(cues) {
  return new TextEncoder().encode(
    cues
      .map(
        ([startText, endText, cueText], cueIndex) =>
          `${cueIndex + 1}\n${startText} --> ${endText}\n${cueText}\n`,
      )
      .join('\n'),
  );
}

function readCueTexts(fileBytes) {
  return parseSubtitleText({
    text: new TextDecoder().decode(fileBytes),
    fileNameHint: null,
  }).cues.map(({text}) => text);
}

function toRefusal(status, message, extraFields = {}) {
  return toResponse(status, {code: status, message, ...extraFields});
}

describe('wyzieMapping.listSearchCodenames', () => {
  it('asks charlie and xray when the key may use them', () => {
    expect(
      wyzieMapping
        .listSearchCodenames(movieQuery, ['charlie', 'oscar', 'quebec', 'xray'])
        .toSorted(),
    ).toEqual(['charlie', 'xray']);
  });

  it('never asks quebec, even when the key may use it', () => {
    expect(
      wyzieMapping.listSearchCodenames(movieQuery, ['quebec', 'charlie']),
    ).toEqual(['charlie']);
  });

  it('adds oscar only when hebrew is asked', () => {
    expect(
      wyzieMapping
        .listSearchCodenames(makeSearchQuery({languageCodes: ['heb', 'eng']}), [
          'charlie',
          'oscar',
          'quebec',
          'xray',
        ])
        .toSorted(),
    ).toEqual(['charlie', 'oscar', 'xray']);
  });

  it('skips a codename outside the key plan', () => {
    expect(wyzieMapping.listSearchCodenames(movieQuery, ['charlie'])).toEqual([
      'charlie',
    ]);
    expect(wyzieMapping.listSearchCodenames(movieQuery, [])).toEqual([]);
  });

  it('asks the default codenames when the key plan is unknown', () => {
    expect(
      wyzieMapping.listSearchCodenames(movieQuery, null).toSorted(),
    ).toEqual(['charlie', 'xray']);
  });
});

describe('wyzieMapping.buildSearchRequest', () => {
  it('searches a movie by imdb id, languages, codenames and the key', () => {
    const searchRequest = wyzieMapping.buildSearchRequest(
      movieQuery,
      keyCredential,
      FREE_CODENAMES,
    );
    const searchUrl = new URL(searchRequest.url);
    expect(searchUrl.origin).toBe(WYZIE_ORIGIN);
    expect(searchUrl.pathname).toBe('/search');
    expect(readQuery(searchRequest.url)).toMatchObject({
      id: 'tt0133093',
      language: 'en,tr',
      source: 'charlie,xray',
      key: API_KEY,
    });
    expect(searchRequest).toMatchObject({
      subtitleSource: SubtitleSource.WYZIE,
      method: 'GET',
      responseType: 'json',
      credentialId: keyCredential.credentialId,
    });
    expect(searchRequest.acceptedStatuses.toSorted()).toEqual([
      StatusCodes.PAYMENT_REQUIRED,
      StatusCodes.FORBIDDEN,
    ]);
  });

  it('never filters to hearing-impaired rows and sends no season for a movie', () => {
    const searchQuery = readQuery(
      wyzieMapping.buildSearchRequest(movieQuery, keyCredential, FREE_CODENAMES)
        .url,
    );
    expect(searchQuery).not.toHaveProperty('hi');
    expect(searchQuery).not.toHaveProperty('season');
    expect(searchQuery).not.toHaveProperty('episode');
    expect(searchQuery).not.toHaveProperty('kitsu');
  });

  it('searches an episode by imdb id, season and episode', () => {
    expect(
      readQuery(
        wyzieMapping.buildSearchRequest(
          episodeQuery,
          keyCredential,
          FREE_CODENAMES,
        ).url,
      ),
    ).toMatchObject({id: 'tt9900001', season: '1', episode: '3'});
  });

  it('searches a kitsu video by kitsu id and the kitsu episode alone', () => {
    const searchQuery = readQuery(
      wyzieMapping.buildSearchRequest(kitsuQuery, keyCredential, FREE_CODENAMES)
        .url,
    );
    expect(searchQuery).toMatchObject({kitsu: '7442', episode: '15'});
    expect(searchQuery).not.toHaveProperty('id');
    expect(searchQuery).not.toHaveProperty('season');
  });

  it('reads the Kitsu id and episode the query carries, not the video id', () => {
    expect(
      readQuery(
        wyzieMapping.buildSearchRequest(
          {...kitsuQuery, videoId: 'kitsu:7442', kitsuEpisode: 7},
          keyCredential,
          FREE_CODENAMES,
        ).url,
      ),
    ).toMatchObject({kitsu: '7442', episode: '7'});
  });

  it('searches a kitsu movie by kitsu id without an episode', () => {
    const searchQuery = readQuery(
      wyzieMapping.buildSearchRequest(
        makeSearchQuery({
          videoId: 'kitsu:1555',
          imdbId: null,
          kitsuId: '1555',
          languageCodes: ['eng'],
        }),
        keyCredential,
        FREE_CODENAMES,
      ).url,
    );
    expect(searchQuery).toMatchObject({kitsu: '1555'});
    expect(searchQuery).not.toHaveProperty('episode');
    expect(searchQuery).not.toHaveProperty('id');
  });

  it('sends the video hash only when the query has one', () => {
    expect(
      readQuery(
        wyzieMapping.buildSearchRequest(
          {...movieQuery, videoHash: VIDEO_HASH},
          keyCredential,
          FREE_CODENAMES,
        ).url,
      ),
    ).toMatchObject({hash: VIDEO_HASH});
    expect(
      readQuery(
        wyzieMapping.buildSearchRequest(
          movieQuery,
          keyCredential,
          FREE_CODENAMES,
        ).url,
      ),
    ).not.toHaveProperty('hash');
  });

  it('asks brazilian portuguese by its locale code', () => {
    expect(
      readQuery(
        wyzieMapping.buildSearchRequest(
          {...movieQuery, languageCodes: ['pob']},
          keyCredential,
          FREE_CODENAMES,
        ).url,
      ).language,
    ).toBe('pt-br');
  });

  it.each([
    [['spl'], 'ea'],
    [['spa', 'spl'], 'es,ea'],
  ])('asks latin american spanish %j as ea', (languageCodes, language) => {
    expect(
      readQuery(
        wyzieMapping.buildSearchRequest(
          {...movieQuery, languageCodes},
          keyCredential,
          FREE_CODENAMES,
        ).url,
      ).language,
    ).toBe(language);
  });

  it.each([
    ['without a credential', movieQuery, null, FREE_CODENAMES],
    ['without a codename', movieQuery, keyCredential, []],
    [
      'without an imdb or kitsu id',
      makeSearchQuery({videoId: 'tmdb:1', imdbId: null, kitsuId: null}),
      keyCredential,
      FREE_CODENAMES,
    ],
    [
      'without a language the site knows',
      makeSearchQuery({languageCodes: []}),
      keyCredential,
      FREE_CODENAMES,
    ],
  ])('asks nothing %s', (_, searchQuery, credential, codenames) => {
    expect(
      wyzieMapping.buildSearchRequest(searchQuery, credential, codenames),
    ).toBeNull();
  });
});

describe('wyzieMapping.toSearchHits', () => {
  it('maps a charlie row with its list-time hints', async () => {
    const hits = await readFixtureHits({...movieQuery, videoHash: VIDEO_HASH});
    const hit = findHit(hits, 'charlie:1955024019');
    expect(hit).toMatchObject({
      subtitleSource: SubtitleSource.WYZIE,
      siteFileId: 'charlie:1955024019',
      languageCode: 'eng',
      fileExtension: 'srt',
      isSitePack: false,
      isHearingImpaired: false,
      isMachineTranslated: false,
      siteDownloadCount: 48213,
      hashMatchVideoHashes: [VIDEO_HASH],
      subtitleAliases: [],
    });
    expect(hit.releaseNames.toSorted()).toEqual(
      [
        'Fixture.Movie.1999.1080p.BluRay.x264-GROUP',
        'Fixture.Movie.1999.720p.BluRay.x264-GROUP',
        'fixture.movie.1999.1080p.bluray.srt',
      ].toSorted(),
    );
  });

  it('fills no hash match without a hash match reason or a query hash', async () => {
    const hashlessHits = await readFixtureHits(movieQuery);
    expect(
      findHit(hashlessHits, 'charlie:1955024019').hashMatchVideoHashes,
    ).toEqual([]);
    const hashHits = await readFixtureHits({
      ...movieQuery,
      videoHash: VIDEO_HASH,
    });
    expect(findHit(hashHits, 'charlie:2001002').hashMatchVideoHashes).toEqual(
      [],
    );
  });

  it('reads the machine-translated quality flag and an integer id', async () => {
    const hits = await readFixtureHits();
    expect(findHit(hits, 'charlie:2001002')).toMatchObject({
      languageCode: 'tur',
      isHearingImpaired: true,
      isMachineTranslated: true,
      siteDownloadCount: null,
      releaseNames: [],
    });
  });

  it('maps an ssa row of xray to ass', async () => {
    const hits = await readFixtureHits();
    expect(findHit(hits, 'xray:x-77031')).toMatchObject({
      fileExtension: 'ass',
      siteDownloadCount: 12,
    });
  });

  it('drops AI rows, quebec rows, rows of a codename not asked and an unmapped language', async () => {
    const hits = await readFixtureHits();
    expect(hits.map(hit => hit.siteFileId)).toEqual([
      'charlie:1955024019',
      'charlie:2001002',
      'xray:x-77031',
    ]);
  });

  it('drops a quebec row even when quebec was asked', async () => {
    const searchBody = await readFixture(SEARCH_FIXTURE);
    const hits = wyzieMapping.toSearchHits(toOkResponse(searchBody), {
      searchQuery: movieQuery,
      credential: keyCredential,
      codenames: ['charlie', 'quebec', 'xray'],
    });
    expect(hits.some(hit => hit.siteFileId.startsWith('quebec:'))).toBe(false);
  });

  it('keeps every hit inside the hit schema', async () => {
    const hits = await readFixtureHits({...movieQuery, videoHash: VIDEO_HASH});
    expect(hits.length).toBeGreaterThan(0);
    for (const hit of hits) {
      expect(subtitleSourceHitSchema.safeParse(hit).success).toBe(true);
    }
  });

  it('keeps no billing link, token or key in a hit', async () => {
    const hits = await readFixtureHits({...movieQuery, videoHash: VIDEO_HASH});
    const hitsText = JSON.stringify(hits);
    expect(hitsText).not.toContain('tok=');
    expect(hitsText).not.toContain('fixture-tok-user-a');
    expect(hitsText).not.toContain('/c/');
    expect(hitsText).not.toContain(API_KEY);
  });

  it('stores a keyless re-search recipe of the movie row as its site file url', async () => {
    const hits = await readFixtureHits({...movieQuery, videoHash: VIDEO_HASH});
    const {siteFileUrl} = findHit(hits, 'charlie:1955024019');
    const recipeUrl = new URL(siteFileUrl);
    expect(recipeUrl.origin).toBe(WYZIE_ORIGIN);
    expect(recipeUrl.pathname).toBe('/search');
    expect(readQuery(siteFileUrl)).toEqual({
      id: 'tt0133093',
      language: 'en',
      source: 'charlie',
    });
  });

  it('stores the episode and kitsu forms in the re-search recipe', async () => {
    const searchBody = await readFixture(SEARCH_FIXTURE);
    const [episodeHit] = wyzieMapping.toSearchHits(toOkResponse(searchBody), {
      searchQuery: episodeQuery,
      credential: keyCredential,
      codenames: FREE_CODENAMES,
    });
    expect(readQuery(episodeHit.siteFileUrl)).toEqual({
      id: 'tt9900001',
      season: '1',
      episode: '3',
      language: 'en',
      source: 'charlie',
    });
    const [kitsuHit] = wyzieMapping.toSearchHits(toOkResponse(searchBody), {
      searchQuery: kitsuQuery,
      credential: keyCredential,
      codenames: FREE_CODENAMES,
    });
    expect(readQuery(kitsuHit.siteFileUrl)).toEqual({
      kitsu: '7442',
      episode: '15',
      language: 'en',
      source: 'charlie',
    });
  });

  it.each([
    ['a 404 without a body', toResponse(StatusCodes.NOT_FOUND, null)],
    [
      'a 404 no subtitles found',
      toRefusal(StatusCodes.NOT_FOUND, 'No subtitles found'),
    ],
    ['an empty list', toOkResponse([])],
  ])('gives no hits for %s', (_, response) => {
    expect(
      wyzieMapping.toSearchHits(response, {
        searchQuery: movieQuery,
        credential: keyCredential,
        codenames: FREE_CODENAMES,
      }),
    ).toEqual([]);
  });

  it('reads an object body in place of the row list as an unavailable source', () => {
    expect(
      catchError(() =>
        wyzieMapping.toSearchHits(toOkResponse({id: 1}), {
          searchQuery: movieQuery,
          credential: keyCredential,
          codenames: FREE_CODENAMES,
        }),
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });
});

describe('wyzieMapping regional rows', () => {
  const regionalQuery = {...movieQuery, languageCodes: ['spa', 'spl', 'zho']};

  async function readRegionalHits() {
    return wyzieMapping.toSearchHits(
      toOkResponse(await readFixture(REGIONAL_SEARCH_FIXTURE)),
      {
        searchQuery: regionalQuery,
        credential: keyCredential,
        codenames: FREE_CODENAMES,
      },
    );
  }

  it('reads an ea row as latin american spanish with an ea recipe', async () => {
    const hit = findHit(await readRegionalHits(), 'charlie:3100002');
    expect(hit.languageCode).toBe('spl');
    expect(readQuery(hit.siteFileUrl)).toEqual({
      id: 'tt0133093',
      language: 'ea',
      source: 'charlie',
    });
    expect(wyzieMapping.readRecipeLanguageCode(hit)).toBe('spl');
  });

  it('reads a zt row as chinese with a zh recipe', async () => {
    const hit = findHit(await readRegionalHits(), 'charlie:3100004');
    expect(hit.languageCode).toBe('zho');
    expect(readQuery(hit.siteFileUrl).language).toBe('zh');
  });

  it('keeps the es, ea, zh and zt rows and drops the AI es-419 row', async () => {
    expect(
      (await readRegionalHits()).map(({siteFileId, languageCode}) => [
        siteFileId,
        languageCode,
      ]),
    ).toEqual([
      ['charlie:3100001', 'spa'],
      ['charlie:3100002', 'spl'],
      ['charlie:3100003', 'zho'],
      ['charlie:3100004', 'zho'],
    ]);
  });

  it('finds the fresh link of an ea row in its ea re-search', async () => {
    const hit = findHit(await readRegionalHits(), 'charlie:3100002');
    const searchBody = (await readFixture(REGIONAL_SEARCH_FIXTURE)).map(
      row => ({
        ...row,
        url: row.url.replace('fixture-tok-user-a', 'fixture-tok-user-b'),
      }),
    );
    expect(
      wyzieMapping.findDownloadUrl(toOkResponse(searchBody), hit, {
        credential: keyCredential,
      }),
    ).toBe(
      'https://sub.wyzie.io/c/4d1e2f31/id/3100002?format=srt&encoding=UTF-8&lang=ea&id=tt0133093&tok=fixture-tok-user-b-32',
    );
  });
});

describe('wyzieMapping.toSearchHits 402 and 403', () => {
  function toHitsOf(response) {
    return () =>
      wyzieMapping.toSearchHits(response, {
        searchQuery: movieQuery,
        credential: keyCredential,
        codenames: FREE_CODENAMES,
      });
  }

  it('gives no hits and no error for a codename outside the free plan', () => {
    expect(
      toHitsOf(
        toRefusal(
          StatusCodes.FORBIDDEN,
          'Provider not available on free plan',
          {upgrade: 'https://sub.wyzie.io/pricing'},
        ),
      )(),
    ).toEqual([]);
  });

  it('reads a free-plan refusal in the charset the site names', () => {
    const refusalText = JSON.stringify({
      code: 403,
      message: 'Provider not available on free plan',
    });
    expect(
      toHitsOf(
        toResponse(StatusCodes.FORBIDDEN, Buffer.from(refusalText, 'utf16le'), {
          'content-type': 'application/json; charset=utf-16le',
        }),
      )(),
    ).toEqual([]);
  });

  it('rejects an invalid key as the credential', () => {
    const error = catchError(
      toHitsOf(toRefusal(StatusCodes.FORBIDDEN, 'Invalid API key')),
    );
    expect(error).toBeInstanceOf(SourceCredentialError);
    expect(error.credentialId).toBe(keyCredential.credentialId);
  });

  it('reads a key on hold as a limit reached on the credential', () => {
    const error = catchError(
      toHitsOf(
        toRefusal(StatusCodes.FORBIDDEN, 'Key on hold', {
          reinstate: 'https://sub.wyzie.io/reinstate',
          support: 'https://sub.wyzie.io/support',
        }),
      ),
    );
    expect(error).toBeInstanceOf(SourceRateLimitError);
    expect(error.credentialId).toBe(keyCredential.credentialId);
  });

  it('reads an exhausted pro balance as a limit reached on the credential', () => {
    const error = catchError(
      toHitsOf(
        toRefusal(
          StatusCodes.PAYMENT_REQUIRED,
          'Pro key request balance exhausted',
          {topup: 'https://sub.wyzie.io/topup'},
        ),
      ),
    );
    expect(error).toBeInstanceOf(SourceRateLimitError);
    expect(error.credentialId).toBe(keyCredential.credentialId);
  });

  it('rejects the credential for any other 403', () => {
    const error = catchError(
      toHitsOf(toRefusal(StatusCodes.FORBIDDEN, 'Forbidden')),
    );
    expect(error).toBeInstanceOf(SourceCredentialError);
  });

  it('keeps the key out of every refusal error', () => {
    const errors = [
      toRefusal(StatusCodes.FORBIDDEN, `Invalid API key ${API_KEY}`),
      toRefusal(StatusCodes.FORBIDDEN, 'Key on hold'),
      toRefusal(StatusCodes.PAYMENT_REQUIRED, 'Pro key balance exhausted'),
    ].map(response => catchError(toHitsOf(response)));
    for (const error of errors) {
      expect(error).toBeInstanceOf(SubtitleSourceError);
      expect(toErrorText(error)).not.toContain(API_KEY);
    }
  });
});

describe('wyzieMapping download re-mint', () => {
  const recipeUrl = `${WYZIE_ORIGIN}/search?id=tt0133093&language=en&source=charlie`;
  const subtitleRef = {
    subtitleSource: SubtitleSource.WYZIE,
    siteFileId: 'charlie:1955024019',
    siteFileUrl: recipeUrl,
    catalogSeason: null,
    catalogEpisode: null,
    isSitePack: false,
  };
  const downloaderCredential = makeSubtitleSourceCredential({
    apiKey: 'fixture-wyzie-key-b',
  });

  it('re-searches the stored recipe with the downloading key', () => {
    const searchRequest = wyzieMapping.buildDownloadSearchRequest(
      subtitleRef,
      downloaderCredential,
    );
    expect(new URL(searchRequest.url).origin).toBe(WYZIE_ORIGIN);
    expect(new URL(searchRequest.url).pathname).toBe('/search');
    expect(readQuery(searchRequest.url)).toEqual({
      id: 'tt0133093',
      language: 'en',
      source: 'charlie',
      key: 'fixture-wyzie-key-b',
    });
    expect(searchRequest).toMatchObject({
      subtitleSource: SubtitleSource.WYZIE,
      method: 'GET',
      responseType: 'json',
      credentialId: downloaderCredential.credentialId,
    });
  });

  it.each([
    ['no recipe', null],
    ['a recipe of another host', 'https://example.com/search?id=tt0133093'],
    [
      'a stored billing link',
      `${WYZIE_ORIGIN}/c/198e0c4d/id/1955024019?format=srt&tok=fixture-tok-user-a-1`,
    ],
  ])('refuses %s', (_, siteFileUrl) => {
    expect(() =>
      wyzieMapping.buildDownloadSearchRequest(
        {...subtitleRef, siteFileUrl},
        downloaderCredential,
      ),
    ).toThrow(SourceUnavailableError);
  });

  it('finds the fresh link of the same row in the re-search', async () => {
    const searchBody = (await readFixture(SEARCH_FIXTURE)).map(row => ({
      ...row,
      url: row.url.replace('fixture-tok-user-a', 'fixture-tok-user-b'),
    }));
    expect(
      wyzieMapping.findDownloadUrl(toOkResponse(searchBody), subtitleRef, {
        credential: downloaderCredential,
      }),
    ).toBe(
      'https://sub.wyzie.io/c/198e0c4d/id/1955024019?format=srt&encoding=UTF-8&tok=fixture-tok-user-b-1',
    );
  });

  it('fails when the re-search no longer lists the row', () => {
    expect(() =>
      wyzieMapping.findDownloadUrl(toOkResponse([]), subtitleRef, {
        credential: downloaderCredential,
      }),
    ).toThrow(SourceUnavailableError);
    expect(() =>
      wyzieMapping.findDownloadUrl(
        toResponse(StatusCodes.NOT_FOUND, null),
        subtitleRef,
        {credential: downloaderCredential},
      ),
    ).toThrow(SourceUnavailableError);
  });

  it('fetches the fresh link as it is, as bytes, on the downloading credential', () => {
    const downloadUrl =
      'https://sub.wyzie.io/c/198e0c4d/id/1955024019?format=srt&encoding=UTF-8&tok=fixture-tok-user-b-1';
    const downloadRequest = wyzieMapping.buildDownloadRequest(
      downloadUrl,
      downloaderCredential,
    );
    expect(downloadRequest).toMatchObject({
      subtitleSource: SubtitleSource.WYZIE,
      url: downloadUrl,
      method: 'GET',
      responseType: 'bytes',
      credentialId: downloaderCredential.credentialId,
    });
    expect(downloadRequest.acceptedStatuses.toSorted()).toEqual([
      StatusCodes.PAYMENT_REQUIRED,
      StatusCodes.FORBIDDEN,
    ]);
  });

  it('reads a download refusal like a search refusal', () => {
    const holdError = catchError(() =>
      wyzieMapping.toDownload(
        toRefusal(StatusCodes.FORBIDDEN, 'Key on hold'),
        downloaderCredential,
      ),
    );
    expect(holdError).toBeInstanceOf(SourceRateLimitError);
    expect(holdError.credentialId).toBe(downloaderCredential.credentialId);
    expect(() =>
      wyzieMapping.toDownload(
        toRefusal(StatusCodes.FORBIDDEN, 'Invalid API key'),
        downloaderCredential,
      ),
    ).toThrow(SourceCredentialError);
    expect(() =>
      wyzieMapping.toDownload(
        toResponse(StatusCodes.NOT_FOUND, null),
        downloaderCredential,
      ),
    ).toThrow(SourceUnavailableError);
  });

  it('serves the file bytes with the served file name', () => {
    const fileBytes = toSrtBytes([['00:00:07,000', '00:00:09,000', 'Hello.']]);
    expect(
      wyzieMapping.toDownload(
        toResponse(StatusCodes.OK, fileBytes, {
          'content-type': 'text/plain',
          'content-disposition':
            'attachment; filename="fixture.movie.1999.srt"',
        }),
        downloaderCredential,
      ),
    ).toEqual({
      fileBytes,
      fileNameHint: 'fixture.movie.1999.srt',
      extractedEntryPath: null,
    });
  });
});

describe('wyzieMapping.dropUpsellCues (G40)', () => {
  it('drops the free-plan upsell cue before 6 s', () => {
    const fileBytes = toSrtBytes([
      ['00:00:00,500', '00:00:05,000', UPSELL_TEXT],
      ['00:00:07,000', '00:00:09,000', 'Hello.'],
    ]);
    expect(readCueTexts(wyzieMapping.dropUpsellCues(fileBytes))).toEqual([
      'Hello.',
    ]);
  });

  it('keeps the same text from 6 s on', () => {
    const fileBytes = toSrtBytes([
      ['00:00:06,000', '00:00:08,000', UPSELL_TEXT],
      ['00:00:09,000', '00:00:10,000', 'Hello.'],
    ]);
    expect(readCueTexts(wyzieMapping.dropUpsellCues(fileBytes))).toEqual([
      UPSELL_TEXT,
      'Hello.',
    ]);
  });

  it('leaves a file without the upsell cue byte for byte', () => {
    const fileBytes = toSrtBytes([
      ['00:00:00,500', '00:00:02,000', 'Previously on Fixture Show.'],
      ['00:00:03,000', '00:00:05,000', 'Hello.'],
    ]);
    expect(
      Buffer.from(wyzieMapping.dropUpsellCues(fileBytes)).equals(
        Buffer.from(fileBytes),
      ),
    ).toBe(true);
  });

  it('drops the upsell cue of an ass file', () => {
    const assText = [
      '[Script Info]',
      'ScriptType: v4.00+',
      '',
      '[Events]',
      'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
      `Dialogue: 0,0:00:00.50,0:00:05.00,Default,,0,0,0,,${UPSELL_TEXT}`,
      'Dialogue: 0,0:00:07.00,0:00:09.00,Default,,0,0,0,,Hello.',
      '',
    ].join('\n');
    expect(
      readCueTexts(
        wyzieMapping.dropUpsellCues(new TextEncoder().encode(assText)),
      ),
    ).toEqual(['Hello.']);
  });

  it('drops the upsell cue while serving a download', () => {
    const fileBytes = toSrtBytes([
      ['00:00:00,500', '00:00:05,000', UPSELL_TEXT],
      ['00:00:07,000', '00:00:09,000', 'Hello.'],
    ]);
    const {fileBytes: servedBytes} = wyzieMapping.toDownload(
      toResponse(StatusCodes.OK, fileBytes, {'content-type': 'text/plain'}),
      keyCredential,
    );
    expect(readCueTexts(servedBytes)).toEqual(['Hello.']);
  });
});

describe('wyzieMapping key scope and credential check', () => {
  it('checks a key through /sources with the key', () => {
    const checkRequest =
      wyzieMapping.buildCredentialCheckRequest(keyCredential);
    expect(new URL(checkRequest.url).origin).toBe(WYZIE_ORIGIN);
    expect(new URL(checkRequest.url).pathname).toBe('/sources');
    expect(readQuery(checkRequest.url)).toEqual({key: API_KEY});
    expect(checkRequest).toMatchObject({
      subtitleSource: SubtitleSource.WYZIE,
      method: 'GET',
      responseType: 'json',
      credentialId: keyCredential.credentialId,
    });
  });

  it('reads the codenames the key may use', async () => {
    expect(
      wyzieMapping.toKeyScope(toOkResponse(await readFixture(SOURCES_FIXTURE))),
    ).toEqual({
      isKeyValid: true,
      availableCodenames: ['charlie', 'oscar', 'quebec', 'xray'],
    });
  });

  it('reads an unverified key as an unknown plan', () => {
    expect(
      wyzieMapping.toKeyScope(
        toOkResponse({sources: ['charlie'], key: {valid: null}}),
      ),
    ).toEqual({isKeyValid: null, availableCodenames: null});
  });

  it('reads a valid key as valid', async () => {
    expect(
      wyzieMapping.toCredentialCheck(
        toOkResponse(await readFixture(SOURCES_FIXTURE)),
      ),
    ).toEqual({
      credentialStatus: CredentialStatus.VALID,
      quotaRemainingCount: null,
      quotaAllowedCount: null,
      quotaResetAt: null,
    });
  });

  it('reads an unknown key as invalid', () => {
    expect(
      wyzieMapping.toCredentialCheck(
        toOkResponse({
          sources: ['charlie'],
          key: {valid: false},
          available: [],
          restricted: [],
        }),
      ).credentialStatus,
    ).toBe(CredentialStatus.INVALID);
  });

  it('fails a check the site could not verify instead of calling the key invalid', () => {
    expect(() =>
      wyzieMapping.toCredentialCheck(
        toOkResponse({sources: ['charlie'], key: {valid: null}}),
      ),
    ).toThrow(SourceUnavailableError);
  });
});

describe('wyzieMapping quota', () => {
  it('reads the quota through /usage with the key', () => {
    const quotaRequest = wyzieMapping.buildQuotaRequest(keyCredential);
    expect(new URL(quotaRequest.url).origin).toBe(WYZIE_ORIGIN);
    expect(new URL(quotaRequest.url).pathname).toBe('/usage');
    expect(readQuery(quotaRequest.url)).toMatchObject({key: API_KEY});
    expect(quotaRequest).toMatchObject({
      subtitleSource: SubtitleSource.WYZIE,
      method: 'GET',
      credentialId: keyCredential.credentialId,
    });
  });

  it('reads the balance, the daily limit and the reset time', async () => {
    expect(
      wyzieMapping.toQuota(toOkResponse(await readFixture(USAGE_FIXTURE))),
    ).toEqual({
      credentialStatus: CredentialStatus.VALID,
      quotaRemainingCount: 812,
      quotaAllowedCount: 1000,
      quotaResetAt: new Date(1763510400 * 1000).toISOString(),
    });
  });

  it('reads a held key as limit reached', async () => {
    const usageBody = await readFixture(USAGE_FIXTURE);
    expect(
      wyzieMapping.toQuota(toOkResponse({...usageBody, held: true}))
        .credentialStatus,
    ).toBe(CredentialStatus.LIMITED);
  });

  it('reads an invalid key on /usage as invalid', () => {
    expect(
      wyzieMapping.toQuota(toRefusal(StatusCodes.FORBIDDEN, 'Invalid API key'))
        .credentialStatus,
    ).toBe(CredentialStatus.INVALID);
  });
});

describe('wyzieMapping quota cost and wire forms', () => {
  function toBytesRefusal(status, message) {
    return toResponse(
      status,
      new TextEncoder().encode(JSON.stringify({code: status, message})),
      {'content-type': 'application/json'},
    );
  }

  it('marks every hit quota costly, so only a download the user starts spends the key', async () => {
    const hits = await readFixtureHits();
    expect(hits).toHaveLength(3);
    expect(hits.every(hit => hit.isQuotaCostly === true)).toBe(true);
  });

  it('reads a download refusal served as bytes like a json one', () => {
    const holdError = catchError(() =>
      wyzieMapping.toDownload(
        toBytesRefusal(StatusCodes.FORBIDDEN, 'Key on hold'),
        keyCredential,
      ),
    );
    expect(holdError).toBeInstanceOf(SourceRateLimitError);
    expect(holdError.credentialId).toBe(keyCredential.credentialId);
    expect(() =>
      wyzieMapping.toDownload(
        toBytesRefusal(StatusCodes.FORBIDDEN, 'Invalid API key'),
        keyCredential,
      ),
    ).toThrow(SourceCredentialError);
    expect(
      catchError(() =>
        wyzieMapping.toDownload(
          toBytesRefusal(StatusCodes.PAYMENT_REQUIRED, 'Balance exhausted'),
          keyCredential,
        ),
      ),
    ).toBeInstanceOf(SourceRateLimitError);
  });

  it('asks plain two-letter codes for portuguese and chinese', () => {
    expect(
      readQuery(
        wyzieMapping.buildSearchRequest(
          {...movieQuery, languageCodes: ['por', 'zho', 'pob']},
          keyCredential,
          FREE_CODENAMES,
        ).url,
      ).language,
    ).toBe('pt,zh,pt-br');
  });

  it('refuses a fresh link on another host', () => {
    const subtitleRef = {
      subtitleSource: SubtitleSource.WYZIE,
      siteFileId: 'charlie:1955024019',
      siteFileUrl: `${WYZIE_ORIGIN}/search?id=tt0133093&language=en&source=charlie`,
      catalogSeason: null,
      catalogEpisode: null,
      isSitePack: false,
    };
    expect(() =>
      wyzieMapping.findDownloadUrl(
        toOkResponse([
          {
            id: '1955024019',
            source: 'charlie',
            language: 'en',
            url: 'https://example.com/c/198e0c4d/id/1955024019?tok=fixture',
          },
        ]),
        subtitleRef,
        {credential: keyCredential},
      ),
    ).toThrow(SourceUnavailableError);
  });

  it('drops the key, token and hash of a stored recipe before the re-search', () => {
    const searchRequest = wyzieMapping.buildDownloadSearchRequest(
      {
        subtitleSource: SubtitleSource.WYZIE,
        siteFileId: 'charlie:1955024019',
        siteFileUrl: `${WYZIE_ORIGIN}/search?id=tt0133093&language=en&source=charlie&key=fixture-wyzie-key-old&tok=fixture-tok&hash=${VIDEO_HASH}`,
        catalogSeason: null,
        catalogEpisode: null,
        isSitePack: false,
      },
      keyCredential,
    );
    expect(readQuery(searchRequest.url)).toEqual({
      id: 'tt0133093',
      language: 'en',
      source: 'charlie',
      key: API_KEY,
    });
  });

  it('asks nothing for an episode without its season', () => {
    expect(
      wyzieMapping.buildSearchRequest(
        {...episodeQuery, catalogSeason: null},
        keyCredential,
        FREE_CODENAMES,
      ),
    ).toBeNull();
  });

  it('reads a 403 without a wyzie error body as an unavailable source, never a rejected key', () => {
    for (const refusalBody of [
      new TextEncoder().encode('<html>Forbidden</html>'),
      null,
      {code: 403},
    ]) {
      expect(() =>
        wyzieMapping.toDownload(
          toResponse(StatusCodes.FORBIDDEN, refusalBody),
          keyCredential,
        ),
      ).toThrow(SourceUnavailableError);
    }
  });

  it('reads a free-plan refusal outside a search as an unavailable source', () => {
    const freePlanRefusal = toRefusal(
      StatusCodes.FORBIDDEN,
      'Provider not available on free plan',
    );
    expect(() =>
      wyzieMapping.toDownload(freePlanRefusal, keyCredential),
    ).toThrow(SourceUnavailableError);
    expect(() => wyzieMapping.toQuota(freePlanRefusal)).toThrow(
      SourceUnavailableError,
    );
    expect(() =>
      wyzieMapping.toCredentialCheck(
        toRefusal(StatusCodes.FORBIDDEN, 'Invalid API key'),
        keyCredential,
      ),
    ).toThrow(SourceCredentialError);
  });
});

describe('wyzieMapping legacy encodings (G40)', () => {
  async function readWindows1254Fixture(fixtureName) {
    return iconv.encode(
      (await readFixture(`subtitle-sources/wyzie/${fixtureName}`)).toString(
        'utf8',
      ),
      'win1254',
    );
  }

  function readStoredCueTexts(fileBytes) {
    return buildFileFacts({
      bytes: fileBytes,
      fileNameHint: null,
      expectedLanguageCode: 'tur',
      fallbackFrameRate: null,
    }).parsedSubtitle.cues.map(({text}) => text);
  }

  it('keeps the Turkish letters of a Windows-1254 file while dropping the upsell cue', async () => {
    const fileBytes = await readWindows1254Fixture('upsell-turkish.srt');
    const keptBytes = wyzieMapping.dropUpsellCues(fileBytes, {
      languageCodeHint: 'tur',
    });
    expect(readStoredCueTexts(keptBytes)).toEqual(["Şişli'de ığdır İstanbul"]);
    expect(
      Buffer.from(keptBytes).equals(
        Buffer.from(fileBytes.subarray(fileBytes.indexOf('\n\n2\n') + 2)),
      ),
    ).toBe(true);
  });

  it('serves a Windows-1254 download in its recipe language, readable', async () => {
    const fileBytes = await readWindows1254Fixture('upsell-turkish.srt');
    const {fileBytes: servedBytes} = wyzieMapping.toDownload(
      toResponse(StatusCodes.OK, fileBytes, {'content-type': 'text/plain'}),
      keyCredential,
      {languageCode: 'tur'},
    );
    expect(readStoredCueTexts(servedBytes)).toEqual([
      "Şişli'de ığdır İstanbul",
    ]);
  });

  it('leaves a Windows-1254 file without the upsell cue byte for byte', async () => {
    const fileBytes = await readWindows1254Fixture('plain-turkish.srt');
    const keptBytes = wyzieMapping.dropUpsellCues(fileBytes, {
      languageCodeHint: 'tur',
    });
    expect(Buffer.from(keptBytes).equals(Buffer.from(fileBytes))).toBe(true);
  });
});

describe('wyzieMapping recipe language form', () => {
  async function readRecipeLanguage(siteLanguage) {
    const [searchRow] = await readFixture(SEARCH_FIXTURE);
    const [hit] = wyzieMapping.toSearchHits(
      toOkResponse([{...searchRow, language: siteLanguage}]),
      {
        searchQuery: {...movieQuery, languageCodes: ['pob', 'zho']},
        credential: keyCredential,
        codenames: FREE_CODENAMES,
      },
    );
    return readQuery(hit.siteFileUrl).language;
  }

  it('re-searches a brazilian portuguese row with pt-br', async () => {
    expect(await readRecipeLanguage('pt-br')).toBe('pt-br');
    expect(await readRecipeLanguage('pb')).toBe('pt-br');
  });

  it('re-searches with the form the search sends, not the row form', async () => {
    expect(await readRecipeLanguage('EN')).toBe('en');
    expect(await readRecipeLanguage('zh-cn')).toBe('zh');
  });
});

describe('wyzieMapping fresh link pick', () => {
  const subtitleRef = {
    subtitleSource: SubtitleSource.WYZIE,
    siteFileId: 'charlie:1955024019',
    siteFileUrl: `${WYZIE_ORIGIN}/search?id=tt0133093&language=en&source=charlie`,
    catalogSeason: null,
    catalogEpisode: null,
    isSitePack: false,
  };
  const fileUrl = `${WYZIE_ORIGIN}/c/198e0c4d/id/1955024019?format=srt&tok=fixture-tok-b`;

  function findUrl(rows) {
    return () =>
      wyzieMapping.findDownloadUrl(toOkResponse(rows), subtitleRef, {
        credential: keyCredential,
      });
  }

  it('skips an AI row that shares the id', () => {
    expect(
      findUrl([
        {
          id: '1955024019',
          source: 'charlie',
          ai: true,
          url: `${WYZIE_ORIGIN}/c/ai/id/1955024019?tok=fixture-tok-ai`,
        },
        {id: '1955024019', source: 'charlie', ai: false, url: fileUrl},
      ])(),
    ).toBe(fileUrl);
  });

  it('refuses a link outside the file path', () => {
    expect(
      findUrl([
        {
          id: '1955024019',
          source: 'charlie',
          url: `${WYZIE_ORIGIN}/translate?id=tt0133093&target=en&tk=fixture`,
        },
      ]),
    ).toThrow(SourceUnavailableError);
  });
});
