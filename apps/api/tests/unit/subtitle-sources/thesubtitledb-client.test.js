import {StatusCodes} from 'http-status-codes';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {CredentialKind} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {listSubtitleSourceClients} from '../../../src/lib/subtitle-sources/subtitle-source-clients.js';
import {SubtitleSourceBudgetScope} from '../../../src/lib/subtitle-sources/subtitle-source-contract.js';
import {
  SourceCredentialError,
  SourceKeylessPauseError,
  SourceRateLimitError,
} from '../../../src/lib/subtitle-sources/subtitle-source-errors.js';
import {requestSubtitleSource} from '../../../src/lib/subtitle-sources/subtitle-source-request.js';
import {
  createThesubtitledbClient,
  thesubtitledbClient,
} from '../../../src/lib/subtitle-sources/thesubtitledb/thesubtitledb-client.js';
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

const USER_API_KEY = 'sdb_userfixturekey';
const SHARED_API_KEY = 'sdb_sharedfixturekey';
const userCredential = makeSubtitleSourceCredential({apiKey: USER_API_KEY});
const subtitleRef = {
  subtitleSource: SubtitleSource.THESUBTITLEDB,
  siteFileId: '42',
  siteFileUrl: null,
  catalogSeason: null,
  catalogEpisode: null,
};
const fileBytes = Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nMerhaba\n');

afterEach(() => {
  vi.resetAllMocks();
});

function toFileResponse() {
  return {
    status: StatusCodes.OK,
    headers: {'content-type': 'application/x-subrip'},
    body: fileBytes,
  };
}

function makeClient(sharedCredentials = {}) {
  const {sharedCredentialPool} =
    createTestSharedCredentialPool(sharedCredentials);
  return createThesubtitledbClient({sharedCredentialPool});
}

describe('thesubtitledbClient', () => {
  it('names its subtitle source and searches and downloads with or without an api key', () => {
    expect(thesubtitledbClient.subtitleSource).toBe(
      SubtitleSource.THESUBTITLEDB,
    );
    expect(thesubtitledbClient.credentialKinds).toEqual([
      CredentialKind.API_KEY,
    ]);
    expect(thesubtitledbClient.canSearchWithoutCredential()).toBe(true);
    expect(thesubtitledbClient.canDownloadWithoutCredential()).toBe(true);
  });

  it("takes operator shared keys while background work keeps the user's key behind its switch", () => {
    expect(
      SubtitleSource.raw(SubtitleSource.THESUBTITLEDB).sharedCredentialKinds,
    ).toEqual([CredentialKind.API_KEY]);
    expect(thesubtitledbClient.canUseSharedCredential).toBeUndefined();
  });

  it('searches by id, not by video hash', () => {
    expect(thesubtitledbClient.isSearchHashSensitive).toBe(false);
  });

  it('keeps a keyed call off the per-IP keyless limit', () => {
    expect(thesubtitledbClient.isKeylessLimitSeparate).toBe(true);
  });

  it('declares the documented download limits, keyless per server and keyed per key', () => {
    expect(thesubtitledbClient.downloadBudgets).toEqual([
      {
        budgetScope: SubtitleSourceBudgetScope.SUBTITLE_SOURCE,
        windowMs: 3600000,
        requestMax: 1000,
      },
      {
        budgetScope: SubtitleSourceBudgetScope.CREDENTIAL,
        windowMs: 86400000,
        requestMax: 100000,
      },
    ]);
  });

  it('implements the search, download and credential check calls', () => {
    expect(thesubtitledbClient.searchSubtitles).toBeTypeOf('function');
    expect(thesubtitledbClient.downloadSubtitle).toBeTypeOf('function');
    expect(thesubtitledbClient.checkCredential).toBeTypeOf('function');
  });

  it('is registered with the subtitle source clients', () => {
    expect(listSubtitleSourceClients()).toContain(thesubtitledbClient);
  });

  it('answers could-not-search for a query without an imdb id, without a request', async () => {
    await expect(
      thesubtitledbClient.searchSubtitles(
        makeSearchQuery({videoId: 'kitsu:7442:5', imdbId: null}),
        makeSubtitleSourceCredential(),
      ),
    ).resolves.toBeNull();
  });
});

describe('thesubtitledbClient search', () => {
  it('looks up without any key when the user has none, even with a shared key', async () => {
    requestSubtitleSource.mockResolvedValueOnce({
      status: StatusCodes.NOT_FOUND,
      headers: {'content-type': 'application/json'},
      body: {error: 'not_found'},
    });

    await expect(
      makeClient({
        [SubtitleSource.THESUBTITLEDB]: toSharedApiKeys(SHARED_API_KEY),
      }).searchSubtitles(makeSearchQuery({imdbId: 'tt0133093'}), null),
    ).resolves.toEqual([]);
    const [[lookupRequest]] = requestSubtitleSource.mock.calls;
    expect(lookupRequest).toMatchObject({headers: {}, credentialId: null});
  });
});

describe('thesubtitledbClient download', () => {
  it("downloads under the user's own key, never a shared one", async () => {
    requestSubtitleSource.mockResolvedValueOnce(toFileResponse());

    await expect(
      makeClient({
        [SubtitleSource.THESUBTITLEDB]: toSharedApiKeys(SHARED_API_KEY),
      }).downloadSubtitle(subtitleRef, userCredential),
    ).resolves.toMatchObject({fileBytes});
    const [[downloadRequest]] = requestSubtitleSource.mock.calls;
    expect(downloadRequest).toMatchObject({
      headers: {Authorization: `Bearer ${USER_API_KEY}`},
      credentialId: userCredential.credentialId,
    });
  });

  it('downloads under a shared key when the user has none', async () => {
    requestSubtitleSource.mockResolvedValueOnce(toFileResponse());

    await expect(
      makeClient({
        [SubtitleSource.THESUBTITLEDB]: toSharedApiKeys(SHARED_API_KEY),
      }).downloadSubtitle(subtitleRef, null),
    ).resolves.toMatchObject({fileBytes});
    const [[downloadRequest]] = requestSubtitleSource.mock.calls;
    expect(downloadRequest.headers).toEqual({
      Authorization: `Bearer ${SHARED_API_KEY}`,
    });
    expect(String(downloadRequest.credentialId)).not.toContain(SHARED_API_KEY);
  });

  it('downloads without any key when the server has no shared key', async () => {
    requestSubtitleSource.mockResolvedValueOnce(toFileResponse());

    await expect(
      makeClient().downloadSubtitle(subtitleRef, null),
    ).resolves.toMatchObject({fileBytes});
    const [[downloadRequest]] = requestSubtitleSource.mock.calls;
    expect(downloadRequest).toMatchObject({headers: {}, credentialId: null});
  });

  it('falls back to a keyless download once every shared key is limited', async () => {
    requestSubtitleSource
      .mockImplementationOnce(async siteRequest => {
        throw new SourceRateLimitError({
          subtitleSource: SubtitleSource.THESUBTITLEDB,
          retryAfterMs: 60000,
          credentialId: siteRequest.credentialId,
        });
      })
      .mockResolvedValueOnce(toFileResponse());

    await expect(
      makeClient({
        [SubtitleSource.THESUBTITLEDB]: toSharedApiKeys(SHARED_API_KEY),
      }).downloadSubtitle(subtitleRef, null),
    ).resolves.toMatchObject({fileBytes});
    const [, [keylessRequest]] = requestSubtitleSource.mock.calls;
    expect(keylessRequest).toMatchObject({headers: {}, credentialId: null});
  });

  it('keeps downloading under a shared key while the keyless path is paused', async () => {
    requestSubtitleSource.mockResolvedValueOnce(toFileResponse());

    await expect(
      makeClient({
        [SubtitleSource.THESUBTITLEDB]: toSharedApiKeys(SHARED_API_KEY),
      }).downloadSubtitle(subtitleRef, null, {isKeylessPaused: true}),
    ).resolves.toMatchObject({fileBytes});
    const [[downloadRequest]] = requestSubtitleSource.mock.calls;
    expect(downloadRequest.headers).toEqual({
      Authorization: `Bearer ${SHARED_API_KEY}`,
    });
  });

  it('refuses its keyless download, with no request, while the keyless path is paused', async () => {
    await expect(
      makeClient().downloadSubtitle(subtitleRef, null, {isKeylessPaused: true}),
    ).rejects.toBeInstanceOf(SourceKeylessPauseError);
    expect(requestSubtitleSource).not.toHaveBeenCalled();
  });

  it('refuses the keyless fallback once every shared key is limited while the keyless path is paused', async () => {
    requestSubtitleSource.mockImplementationOnce(async siteRequest => {
      throw new SourceRateLimitError({
        subtitleSource: SubtitleSource.THESUBTITLEDB,
        retryAfterMs: 60000,
        credentialId: siteRequest.credentialId,
      });
    });

    await expect(
      makeClient({
        [SubtitleSource.THESUBTITLEDB]: toSharedApiKeys(SHARED_API_KEY),
      }).downloadSubtitle(subtitleRef, null, {isKeylessPaused: true}),
    ).rejects.toBeInstanceOf(SourceKeylessPauseError);
    expect(requestSubtitleSource).toHaveBeenCalledOnce();
  });

  it("downloads under the user's own key while the keyless path is paused", async () => {
    requestSubtitleSource.mockResolvedValueOnce(toFileResponse());

    await expect(
      makeClient().downloadSubtitle(subtitleRef, userCredential, {
        isKeylessPaused: true,
      }),
    ).resolves.toMatchObject({fileBytes});
  });

  it("passes a user key's rejection on, so it never falls back to a shared key or the keyless path", async () => {
    requestSubtitleSource.mockRejectedValueOnce(
      new SourceCredentialError({
        subtitleSource: SubtitleSource.THESUBTITLEDB,
        credentialId: userCredential.credentialId,
      }),
    );

    await expect(
      makeClient({
        [SubtitleSource.THESUBTITLEDB]: toSharedApiKeys(SHARED_API_KEY),
      }).downloadSubtitle(subtitleRef, userCredential),
    ).rejects.toMatchObject({
      name: 'SourceCredentialError',
      credentialId: userCredential.credentialId,
    });
    expect(requestSubtitleSource).toHaveBeenCalledOnce();
  });
});
