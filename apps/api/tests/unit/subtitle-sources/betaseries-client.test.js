import {strToU8, zipSync} from 'fflate';
import {StatusCodes} from 'http-status-codes';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  CredentialKind,
  CredentialStatus,
} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {toCandidateCredentials} from '../../../src/lib/subtitle-source-credentials.js';
import {
  betaseriesClient,
  createBetaseriesClient,
} from '../../../src/lib/subtitle-sources/betaseries/betaseries-client.js';
import {listSubtitleSourceClients} from '../../../src/lib/subtitle-sources/subtitle-source-clients.js';
import {SubtitleSourceBudgetScope} from '../../../src/lib/subtitle-sources/subtitle-source-contract.js';
import {
  SourceCredentialError,
  SourceRateLimitError,
  SourceUnavailableError,
} from '../../../src/lib/subtitle-sources/subtitle-source-errors.js';
import {requestSubtitleSource} from '../../../src/lib/subtitle-sources/subtitle-source-request.js';
import {toErrorText} from '../../helpers/caught-error.js';
import {readFixture} from '../../helpers/read-fixture.js';
import {toSharedApiKeys} from '../../helpers/shared-credential-secrets.js';
import {createTestSharedCredentialPool} from '../../helpers/shared-credentials.js';
import {
  makeSearchQuery,
  makeSubtitleSourceCredential,
} from '../../helpers/subtitle-source-factories.js';

vi.mock(
  '../../../src/lib/subtitle-sources/subtitle-source-request.js',
  async importOriginal => ({
    ...(await importOriginal()),
    requestSubtitleSource: vi.fn(),
  }),
);

const API_KEY = 'fixture-betaseries-key';
const SHARED_KEY = 'fixture-betaseries-shared-key';
const OTHER_SHARED_KEY = 'fixture-betaseries-other-shared-key';

function makeClient(sharedCredentials = {}) {
  const {sharedCredentialPool} =
    createTestSharedCredentialPool(sharedCredentials);
  return createBetaseriesClient({sharedCredentialPool});
}
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
  siteFileId: '9970003',
  siteFileUrl: 'https://www.betaseries.com/srt/9970003',
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

async function mockLookupChain() {
  const [showBody, episodesBody, subtitlesBody] = await Promise.all([
    readFixture('subtitle-sources/betaseries/shows-display.json'),
    readFixture('subtitle-sources/betaseries/shows-episodes.json'),
    readFixture('subtitle-sources/betaseries/subtitles-episode.json'),
  ]);
  requestSubtitleSource
    .mockResolvedValueOnce(toOkResponse(showBody))
    .mockResolvedValueOnce(toOkResponse(episodesBody))
    .mockResolvedValueOnce(toOkResponse(subtitlesBody));
}

function readRequestPaths() {
  return requestSubtitleSource.mock.calls.map(
    ([siteRequest]) => new URL(siteRequest.url).pathname,
  );
}

afterEach(() => {
  vi.resetAllMocks();
});

describe('betaseriesClient', () => {
  it('names its subtitle source and takes an api key', () => {
    expect(betaseriesClient.subtitleSource).toBe(SubtitleSource.BETASERIES);
    expect(betaseriesClient.credentialKinds).toEqual([CredentialKind.API_KEY]);
    expect(betaseriesClient.canUseSharedCredential).toBe(true);
    expect(betaseriesClient.isDownloadKeyless).toBe(true);
    expect(betaseriesClient.isKeylessLimitSeparate).not.toBe(true);
  });

  it('searches without a user key only while the server has a shared key, and always downloads without one', async () => {
    const keylessClient = makeClient();
    const sharedClient = makeClient({
      [SubtitleSource.BETASERIES]: toSharedApiKeys(SHARED_KEY),
    });

    await expect(keylessClient.canSearchWithoutCredential()).resolves.toBe(
      false,
    );
    await expect(sharedClient.canSearchWithoutCredential()).resolves.toBe(true);
    expect(await keylessClient.canDownloadWithoutCredential()).toBe(true);
  });

  it('searches by id, not by video hash', () => {
    expect(betaseriesClient.isSearchHashSensitive).toBe(false);
  });

  it('declares only the shared source download limit, since a file download sends no key', () => {
    expect(betaseriesClient.downloadBudgets).toEqual([
      {
        budgetScope: SubtitleSourceBudgetScope.SUBTITLE_SOURCE,
        windowMs: 60000,
        requestMax: 10,
      },
    ]);
  });

  it('implements the search and download calls', () => {
    expect(betaseriesClient.searchSubtitles).toBeTypeOf('function');
    expect(betaseriesClient.downloadSubtitle).toBeTypeOf('function');
  });

  it('is registered with the subtitle source clients', () => {
    expect(listSubtitleSourceClients()).toContain(betaseriesClient);
  });
});

describe('betaseriesClient.searchSubtitles', () => {
  it('looks up the show, then the episode, then its subtitles, all under the key', async () => {
    await mockLookupChain();
    const hits = await betaseriesClient.searchSubtitles(
      episodeQuery,
      keyCredential,
    );
    expect(readRequestPaths()).toEqual([
      '/shows/display',
      '/shows/episodes',
      '/subtitles/episode',
    ]);
    const [, [episodeRequest], [subtitlesRequest]] =
      requestSubtitleSource.mock.calls;
    expect(new URL(episodeRequest.url).searchParams.get('id')).toBe('9900481');
    expect(new URL(subtitlesRequest.url).searchParams.get('id')).toBe(
      '9939477',
    );
    for (const [siteRequest] of requestSubtitleSource.mock.calls) {
      expect(siteRequest.headers).toMatchObject({
        'X-BetaSeries-Key': API_KEY,
        'X-BetaSeries-Version': '3.0',
      });
      expect(siteRequest.credentialId).toBe(keyCredential.credentialId);
    }
    expect(hits.map(hit => [hit.siteFileId, hit.languageCode])).toEqual([
      ['9970001', 'fre'],
      ['9970002', 'eng'],
      ['9970003', 'fre'],
      ['9970004', 'fre'],
    ]);
  });

  it('stops after the show lookup when the show is unknown', async () => {
    requestSubtitleSource.mockResolvedValueOnce({
      status: StatusCodes.BAD_REQUEST,
      headers: {'content-type': 'application/json'},
      body: {errors: [{code: 4001, text: 'Show not found.'}]},
    });
    await expect(
      betaseriesClient.searchSubtitles(episodeQuery, keyCredential),
    ).resolves.toEqual([]);
    expect(readRequestPaths()).toEqual(['/shows/display']);
  });

  it('stops after the episode lookup when the episode is unknown', async () => {
    requestSubtitleSource
      .mockResolvedValueOnce(
        toOkResponse(
          await readFixture('subtitle-sources/betaseries/shows-display.json'),
        ),
      )
      .mockResolvedValueOnce(toOkResponse({episodes: [], errors: []}));
    await expect(
      betaseriesClient.searchSubtitles(episodeQuery, keyCredential),
    ).resolves.toEqual([]);
    expect(readRequestPaths()).toEqual(['/shows/display', '/shows/episodes']);
  });

  it('rejects the key on code 1001', async () => {
    requestSubtitleSource.mockResolvedValueOnce({
      status: StatusCodes.BAD_REQUEST,
      headers: {'content-type': 'application/json'},
      body: {errors: [{code: 1001, text: 'Invalid API key.'}]},
    });
    const error = await betaseriesClient
      .searchSubtitles(episodeQuery, keyCredential)
      .catch(caughtError => caughtError);
    expect(error).toBeInstanceOf(SourceCredentialError);
    expect(error.credentialId).toBe(keyCredential.credentialId);
  });

  it('passes a transport error on', async () => {
    const rateLimitError = new SourceRateLimitError({
      subtitleSource: SubtitleSource.BETASERIES,
      retryAfterMs: 60000,
      credentialId: keyCredential.credentialId,
    });
    requestSubtitleSource.mockRejectedValueOnce(rateLimitError);
    await expect(
      betaseriesClient.searchSubtitles(episodeQuery, keyCredential),
    ).rejects.toBe(rateLimitError);
  });

  it('makes no call for german only', async () => {
    await mockLookupChain();
    await expect(
      betaseriesClient.searchSubtitles(
        {...episodeQuery, languageCodes: ['ger']},
        keyCredential,
      ),
    ).resolves.toBeNull();
    expect(requestSubtitleSource).not.toHaveBeenCalled();
    await betaseriesClient.searchSubtitles(episodeQuery, keyCredential);
    expect(requestSubtitleSource).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['a movie', makeSearchQuery({languageCodes: ['fre']}), keyCredential],
    [
      'a kitsu-only episode',
      makeSearchQuery({
        videoId: 'kitsu:7442:5',
        videoType: 'series',
        imdbId: null,
        kitsuId: '7442',
        catalogSeason: 1,
        catalogEpisode: 5,
        languageCodes: ['fre'],
      }),
      keyCredential,
    ],
    ['no credential', episodeQuery, null],
  ])('makes no call for %s', async (_, searchQuery, credential) => {
    await mockLookupChain();
    await expect(
      betaseriesClient.searchSubtitles(searchQuery, credential),
    ).resolves.toBeNull();
    expect(requestSubtitleSource).not.toHaveBeenCalled();
  });
});

describe('betaseriesClient.downloadSubtitle', () => {
  it('downloads the stored file url without the key, so a prefetch spends nothing of the key', async () => {
    const zipBytes = zipSync({
      'Fixture.Show.S01E03.fr.srt': strToU8(
        '1\n00:00:01,000 --> 00:00:02,000\nBonjour\n',
      ),
    });
    requestSubtitleSource.mockResolvedValueOnce({
      status: StatusCodes.OK,
      headers: {'content-type': 'application/zip'},
      body: zipBytes,
    });
    const download = await betaseriesClient.downloadSubtitle(
      subtitleRef,
      keyCredential,
    );
    expect(download.fileBytes).toBe(zipBytes);
    expect(requestSubtitleSource).toHaveBeenCalledTimes(1);
    const [downloadRequest] = requestSubtitleSource.mock.calls[0];
    expect(downloadRequest.url).toBe('https://www.betaseries.com/srt/9970003');
    expect(downloadRequest.responseType).toBe('bytes');
    expect(downloadRequest.credentialId).toBeNull();
    expect(JSON.stringify(downloadRequest)).not.toContain(API_KEY);
  });
});

describe('betaseriesClient.checkCredential', () => {
  const validCheck = {
    credentialStatus: CredentialStatus.VALID,
    quotaRemainingCount: null,
    quotaAllowedCount: null,
    quotaResetAt: null,
  };

  function toErrorResponse(code) {
    return {
      status: StatusCodes.BAD_REQUEST,
      headers: {'content-type': 'application/json'},
      body: {errors: [{code, text: `Error for ${API_KEY}.`}]},
    };
  }

  it('checks the key with one show lookup under the key', async () => {
    requestSubtitleSource.mockResolvedValueOnce(
      toOkResponse(
        await readFixture('subtitle-sources/betaseries/shows-display.json'),
      ),
    );
    await expect(
      betaseriesClient.checkCredential(keyCredential),
    ).resolves.toEqual(validCheck);
    expect(requestSubtitleSource).toHaveBeenCalledTimes(1);
    const [checkRequest] = requestSubtitleSource.mock.calls[0];
    const checkUrl = new URL(checkRequest.url);
    expect(checkUrl.origin).toBe('https://api.betaseries.com');
    expect(checkUrl.pathname).toBe('/shows/display');
    expect(Object.fromEntries(checkUrl.searchParams)).toEqual({
      imdb_id: 'tt0903747',
    });
    expect(checkRequest).toMatchObject({
      method: 'GET',
      responseType: 'json',
      acceptedStatuses: [StatusCodes.BAD_REQUEST],
      credentialId: keyCredential.credentialId,
      headers: {
        'X-BetaSeries-Key': API_KEY,
        'X-BetaSeries-Version': '3.0',
      },
    });
    expect(checkRequest.url).not.toContain(API_KEY);
  });

  it('reads an unknown show as a valid key, since the key was accepted', async () => {
    requestSubtitleSource.mockResolvedValueOnce(toErrorResponse(4001));
    await expect(
      betaseriesClient.checkCredential(keyCredential),
    ).resolves.toEqual(validCheck);
  });

  it('reads code 1001 as a rejected key', async () => {
    requestSubtitleSource.mockResolvedValueOnce(toErrorResponse(1001));
    const error = await betaseriesClient
      .checkCredential(keyCredential)
      .catch(caughtError => caughtError);
    expect(error).toBeInstanceOf(SourceCredentialError);
    expect(error.credentialId).toBe(keyCredential.credentialId);
    expect(toErrorText(error)).not.toContain(API_KEY);
  });

  it('reads another error code as an unchecked key', async () => {
    requestSubtitleSource.mockResolvedValueOnce(toErrorResponse(2001));
    const error = await betaseriesClient
      .checkCredential(keyCredential)
      .catch(caughtError => caughtError);
    expect(error).toBeInstanceOf(SourceUnavailableError);
    expect(toErrorText(error)).not.toContain(API_KEY);
  });

  it('passes a rate limit on, so the key reads as limit reached', async () => {
    const rateLimitError = new SourceRateLimitError({
      subtitleSource: SubtitleSource.BETASERIES,
      retryAfterMs: 60000,
      credentialId: keyCredential.credentialId,
    });
    requestSubtitleSource.mockRejectedValueOnce(rateLimitError);
    await expect(betaseriesClient.checkCredential(keyCredential)).rejects.toBe(
      rateLimitError,
    );
  });
});

describe('betaseries credential use', () => {
  async function readCandidates({
    credentials,
    hasConfiguredCredential,
    sharedCredentials = {},
  }) {
    const client = makeClient(sharedCredentials);
    return {
      searchCandidates: toCandidateCredentials({
        credentials,
        hasConfiguredCredential,
        canUseWithoutCredential: await client.canSearchWithoutCredential(),
      }),
      downloadCandidates: toCandidateCredentials({
        credentials,
        hasConfiguredCredential,
        canUseWithoutCredential: await client.canDownloadWithoutCredential(),
      }),
    };
  }

  it('gives a user without a key no keyless search, and the keyless file download', async () => {
    await expect(
      readCandidates({credentials: [], hasConfiguredCredential: false}),
    ).resolves.toEqual({searchCandidates: [], downloadCandidates: [null]});
  });

  it('gives a user without a key the server search while the server has a shared key', async () => {
    await expect(
      readCandidates({
        credentials: [],
        hasConfiguredCredential: false,
        sharedCredentials: {
          [SubtitleSource.BETASERIES]: toSharedApiKeys(SHARED_KEY),
        },
      }),
    ).resolves.toEqual({searchCandidates: [null], downloadCandidates: [null]});
  });

  it('gives a user whose every key is unusable no keyless path either', async () => {
    await expect(
      readCandidates({
        credentials: [],
        hasConfiguredCredential: true,
        sharedCredentials: {
          [SubtitleSource.BETASERIES]: toSharedApiKeys(SHARED_KEY),
        },
      }),
    ).resolves.toEqual({searchCandidates: [], downloadCandidates: []});
  });

  it("runs a user's search and download under the user's own key", async () => {
    await expect(
      readCandidates({
        credentials: [keyCredential],
        hasConfiguredCredential: true,
        sharedCredentials: {
          [SubtitleSource.BETASERIES]: toSharedApiKeys(SHARED_KEY),
        },
      }),
    ).resolves.toEqual({
      searchCandidates: [keyCredential],
      downloadCandidates: [keyCredential],
    });
  });
});

describe('betaseriesClient with shared keys', () => {
  it('answers a search with neither a user key nor a shared key as could not search, without a request', async () => {
    await expect(
      makeClient().searchSubtitles(episodeQuery, null),
    ).resolves.toBeNull();
    expect(requestSubtitleSource).not.toHaveBeenCalled();
  });

  it('searches under a shared key when the user has none', async () => {
    await mockLookupChain();

    const hits = await makeClient({
      [SubtitleSource.BETASERIES]: toSharedApiKeys(SHARED_KEY),
    }).searchSubtitles(episodeQuery, null);

    expect(hits.length).toBeGreaterThan(0);
    for (const [siteRequest] of requestSubtitleSource.mock.calls) {
      expect(siteRequest.headers['X-BetaSeries-Key']).toBe(SHARED_KEY);
      expect(String(siteRequest.credentialId)).not.toContain(SHARED_KEY);
    }
    expect(JSON.stringify(hits)).not.toContain(SHARED_KEY);
  });

  it("keeps the user's own key over every shared key", async () => {
    await mockLookupChain();

    await makeClient({
      [SubtitleSource.BETASERIES]: toSharedApiKeys(SHARED_KEY),
    }).searchSubtitles(episodeQuery, keyCredential);

    for (const [siteRequest] of requestSubtitleSource.mock.calls) {
      expect(siteRequest.headers['X-BetaSeries-Key']).toBe(API_KEY);
    }
  });

  it('moves on to the next shared key when the site rejects one', async () => {
    const client = makeClient({
      [SubtitleSource.BETASERIES]: toSharedApiKeys(
        SHARED_KEY,
        OTHER_SHARED_KEY,
      ),
    });
    requestSubtitleSource.mockResolvedValueOnce({
      status: StatusCodes.BAD_REQUEST,
      headers: {'content-type': 'application/json'},
      body: {errors: [{code: 1001, text: 'Invalid key.'}]},
    });
    await mockLookupChain();

    const hits = await client.searchSubtitles(episodeQuery, null);

    expect(hits.length).toBeGreaterThan(0);
    expect(
      requestSubtitleSource.mock.calls.map(
        ([siteRequest]) => siteRequest.headers['X-BetaSeries-Key'],
      ),
    ).toEqual([
      SHARED_KEY,
      OTHER_SHARED_KEY,
      OTHER_SHARED_KEY,
      OTHER_SHARED_KEY,
    ]);
  });

  it('moves a rate-limited shared key aside, then answers could not search once every key is limited, without opening the breaker', async () => {
    const client = makeClient({
      [SubtitleSource.BETASERIES]: toSharedApiKeys(
        SHARED_KEY,
        OTHER_SHARED_KEY,
      ),
    });
    requestSubtitleSource.mockImplementation(async siteRequest => {
      throw new SourceRateLimitError({
        subtitleSource: SubtitleSource.BETASERIES,
        retryAfterMs: 60000,
        credentialId: siteRequest.credentialId,
      });
    });

    await expect(
      client.searchSubtitles(episodeQuery, null),
    ).resolves.toBeNull();
    expect(requestSubtitleSource).toHaveBeenCalledTimes(2);
  });

  it("still searches under a user's own key while every shared key is limited", async () => {
    const client = makeClient({
      [SubtitleSource.BETASERIES]: toSharedApiKeys(SHARED_KEY),
    });
    requestSubtitleSource.mockImplementationOnce(async siteRequest => {
      throw new SourceRateLimitError({
        subtitleSource: SubtitleSource.BETASERIES,
        retryAfterMs: 60000,
        credentialId: siteRequest.credentialId,
      });
    });
    await client.searchSubtitles(episodeQuery, null);
    await mockLookupChain();

    const hits = await client.searchSubtitles(episodeQuery, keyCredential);

    expect(hits.length).toBeGreaterThan(0);
    expect(requestSubtitleSource.mock.calls.at(-1)[0].headers).toMatchObject({
      'X-BetaSeries-Key': API_KEY,
    });
  });

  it('downloads the stored file url without any key for a user without one', async () => {
    requestSubtitleSource.mockResolvedValueOnce({
      status: StatusCodes.OK,
      headers: {'content-type': 'application/x-subrip'},
      body: new TextEncoder().encode(
        '1\n00:00:01,000 --> 00:00:02,000\nSalut\n',
      ),
    });

    await makeClient({
      [SubtitleSource.BETASERIES]: toSharedApiKeys(SHARED_KEY),
    }).downloadSubtitle(subtitleRef, null);

    const [downloadRequest] = requestSubtitleSource.mock.calls[0];
    expect(downloadRequest.headers).toEqual({});
    expect(downloadRequest.credentialId).toBeNull();
  });
});
