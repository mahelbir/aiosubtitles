import crypto from 'node:crypto';
import {StatusCodes} from 'http-status-codes';
import iconv from 'iconv-lite';
import {describe, expect, it, vi} from 'vitest';
import {
  CredentialKind,
  CredentialStatus,
} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {buildFileFacts} from '@repo/subtitle-core/file-format/file-facts.js';
import {sealCredentialSecret} from '../../../src/lib/credential-secret.js';
import {
  readDownloadCredentials,
  readSearchCredentials,
  toCandidateCredentials,
} from '../../../src/lib/subtitle-source-credentials.js';
import {listSubtitleSourceClients} from '../../../src/lib/subtitle-sources/subtitle-source-clients.js';
import {SubtitleSourceBudgetScope} from '../../../src/lib/subtitle-sources/subtitle-source-contract.js';
import {
  SourceCredentialError,
  SourceRateLimitError,
  SourceUnavailableError,
  SubtitleSourceError,
} from '../../../src/lib/subtitle-sources/subtitle-source-errors.js';
import {
  createWyzieClient,
  wyzieClient,
} from '../../../src/lib/subtitle-sources/wyzie/wyzie-client.js';
import {toErrorText} from '../../helpers/caught-error.js';
import {readFixture} from '../../helpers/read-fixture.js';
import {
  makeSearchQuery,
  makeSubtitleSourceCredential,
} from '../../helpers/subtitle-source-factories.js';

const API_KEY_A = 'fixture-wyzie-key-a';
const API_KEY_B = 'fixture-wyzie-key-b';
const TOK_LABEL_A = 'fixture-tok-user-a';
const TOK_LABEL_B = 'fixture-tok-user-b';
const SEARCH_FIXTURE = 'subtitle-sources/wyzie/search.json';
const SOURCES_FIXTURE = 'subtitle-sources/wyzie/sources-key.json';
const USAGE_FIXTURE = 'subtitle-sources/wyzie/usage.json';
const SITE_FILE_ID = 'charlie:1955024019';
const FILE_TEXT = '1\n00:00:07,000 --> 00:00:09,000\nHello.\n';
const credentialA = makeSubtitleSourceCredential({apiKey: API_KEY_A});
const credentialB = makeSubtitleSourceCredential({apiKey: API_KEY_B});
const recipeRef = {
  subtitleSource: SubtitleSource.WYZIE,
  siteFileId: SITE_FILE_ID,
  siteFileUrl:
    'https://sub.wyzie.io/search?id=tt0133093&language=en&source=charlie',
  catalogSeason: null,
  catalogEpisode: null,
  isSitePack: false,
};
const movieQuery = makeSearchQuery({
  videoId: 'tt0133093',
  imdbId: 'tt0133093',
  languageCodes: ['eng'],
});

function toJsonResponse(status, body) {
  return {status, headers: {'content-type': 'application/json'}, body};
}

function toTokLabel(apiKey) {
  return apiKey === API_KEY_A ? TOK_LABEL_A : TOK_LABEL_B;
}

async function createFakeSite({searchResponse = null, sourcesBody} = {}) {
  const [searchRows, defaultSourcesBody] = await Promise.all([
    readFixture(SEARCH_FIXTURE),
    readFixture(SOURCES_FIXTURE),
  ]);
  return vi.fn(async ({url}) => {
    const siteUrl = new URL(url);
    const apiKey = siteUrl.searchParams.get('key');
    if (siteUrl.pathname === '/sources') {
      return toJsonResponse(StatusCodes.OK, sourcesBody ?? defaultSourcesBody);
    }
    if (siteUrl.pathname === '/search') {
      return (
        searchResponse ??
        toJsonResponse(
          StatusCodes.OK,
          searchRows.map(row => ({
            ...row,
            url: row.url.replace(TOK_LABEL_A, toTokLabel(apiKey)),
          })),
        )
      );
    }
    if (siteUrl.pathname.startsWith('/c/')) {
      return {
        status: StatusCodes.OK,
        headers: {'content-type': 'text/plain'},
        body: new TextEncoder().encode(FILE_TEXT),
      };
    }
    throw new Error(`Unexpected fixture request ${siteUrl.pathname}.`);
  });
}

function createStoreSpy() {
  const storedEntries = new Map();
  return {
    storedEntries,
    get: key => storedEntries.get(key),
    set: (key, storedValue) => {
      storedEntries.set(key, storedValue);
    },
  };
}

function createLoggerSpy() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function createTestClient(requestSubtitleSource) {
  const availableCodenamesStore = createStoreSpy();
  const logger = createLoggerSpy();
  return {
    client: createWyzieClient({
      requestSubtitleSource,
      availableCodenamesStore,
      logger,
    }),
    availableCodenamesStore,
    logger,
  };
}

function listRequestUrls(requestSubtitleSource) {
  return requestSubtitleSource.mock.calls.map(([{url}]) => new URL(url));
}

function toSubtitleRef(hit) {
  return {
    subtitleSource: hit.subtitleSource,
    siteFileId: hit.siteFileId,
    siteFileUrl: hit.siteFileUrl,
    catalogSeason: null,
    catalogEpisode: null,
    isSitePack: hit.isSitePack,
  };
}

describe('wyzieClient', () => {
  it('names its subtitle source and needs an api key', () => {
    expect(wyzieClient.subtitleSource).toBe(SubtitleSource.WYZIE);
    expect(wyzieClient.credentialKinds).toEqual([CredentialKind.API_KEY]);
    expect(wyzieClient.canSearchWithoutCredential()).toBe(false);
    expect(wyzieClient.canDownloadWithoutCredential()).toBe(false);
  });

  it('marks hash matches, so a hash search is cached apart', () => {
    expect(wyzieClient.isSearchHashSensitive).toBe(true);
  });

  it('declares the free key limit per UTC day', () => {
    expect(wyzieClient.downloadBudgets).toEqual([
      {
        budgetScope: SubtitleSourceBudgetScope.CREDENTIAL,
        windowMs: 86400000,
        requestMax: 1000,
      },
    ]);
  });

  it('implements the search, download, credential check and quota calls', () => {
    expect(wyzieClient.searchSubtitles).toBeTypeOf('function');
    expect(wyzieClient.downloadSubtitle).toBeTypeOf('function');
    expect(wyzieClient.checkCredential).toBeTypeOf('function');
    expect(wyzieClient.readQuota).toBeTypeOf('function');
  });

  it('is registered with the subtitle source clients', () => {
    expect(listSubtitleSourceClients()).toContain(wyzieClient);
  });
});

describe('wyzieClient search', () => {
  it('reads the key plan once per key, then searches the codenames it allows', async () => {
    const requestSubtitleSource = await createFakeSite();
    const {client} = createTestClient(requestSubtitleSource);
    const hits = await client.searchSubtitles(movieQuery, credentialA);
    expect(hits.map(hit => hit.siteFileId)).toContain(SITE_FILE_ID);
    await client.searchSubtitles(movieQuery, credentialA);
    const requestPaths = listRequestUrls(requestSubtitleSource).map(
      siteUrl => siteUrl.pathname,
    );
    expect(requestPaths).toEqual(['/sources', '/search', '/search']);
    const searchUrl = listRequestUrls(requestSubtitleSource)[1];
    expect(searchUrl.searchParams.get('source').split(',').toSorted()).toEqual([
      'charlie',
      'xray',
    ]);
    expect(searchUrl.searchParams.get('key')).toBe(API_KEY_A);
  });

  it('reads the plan of a second key on its own', async () => {
    const requestSubtitleSource = await createFakeSite();
    const {client} = createTestClient(requestSubtitleSource);
    await client.searchSubtitles(movieQuery, credentialA);
    await client.searchSubtitles(movieQuery, credentialB);
    const sourcesKeys = listRequestUrls(requestSubtitleSource)
      .filter(siteUrl => siteUrl.pathname === '/sources')
      .map(siteUrl => siteUrl.searchParams.get('key'));
    expect(sourcesKeys).toEqual([API_KEY_A, API_KEY_B]);
  });

  it('caches the key plan under no key and with no key', async () => {
    const requestSubtitleSource = await createFakeSite();
    const {client, availableCodenamesStore} = createTestClient(
      requestSubtitleSource,
    );
    await client.searchSubtitles(movieQuery, credentialA);
    await client.searchSubtitles(movieQuery, credentialB);
    expect(availableCodenamesStore.storedEntries.size).toBeGreaterThan(0);
    const storeText = JSON.stringify([
      ...availableCodenamesStore.storedEntries,
    ]);
    expect(storeText).not.toContain(API_KEY_A);
    expect(storeText).not.toContain(API_KEY_B);
  });

  it('searches no codename outside the key plan', async () => {
    const requestSubtitleSource = await createFakeSite({
      sourcesBody: {
        sources: ['charlie', 'xray'],
        key: {valid: true, type: 'free'},
        available: ['charlie'],
        restricted: ['xray'],
      },
    });
    const {client} = createTestClient(requestSubtitleSource);
    await client.searchSubtitles(movieQuery, credentialA);
    const searchUrl = listRequestUrls(requestSubtitleSource).find(
      siteUrl => siteUrl.pathname === '/search',
    );
    expect(searchUrl.searchParams.get('source')).toBe('charlie');
  });

  it('rejects a key the plan lookup calls invalid without searching', async () => {
    const requestSubtitleSource = await createFakeSite({
      sourcesBody: {
        sources: ['charlie'],
        key: {valid: false},
        available: [],
        restricted: [],
      },
    });
    const {client} = createTestClient(requestSubtitleSource);
    const error = await client
      .searchSubtitles(movieQuery, credentialA)
      .catch(searchError => searchError);
    expect(error).toBeInstanceOf(SourceCredentialError);
    expect(error.credentialId).toBe(credentialA.credentialId);
    expect(toErrorText(error)).not.toContain(API_KEY_A);
    expect(
      listRequestUrls(requestSubtitleSource).map(siteUrl => siteUrl.pathname),
    ).toEqual(['/sources']);
  });

  it('answers a codename outside the free plan with no hits and no error', async () => {
    const requestSubtitleSource = await createFakeSite({
      searchResponse: toJsonResponse(StatusCodes.FORBIDDEN, {
        code: 403,
        message: 'Provider not available on free plan',
      }),
    });
    const {client} = createTestClient(requestSubtitleSource);
    await expect(
      client.searchSubtitles(movieQuery, credentialA),
    ).resolves.toEqual([]);
  });

  it('reads a key on hold as a limit reached on that key', async () => {
    const requestSubtitleSource = await createFakeSite({
      searchResponse: toJsonResponse(StatusCodes.FORBIDDEN, {
        code: 403,
        message: 'Key on hold',
      }),
    });
    const {client} = createTestClient(requestSubtitleSource);
    const error = await client
      .searchSubtitles(movieQuery, credentialA)
      .catch(searchError => searchError);
    expect(error).toBeInstanceOf(SourceRateLimitError);
    expect(error.credentialId).toBe(credentialA.credentialId);
  });

  it('answers a 404 with no hits', async () => {
    const requestSubtitleSource = await createFakeSite({
      searchResponse: {status: StatusCodes.NOT_FOUND, headers: {}, body: null},
    });
    const {client} = createTestClient(requestSubtitleSource);
    await expect(
      client.searchSubtitles(movieQuery, credentialA),
    ).resolves.toEqual([]);
  });

  it('logs no key on any path', async () => {
    const requestSubtitleSource = await createFakeSite({
      searchResponse: toJsonResponse(StatusCodes.FORBIDDEN, {
        code: 403,
        message: 'Invalid API key',
      }),
    });
    const {client, logger} = createTestClient(requestSubtitleSource);
    await client.searchSubtitles(movieQuery, credentialA).catch(() => null);
    await client.downloadSubtitle(recipeRef, credentialB).catch(() => null);
    const logText = JSON.stringify(
      Object.values(logger).flatMap(logMethod => logMethod.mock.calls),
    );
    expect(logText).not.toContain(API_KEY_A);
    expect(logText).not.toContain(API_KEY_B);
  });
});

describe('wyzieClient download (ruling N1)', () => {
  it('never calls a link minted with another user key', async () => {
    const requestSubtitleSource = await createFakeSite();
    const {client} = createTestClient(requestSubtitleSource);
    const hits = await client.searchSubtitles(movieQuery, credentialA);
    const subtitleRef = toSubtitleRef(
      hits.find(hit => hit.siteFileId === SITE_FILE_ID),
    );
    requestSubtitleSource.mockClear();

    const download = await client.downloadSubtitle(subtitleRef, credentialB);

    expect(new TextDecoder().decode(download.fileBytes)).toBe(FILE_TEXT);
    const requestUrls = listRequestUrls(requestSubtitleSource);
    for (const requestUrl of requestUrls) {
      expect(requestUrl.href).not.toContain(TOK_LABEL_A);
      expect(requestUrl.href).not.toContain(API_KEY_A);
    }
    const searchUrl = requestUrls.find(
      requestUrl => requestUrl.pathname === '/search',
    );
    expect(searchUrl.searchParams.get('key')).toBe(API_KEY_B);
    const fileUrl = requestUrls.find(requestUrl =>
      requestUrl.pathname.startsWith('/c/'),
    );
    expect(fileUrl.searchParams.get('tok')).toBe(`${TOK_LABEL_B}-1`);
    expect(
      requestSubtitleSource.mock.calls.every(
        ([request]) => request.credentialId === credentialB.credentialId,
      ),
    ).toBe(true);
  });

  it('fails when the re-search lists the row no more, with no stored link to fall back on', async () => {
    const requestSubtitleSource = await createFakeSite({
      searchResponse: toJsonResponse(StatusCodes.OK, []),
    });
    const {client} = createTestClient(requestSubtitleSource);
    await expect(
      client.downloadSubtitle(recipeRef, credentialB),
    ).rejects.toBeInstanceOf(SubtitleSourceError);
    expect(
      listRequestUrls(requestSubtitleSource).some(requestUrl =>
        requestUrl.pathname.startsWith('/c/'),
      ),
    ).toBe(false);
  });
});

describe('wyzieClient without a key (D32)', () => {
  it('searches nothing without a credential', async () => {
    const requestSubtitleSource = await createFakeSite();
    const {client} = createTestClient(requestSubtitleSource);
    await expect(client.searchSubtitles(movieQuery, null)).resolves.toEqual([]);
    expect(requestSubtitleSource).not.toHaveBeenCalled();
  });

  it('downloads nothing without a credential', async () => {
    const requestSubtitleSource = await createFakeSite();
    const {client} = createTestClient(requestSubtitleSource);
    await expect(
      client.downloadSubtitle(recipeRef, null),
    ).rejects.toBeInstanceOf(SubtitleSourceError);
    expect(requestSubtitleSource).not.toHaveBeenCalled();
  });
});

describe('wyzie credentials of a user (D32)', () => {
  const userConfigId = crypto.randomUUID();

  function makeWyzieCredentialRow(credentialStatus) {
    return {
      credentialId: crypto.randomUUID(),
      subtitleSource: SubtitleSource.WYZIE,
      credentialKind: CredentialKind.API_KEY,
      credentialStatus,
      credentialPosition: 0,
      sealedSecret: sealCredentialSecret({
        userConfigId,
        subtitleSource: SubtitleSource.WYZIE,
        credentialSecret: {apiKey: API_KEY_A},
      }),
    };
  }

  function readCandidates(credentialRows) {
    const cachedUserConfig = {userConfigId, credentials: credentialRows};
    return {
      searchCandidates: toCandidateCredentials({
        ...readSearchCredentials({cachedUserConfig, client: wyzieClient}),
        canUseWithoutCredential: wyzieClient.canSearchWithoutCredential(),
      }),
      downloadCandidates: readDownloadCredentials({
        cachedUserConfig,
        client: wyzieClient,
      }),
    };
  }

  it('gives a user with a wyzie key only that key, never a keyless path', () => {
    const {searchCandidates, downloadCandidates} = readCandidates([
      makeWyzieCredentialRow(CredentialStatus.VALID),
    ]);
    expect(searchCandidates.map(({apiKey}) => apiKey)).toEqual([API_KEY_A]);
    expect(downloadCandidates.map(({apiKey}) => apiKey)).toEqual([API_KEY_A]);
  });

  it('gives a user whose wyzie key is invalid no path at all', () => {
    const {searchCandidates, downloadCandidates} = readCandidates([
      makeWyzieCredentialRow(CredentialStatus.INVALID),
    ]);
    expect(searchCandidates).toEqual([]);
    expect(downloadCandidates).toEqual([]);
  });

  it('gives a user without a wyzie key no wyzie call', () => {
    const {searchCandidates, downloadCandidates} = readCandidates([]);
    expect(searchCandidates).toEqual([]);
    expect(downloadCandidates).toEqual([]);
  });
});

describe('wyzieClient credential check and quota', () => {
  it('checks the key through /sources with the key', async () => {
    const requestSubtitleSource = await createFakeSite();
    const {client} = createTestClient(requestSubtitleSource);
    await expect(client.checkCredential(credentialA)).resolves.toMatchObject({
      credentialStatus: CredentialStatus.VALID,
    });
    const [checkUrl] = listRequestUrls(requestSubtitleSource);
    expect(checkUrl.pathname).toBe('/sources');
    expect(checkUrl.searchParams.get('key')).toBe(API_KEY_A);
  });

  it('reads the quota through /usage with the key', async () => {
    const usageBody = await readFixture(USAGE_FIXTURE);
    const requestSubtitleSource = vi.fn(async () =>
      toJsonResponse(StatusCodes.OK, usageBody),
    );
    const {client} = createTestClient(requestSubtitleSource);
    await expect(client.readQuota(credentialA)).resolves.toMatchObject({
      quotaRemainingCount: 812,
      quotaAllowedCount: 1000,
    });
    const [quotaUrl] = listRequestUrls(requestSubtitleSource);
    expect(quotaUrl.pathname).toBe('/usage');
    expect(quotaUrl.searchParams.get('key')).toBe(API_KEY_A);
  });
});

describe('wyzieClient expired file links', () => {
  it('reads a refused file link as an unavailable file, never a rejected key', async () => {
    const fakeSite = await createFakeSite();
    const requestSubtitleSource = vi.fn(async request => {
      if (new URL(request.url).pathname.startsWith('/c/')) {
        throw new SourceCredentialError({
          subtitleSource: SubtitleSource.WYZIE,
          credentialId: request.credentialId,
        });
      }
      return fakeSite(request);
    });
    const {client} = createTestClient(requestSubtitleSource);
    const error = await client
      .downloadSubtitle(recipeRef, credentialB)
      .catch(downloadError => downloadError);
    expect(error).toBeInstanceOf(SourceUnavailableError);
  });

  it('searches the default sources when the plan lookup fails, and logs no key', async () => {
    const fakeSite = await createFakeSite();
    const requestSubtitleSource = vi.fn(async request => {
      if (new URL(request.url).pathname === '/sources') {
        throw new SourceUnavailableError({
          subtitleSource: SubtitleSource.WYZIE,
          cause: new Error('ECONNRESET'),
        });
      }
      return fakeSite(request);
    });
    const {client, logger} = createTestClient(requestSubtitleSource);
    const hits = await client.searchSubtitles(movieQuery, credentialA);
    expect(hits.map(hit => hit.siteFileId)).toContain(SITE_FILE_ID);
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(API_KEY_A);
  });

  it('passes a rate limit of the plan lookup on', async () => {
    const requestSubtitleSource = vi.fn(async () => {
      throw new SourceRateLimitError({
        subtitleSource: SubtitleSource.WYZIE,
        retryAfterMs: 1000,
        credentialId: credentialA.credentialId,
      });
    });
    const {client} = createTestClient(requestSubtitleSource);
    await expect(
      client.searchSubtitles(movieQuery, credentialA),
    ).rejects.toBeInstanceOf(SourceRateLimitError);
  });

  it('asks nothing of a query the site cannot search', async () => {
    const requestSubtitleSource = await createFakeSite();
    const {client} = createTestClient(requestSubtitleSource);
    await expect(
      client.searchSubtitles(
        makeSearchQuery({videoId: 'tmdb:1', imdbId: null}),
        credentialA,
      ),
    ).resolves.toEqual([]);
    expect(requestSubtitleSource).not.toHaveBeenCalled();
  });

  it('passes any other refusal of the file link on', async () => {
    const fakeSite = await createFakeSite();
    const requestSubtitleSource = vi.fn(async request => {
      if (new URL(request.url).pathname.startsWith('/c/')) {
        throw new SourceRateLimitError({
          subtitleSource: SubtitleSource.WYZIE,
          retryAfterMs: 1000,
          credentialId: request.credentialId,
        });
      }
      return fakeSite(request);
    });
    const {client} = createTestClient(requestSubtitleSource);
    const error = await client
      .downloadSubtitle(recipeRef, credentialB)
      .catch(downloadError => downloadError);
    expect(error).toBeInstanceOf(SourceRateLimitError);
    expect(error.credentialId).toBe(credentialB.credentialId);
  });

  it('searches nothing when the key plan allows none of the asked sources', async () => {
    const requestSubtitleSource = await createFakeSite({
      sourcesBody: {
        sources: ['charlie', 'xray'],
        key: {valid: true, type: 'free'},
        available: ['quebec'],
        restricted: ['charlie', 'xray'],
      },
    });
    const {client} = createTestClient(requestSubtitleSource);
    await expect(
      client.searchSubtitles(movieQuery, credentialA),
    ).resolves.toEqual([]);
    expect(
      listRequestUrls(requestSubtitleSource).map(siteUrl => siteUrl.pathname),
    ).toEqual(['/sources']);
  });

  it('keeps the key plan in its own store by default', async () => {
    const requestSubtitleSource = await createFakeSite();
    const client = createWyzieClient({requestSubtitleSource});
    await client.searchSubtitles(movieQuery, credentialA);
    await client.searchSubtitles(movieQuery, credentialA);
    expect(
      listRequestUrls(requestSubtitleSource).map(siteUrl => siteUrl.pathname),
    ).toEqual(['/sources', '/search', '/search']);
  });

  it('asks an unverified plan again only after a short wait, searching the default sources meanwhile', async () => {
    vi.useFakeTimers({toFake: ['Date']});
    try {
      const requestSubtitleSource = await createFakeSite({
        sourcesBody: {sources: ['charlie'], key: {valid: null}},
      });
      const {client} = createTestClient(requestSubtitleSource);
      await client.searchSubtitles(movieQuery, credentialA);
      await client.searchSubtitles(movieQuery, credentialA);
      vi.advanceTimersByTime(61000);
      await client.searchSubtitles(movieQuery, credentialA);
      const requestUrls = listRequestUrls(requestSubtitleSource);
      expect(requestUrls.map(siteUrl => siteUrl.pathname)).toEqual([
        '/sources',
        '/search',
        '/search',
        '/sources',
        '/search',
      ]);
      expect(
        requestUrls[1].searchParams.get('source').split(',').toSorted(),
      ).toEqual(['charlie', 'xray']);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('wyzieClient legacy encodings (G40)', () => {
  it('drops the upsell cue of a Windows-1254 file in its recipe language, keeping the Turkish letters', async () => {
    const fakeSite = await createFakeSite();
    const turkishBytes = iconv.encode(
      (await readFixture('subtitle-sources/wyzie/upsell-turkish.srt')).toString(
        'utf8',
      ),
      'win1254',
    );
    const requestSubtitleSource = vi.fn(async request =>
      new URL(request.url).pathname.startsWith('/c/')
        ? {
            status: StatusCodes.OK,
            headers: {'content-type': 'text/plain'},
            body: turkishBytes,
          }
        : fakeSite(request),
    );
    const {client} = createTestClient(requestSubtitleSource);
    const download = await client.downloadSubtitle(
      {
        ...recipeRef,
        siteFileId: 'charlie:2001002',
        siteFileUrl:
          'https://sub.wyzie.io/search?id=tt0133093&language=tr&source=charlie',
      },
      credentialB,
    );
    const {parsedSubtitle} = buildFileFacts({
      bytes: download.fileBytes,
      fileNameHint: null,
      expectedLanguageCode: 'tur',
      fallbackFrameRate: null,
    });
    expect(parsedSubtitle.cues.map(({text}) => text)).toEqual([
      "Şişli'de ığdır İstanbul",
    ]);
  });
});
