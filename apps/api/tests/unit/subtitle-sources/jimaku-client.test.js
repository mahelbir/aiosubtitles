import {StatusCodes} from 'http-status-codes';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  CredentialKind,
  CredentialStatus,
} from '@repo/shared/constants/credential.js';
import {
  CredentialRequirement,
  SubtitleSource,
} from '@repo/shared/constants/subtitle-source.js';
import {toCandidateCredentials} from '../../../src/lib/subtitle-source-credentials.js';
import {
  createJimakuClient,
  jimakuClient,
} from '../../../src/lib/subtitle-sources/jimaku/jimaku-client.js';
import {listSubtitleSourceClients} from '../../../src/lib/subtitle-sources/subtitle-source-clients.js';
import {SubtitleSourceBudgetScope} from '../../../src/lib/subtitle-sources/subtitle-source-contract.js';
import {
  SourceCredentialError,
  SourceRateLimitError,
  SourceUnavailableError,
} from '../../../src/lib/subtitle-sources/subtitle-source-errors.js';
import {requestSubtitleSource} from '../../../src/lib/subtitle-sources/subtitle-source-request.js';
import {CatalogService} from '../../../src/lib/video-catalog/catalog-service.js';
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

const API_KEY = 'fixture-jimaku-key';
const SHARED_KEY = 'fixture-jimaku-shared-key';
const OTHER_SHARED_KEY = 'fixture-jimaku-other-shared-key';
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

function makeClient(anilistId = 154587, sharedCredentials = {}) {
  const readAnilistId = vi.fn(async () => anilistId);
  const {sharedCredentialPool} =
    createTestSharedCredentialPool(sharedCredentials);
  return {
    client: createJimakuClient({readAnilistId, sharedCredentialPool}),
    readAnilistId,
    sharedCredentialPool,
  };
}

async function answerEntriesAndFiles() {
  requestSubtitleSource
    .mockResolvedValueOnce({
      status: StatusCodes.OK,
      headers: jsonHeaders,
      body: await readFixture('subtitle-sources/jimaku/entries-search.json'),
    })
    .mockResolvedValueOnce({
      status: StatusCodes.OK,
      headers: jsonHeaders,
      body: await readFixture('subtitle-sources/jimaku/entry-files.json'),
    });
}

afterEach(() => {
  vi.resetAllMocks();
});

describe('jimakuClient', () => {
  it('names its subtitle source and takes an api key', () => {
    expect(jimakuClient.subtitleSource).toBe(SubtitleSource.JIMAKU);
    expect(jimakuClient.credentialKinds).toEqual([CredentialKind.API_KEY]);
    expect(jimakuClient.canUseSharedCredential).toBe(true);
    expect(jimakuClient.isDownloadKeyless).toBe(true);
    expect(jimakuClient.isKeylessLimitSeparate).not.toBe(true);
  });

  it('searches without a user key only while the server has a shared key, and always downloads without one', async () => {
    const {client: keylessClient} = makeClient();
    const {client: sharedClient} = makeClient(154587, {
      [SubtitleSource.JIMAKU]: toSharedApiKeys(SHARED_KEY),
    });

    await expect(keylessClient.canSearchWithoutCredential()).resolves.toBe(
      false,
    );
    await expect(sharedClient.canSearchWithoutCredential()).resolves.toBe(true);
    expect(await keylessClient.canDownloadWithoutCredential()).toBe(true);
  });

  it('takes one optional key on the configure page', () => {
    expect(SubtitleSource.item(SubtitleSource.JIMAKU)).toMatchObject({
      credentialRequirement: CredentialRequirement.OPTIONAL,
      credentialKinds: [CredentialKind.API_KEY],
      credentialLimit: 1,
    });
  });

  it('searches by id, not by video hash', () => {
    expect(jimakuClient.isSearchHashSensitive).toBe(false);
  });

  it("paces downloads on the server's shared address, at the site's per-address limit", () => {
    expect(jimakuClient.downloadBudgets).toEqual([
      {
        budgetScope: SubtitleSourceBudgetScope.SUBTITLE_SOURCE,
        windowMs: 60000,
        requestMax: 25,
      },
    ]);
  });

  it('implements the search, download and credential check calls', () => {
    expect(jimakuClient.searchSubtitles).toBeTypeOf('function');
    expect(jimakuClient.downloadSubtitle).toBeTypeOf('function');
    expect(jimakuClient.checkCredential).toBeTypeOf('function');
  });

  it('is registered with the subtitle source clients', () => {
    expect(listSubtitleSourceClients()).toContain(jimakuClient);
  });
});

describe('jimakuClient.searchSubtitles', () => {
  it('answers a search without a key with no hits, no lookup and no request', async () => {
    const {client, readAnilistId} = makeClient();
    await expect(
      client.searchSubtitles(kitsuEpisodeQuery, null),
    ).resolves.toBeNull();
    expect(readAnilistId).not.toHaveBeenCalled();
    expect(requestSubtitleSource).not.toHaveBeenCalled();
  });

  it('makes no call when Japanese is not asked', async () => {
    const {client, readAnilistId} = makeClient();
    await expect(
      client.searchSubtitles(
        {...kitsuEpisodeQuery, languageCodes: ['tur']},
        keyCredential,
      ),
    ).resolves.toBeNull();
    expect(readAnilistId).not.toHaveBeenCalled();
    expect(requestSubtitleSource).not.toHaveBeenCalled();
  });

  it('makes no call for a video that is not anime', async () => {
    const {client, readAnilistId} = makeClient();
    await expect(
      client.searchSubtitles(
        makeSearchQuery({languageCodes: ['jpn']}),
        keyCredential,
      ),
    ).resolves.toBeNull();
    expect(readAnilistId).not.toHaveBeenCalled();
    expect(requestSubtitleSource).not.toHaveBeenCalled();
  });

  it('answers no hits and makes no site call when Kitsu maps no AniList id', async () => {
    const {client, readAnilistId} = makeClient(null);
    await expect(
      client.searchSubtitles(kitsuEpisodeQuery, keyCredential),
    ).resolves.toEqual([]);
    expect(readAnilistId).toHaveBeenCalledWith('46474');
    expect(requestSubtitleSource).not.toHaveBeenCalled();
  });

  it('fails the search with the Kitsu error, rather than answering empty, when the Kitsu lookup fails', async () => {
    const kitsuError = new SourceUnavailableError({
      subtitleSource: CatalogService.KITSU,
      cause: new Error('ECONNRESET'),
    });
    const client = createJimakuClient({
      readAnilistId: vi.fn(async () => {
        throw kitsuError;
      }),
    });
    const searchError = await client
      .searchSubtitles(kitsuEpisodeQuery, keyCredential)
      .catch(error => error);
    expect(searchError).toBe(kitsuError);
    expect(requestSubtitleSource).not.toHaveBeenCalled();
  });

  it('searches the AniList entry, then lists its files for the Kitsu episode, both under the key', async () => {
    const {client, readAnilistId} = makeClient();
    await answerEntriesAndFiles();
    const hits = await client.searchSubtitles(kitsuEpisodeQuery, keyCredential);
    expect(readAnilistId).toHaveBeenCalledWith('46474');
    expect(requestSubtitleSource).toHaveBeenCalledTimes(2);
    const [[searchRequest], [fileListRequest]] =
      requestSubtitleSource.mock.calls;
    expect(new URL(searchRequest.url).searchParams.get('anilist_id')).toBe(
      '154587',
    );
    const fileListUrl = new URL(fileListRequest.url);
    expect(fileListUrl.pathname).toBe('/api/entries/1234/files');
    expect(fileListUrl.searchParams.get('episode')).toBe('5');
    for (const request of [searchRequest, fileListRequest]) {
      expect(request.headers.Authorization).toBe(API_KEY);
      expect(request.credentialId).toBe(keyCredential.credentialId);
    }
    expect(hits).toHaveLength(3);
    expect(hits.every(hit => hit.languageCode === 'jpn')).toBe(true);
    expect(hits.every(hit => hit.isQuotaCostly === false)).toBe(true);
  });

  it('answers no hits for an AniList id with no entry', async () => {
    const {client} = makeClient();
    requestSubtitleSource.mockResolvedValueOnce({
      status: StatusCodes.OK,
      headers: jsonHeaders,
      body: [],
    });
    await expect(
      client.searchSubtitles(kitsuEpisodeQuery, keyCredential),
    ).resolves.toEqual([]);
    expect(requestSubtitleSource).toHaveBeenCalledTimes(1);
  });
});

describe('jimakuClient.downloadSubtitle', () => {
  it('downloads the public file without the key, so a refusal never marks the key', async () => {
    const fileBytes = new TextEncoder().encode('[Script Info]\n');
    requestSubtitleSource.mockResolvedValueOnce({
      status: StatusCodes.OK,
      headers: {'content-type': 'application/octet-stream'},
      body: fileBytes,
    });
    const download = await jimakuClient.downloadSubtitle(
      {
        subtitleSource: SubtitleSource.JIMAKU,
        siteFileId: '1234/Sousou.no.Frieren.S01E05.WEB.ja.srt',
        siteFileUrl:
          'https://jimaku.cc/entry/1234/download/Sousou.no.Frieren.S01E05.WEB.ja.srt',
        catalogSeason: 2,
        catalogEpisode: 1,
      },
      keyCredential,
    );
    expect(download.fileBytes).toBe(fileBytes);
    const [downloadRequest] = requestSubtitleSource.mock.calls[0];
    expect(downloadRequest.url).toBe(
      'https://jimaku.cc/entry/1234/download/Sousou.no.Frieren.S01E05.WEB.ja.srt',
    );
    expect(downloadRequest.headers).toEqual({});
    expect(downloadRequest.credentialId).toBeNull();
  });
});

describe('jimakuClient.checkCredential', () => {
  it('checks the key once with a keyed search', async () => {
    requestSubtitleSource.mockResolvedValueOnce({
      status: StatusCodes.OK,
      headers: jsonHeaders,
      body: [],
    });
    await expect(
      jimakuClient.checkCredential(keyCredential),
    ).resolves.toMatchObject({credentialStatus: CredentialStatus.VALID});
    expect(requestSubtitleSource).toHaveBeenCalledTimes(1);
    const [checkRequest] = requestSubtitleSource.mock.calls[0];
    expect(checkRequest.headers.Authorization).toBe(API_KEY);
    expect(checkRequest.credentialId).toBe(keyCredential.credentialId);
  });
});

describe('jimaku credential use', () => {
  async function readCandidates({
    credentials,
    hasConfiguredCredential,
    sharedCredentials = {},
  }) {
    const {client} = makeClient(154587, sharedCredentials);
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

  it('gives a user without a key the server path while the server has a shared key', async () => {
    await expect(
      readCandidates({
        credentials: [],
        hasConfiguredCredential: false,
        sharedCredentials: {
          [SubtitleSource.JIMAKU]: toSharedApiKeys(SHARED_KEY),
        },
      }),
    ).resolves.toEqual({searchCandidates: [null], downloadCandidates: [null]});
  });

  it('gives a user whose every key is unusable no shared key either', async () => {
    await expect(
      readCandidates({
        credentials: [],
        hasConfiguredCredential: true,
        sharedCredentials: {
          [SubtitleSource.JIMAKU]: toSharedApiKeys(SHARED_KEY),
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
          [SubtitleSource.JIMAKU]: toSharedApiKeys(SHARED_KEY),
        },
      }),
    ).resolves.toEqual({
      searchCandidates: [keyCredential],
      downloadCandidates: [keyCredential],
    });
  });
});

describe('jimakuClient with shared keys', () => {
  it('searches under a shared key when the user has none, and never names it in the request id', async () => {
    const {client} = makeClient(154587, {
      [SubtitleSource.JIMAKU]: toSharedApiKeys(SHARED_KEY),
    });
    await answerEntriesAndFiles();

    const hits = await client.searchSubtitles(kitsuEpisodeQuery, null);

    expect(hits).toHaveLength(3);
    expect(requestSubtitleSource).toHaveBeenCalledTimes(2);
    for (const [siteRequest] of requestSubtitleSource.mock.calls) {
      expect(siteRequest.headers.Authorization).toBe(SHARED_KEY);
      expect(String(siteRequest.credentialId)).not.toContain(SHARED_KEY);
    }
    expect(JSON.stringify(hits)).not.toContain(SHARED_KEY);
  });

  it("keeps the user's own key over every shared key", async () => {
    const {client} = makeClient(154587, {
      [SubtitleSource.JIMAKU]: toSharedApiKeys(SHARED_KEY),
    });
    await answerEntriesAndFiles();

    await client.searchSubtitles(kitsuEpisodeQuery, keyCredential);

    for (const [siteRequest] of requestSubtitleSource.mock.calls) {
      expect(siteRequest.headers.Authorization).toBe(API_KEY);
      expect(siteRequest.credentialId).toBe(keyCredential.credentialId);
    }
  });

  it('moves on to the next shared key when the site rejects one', async () => {
    const {client} = makeClient(154587, {
      [SubtitleSource.JIMAKU]: toSharedApiKeys(SHARED_KEY, OTHER_SHARED_KEY),
    });
    const [entriesBody, filesBody] = await Promise.all([
      readFixture('subtitle-sources/jimaku/entries-search.json'),
      readFixture('subtitle-sources/jimaku/entry-files.json'),
    ]);
    requestSubtitleSource.mockImplementation(async siteRequest => {
      if (siteRequest.headers.Authorization === SHARED_KEY) {
        throw new SourceCredentialError({
          subtitleSource: SubtitleSource.JIMAKU,
          credentialId: siteRequest.credentialId,
        });
      }
      return {
        status: StatusCodes.OK,
        headers: jsonHeaders,
        body: new URL(siteRequest.url).pathname.endsWith('/files')
          ? filesBody
          : entriesBody,
      };
    });

    await expect(
      client.searchSubtitles(kitsuEpisodeQuery, null),
    ).resolves.toHaveLength(3);
    await client.searchSubtitles(kitsuEpisodeQuery, null);

    expect(
      requestSubtitleSource.mock.calls.map(
        ([siteRequest]) => siteRequest.headers.Authorization,
      ),
    ).toEqual([
      SHARED_KEY,
      OTHER_SHARED_KEY,
      OTHER_SHARED_KEY,
      OTHER_SHARED_KEY,
      OTHER_SHARED_KEY,
    ]);
  });

  it("stops at Jimaku's per-address limit without trying the other shared keys", async () => {
    const {client} = makeClient(154587, {
      [SubtitleSource.JIMAKU]: toSharedApiKeys(SHARED_KEY, OTHER_SHARED_KEY),
    });
    requestSubtitleSource.mockResolvedValue({
      status: StatusCodes.TOO_MANY_REQUESTS,
      headers: {'x-ratelimit-reset-after': '12.5'},
      body: null,
    });

    const error = await client
      .searchSubtitles(kitsuEpisodeQuery, null)
      .catch(caughtError => caughtError);

    expect(error).toBeInstanceOf(SourceRateLimitError);
    expect(error.credentialId).toBeNull();
    expect(requestSubtitleSource).toHaveBeenCalledOnce();
  });

  it('raises the source rate limit once every shared key is limited', async () => {
    const {client} = makeClient(154587, {
      [SubtitleSource.JIMAKU]: toSharedApiKeys(SHARED_KEY, OTHER_SHARED_KEY),
    });
    requestSubtitleSource.mockImplementation(async siteRequest => {
      throw new SourceRateLimitError({
        subtitleSource: SubtitleSource.JIMAKU,
        retryAfterMs: 60000,
        credentialId: siteRequest.credentialId,
      });
    });

    const error = await client
      .searchSubtitles(kitsuEpisodeQuery, null)
      .catch(caughtError => caughtError);

    expect(error).toBeInstanceOf(SourceRateLimitError);
    expect(error.credentialId).toBeNull();
    expect(toErrorText(error)).not.toContain(SHARED_KEY);
    expect(toErrorText(error)).not.toContain(OTHER_SHARED_KEY);
  });

  it('downloads the public file without any key, even while the server has no shared key', async () => {
    const {client} = makeClient();
    const fileBytes = new TextEncoder().encode('[Script Info]\n');
    requestSubtitleSource.mockResolvedValueOnce({
      status: StatusCodes.OK,
      headers: {'content-type': 'application/octet-stream'},
      body: fileBytes,
    });

    const download = await client.downloadSubtitle(
      {
        subtitleSource: SubtitleSource.JIMAKU,
        siteFileId: '1234/Sousou.no.Frieren.S01E05.WEB.ja.srt',
        siteFileUrl:
          'https://jimaku.cc/entry/1234/download/Sousou.no.Frieren.S01E05.WEB.ja.srt',
        catalogSeason: 2,
        catalogEpisode: 1,
      },
      null,
    );

    expect(download.fileBytes).toBe(fileBytes);
    const [downloadRequest] = requestSubtitleSource.mock.calls[0];
    expect(downloadRequest.headers).toEqual({});
    expect(downloadRequest.credentialId).toBeNull();
  });
});
