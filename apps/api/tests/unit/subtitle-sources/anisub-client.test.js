import {StatusCodes} from 'http-status-codes';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {CredentialKind} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {
  anisubClient,
  createAnisubClient,
} from '../../../src/lib/subtitle-sources/anisub/anisub-client.js';
import {listSubtitleSourceClients} from '../../../src/lib/subtitle-sources/subtitle-source-clients.js';
import {SubtitleSourceBudgetScope} from '../../../src/lib/subtitle-sources/subtitle-source-contract.js';
import {
  SourceRateLimitError,
  SourceUnavailableError,
} from '../../../src/lib/subtitle-sources/subtitle-source-errors.js';
import {requestSubtitleSource} from '../../../src/lib/subtitle-sources/subtitle-source-request.js';
import {readFixture} from '../../helpers/read-fixture.js';
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

const ACCESS_TOKEN = '7|anisubfixturetoken';
const SHARED_TOKEN = '9|anisubsharedfixturetoken';
const SITE_FILE_URL = 'https://anisub.co/api/subtitles/2329/download';
const CDN_FILE_URL =
  'https://cdn.anisub.co/subtitles/2025/09/2329-one-piece-1100.rar';
const tokenCredential = makeSubtitleSourceCredential({
  credentialKind: CredentialKind.ACCESS_TOKEN,
  apiKey: undefined,
  accessToken: ACCESS_TOKEN,
});
const siteRef = {
  subtitleSource: SubtitleSource.ANISUB,
  siteFileId: 'sub-2329',
  siteFileUrl: SITE_FILE_URL,
  catalogSeason: null,
  catalogEpisode: null,
};

afterEach(() => {
  vi.resetAllMocks();
});

function toFileResponse(fileBytes, headers = {}) {
  return {
    status: StatusCodes.OK,
    headers: {'content-type': 'application/x-subrip', ...headers},
    body: fileBytes,
  };
}

describe('anisubClient.downloadSubtitle', () => {
  it('asks the token endpoint first and fetches the cdn file it links, without the token', async () => {
    const fileBytes = Buffer.from('cdn file bytes');
    requestSubtitleSource
      .mockResolvedValueOnce({
        status: StatusCodes.OK,
        headers: {'content-type': 'application/json'},
        body: Buffer.from(
          JSON.stringify(
            await readFixture(
              'subtitle-sources/anisub/integration-download.json',
            ),
          ),
        ),
      })
      .mockResolvedValueOnce(toFileResponse(fileBytes));

    await expect(
      anisubClient.downloadSubtitle(siteRef, tokenCredential),
    ).resolves.toEqual({
      fileBytes,
      fileNameHint: '2329-ONE_PIECE-1100.rar',
      extractedEntryPath: null,
    });
    const [[tokenRequest], [fileRequest]] = requestSubtitleSource.mock.calls;
    expect(tokenRequest).toMatchObject({
      url: 'https://anisub.co/api/integrations/subtitles/2329/download',
      headers: {Authorization: `Bearer ${ACCESS_TOKEN}`},
      credentialId: tokenCredential.credentialId,
    });
    expect(fileRequest).toMatchObject({url: CDN_FILE_URL, credentialId: null});
    expect(JSON.stringify(fileRequest)).not.toContain(ACCESS_TOKEN);
  });

  it('returns the bytes the token endpoint answers with as the file', async () => {
    const fileBytes = Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nŞimdi\n');
    requestSubtitleSource.mockResolvedValueOnce(
      toFileResponse(fileBytes, {
        'content-disposition': 'attachment; filename="2329.srt"',
      }),
    );

    await expect(
      anisubClient.downloadSubtitle(siteRef, tokenCredential),
    ).resolves.toEqual({
      fileBytes,
      fileNameHint: '2329.srt',
      extractedEntryPath: null,
    });
    expect(requestSubtitleSource).toHaveBeenCalledTimes(1);
  });
});

describe('anisubClient', () => {
  it('names its subtitle source and takes an optional access token, with a keyless path always open', async () => {
    expect(anisubClient.subtitleSource).toBe(SubtitleSource.ANISUB);
    expect(anisubClient.credentialKinds).toEqual([CredentialKind.ACCESS_TOKEN]);
    expect(anisubClient.canUseSharedCredential).toBe(true);
    expect(anisubClient.isDownloadKeyless).not.toBe(true);
    expect(await anisubClient.canSearchWithoutCredential()).toBe(true);
    expect(await anisubClient.canDownloadWithoutCredential()).toBe(true);
  });

  it('searches by id, not by video hash', () => {
    expect(anisubClient.isSearchHashSensitive).toBe(false);
  });

  it('declares the documented download limits', () => {
    expect(anisubClient.downloadBudgets).toEqual([
      {
        budgetScope: SubtitleSourceBudgetScope.SUBTITLE_SOURCE,
        windowMs: 60000,
        requestMax: 60,
      },
      {
        budgetScope: SubtitleSourceBudgetScope.CREDENTIAL,
        windowMs: 86400000,
        requestMax: 1000,
      },
    ]);
  });

  it('implements the search, download, credential check and quota calls', () => {
    expect(anisubClient.searchSubtitles).toBeTypeOf('function');
    expect(anisubClient.downloadSubtitle).toBeTypeOf('function');
    expect(anisubClient.checkCredential).toBeTypeOf('function');
    expect(anisubClient.readQuota).toBeTypeOf('function');
  });

  it('is registered with the subtitle source clients', () => {
    expect(listSubtitleSourceClients()).toContain(anisubClient);
  });

  it('resolves no hits for a kitsu id that has no imdb id, without a request', async () => {
    await expect(
      anisubClient.searchSubtitles(
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
    ).resolves.toBeNull();
  });

  it('rejects a download without a file url as an unavailable source, without the token', async () => {
    const error = await anisubClient
      .downloadSubtitle(
        {
          subtitleSource: SubtitleSource.ANISUB,
          siteFileId: 'sub-71001',
          siteFileUrl: null,
          catalogSeason: null,
          catalogEpisode: null,
        },
        makeSubtitleSourceCredential({
          credentialKind: CredentialKind.ACCESS_TOKEN,
          apiKey: undefined,
          accessToken: ACCESS_TOKEN,
        }),
      )
      .catch(caughtError => caughtError);
    expect(error).toBeInstanceOf(SourceUnavailableError);
    expect(`${error.message} ${error.cause?.message}`).not.toContain(
      ACCESS_TOKEN,
    );
  });

  it('fails a token download whose file link it cannot read, before any request', async () => {
    const error = await anisubClient
      .downloadSubtitle(
        {
          subtitleSource: SubtitleSource.ANISUB,
          siteFileId: 'sub-71001',
          siteFileUrl: 'https://anisub.co/stremio/file/sub-71001.srt',
          catalogSeason: 1,
          catalogEpisode: 1,
        },
        makeSubtitleSourceCredential({
          credentialKind: CredentialKind.ACCESS_TOKEN,
          apiKey: undefined,
          accessToken: ACCESS_TOKEN,
        }),
      )
      .catch(caughtError => caughtError);
    expect(error).toBeInstanceOf(SourceUnavailableError);
    expect(error.cause.message).toBe(
      'AniSub token download needs a recognised file link.',
    );
    expect(`${error.message} ${error.cause.message}`).not.toContain(
      ACCESS_TOKEN,
    );
  });
});

describe('anisubClient.downloadSubtitle without a user token', () => {
  async function toLinkResponse() {
    return {
      status: StatusCodes.OK,
      headers: {'content-type': 'application/json'},
      body: Buffer.from(
        JSON.stringify(
          await readFixture(
            'subtitle-sources/anisub/integration-download.json',
          ),
        ),
      ),
    };
  }

  function makeClient(sharedCredentials = {}) {
    const {sharedCredentialPool} =
      createTestSharedCredentialPool(sharedCredentials);
    return createAnisubClient({sharedCredentialPool});
  }

  it('downloads under a shared token through the token endpoint', async () => {
    const fileBytes = Buffer.from('cdn file bytes');
    requestSubtitleSource
      .mockResolvedValueOnce(await toLinkResponse())
      .mockResolvedValueOnce(toFileResponse(fileBytes));

    await expect(
      makeClient({[SubtitleSource.ANISUB]: [SHARED_TOKEN]}).downloadSubtitle(
        siteRef,
        null,
      ),
    ).resolves.toMatchObject({fileBytes});
    const [[tokenRequest], [fileRequest]] = requestSubtitleSource.mock.calls;
    expect(tokenRequest).toMatchObject({
      url: 'https://anisub.co/api/integrations/subtitles/2329/download',
      headers: {Authorization: `Bearer ${SHARED_TOKEN}`},
    });
    expect(String(tokenRequest.credentialId)).not.toContain(SHARED_TOKEN);
    expect(JSON.stringify(fileRequest)).not.toContain(SHARED_TOKEN);
  });

  it('downloads the public file url without any token when the server has none', async () => {
    const fileBytes = Buffer.from('cdn file bytes');
    requestSubtitleSource
      .mockResolvedValueOnce(await toLinkResponse())
      .mockResolvedValueOnce(toFileResponse(fileBytes));

    await expect(makeClient().downloadSubtitle(siteRef, null)).resolves.toEqual(
      {
        fileBytes,
        fileNameHint: '2329-ONE_PIECE-1100.rar',
        extractedEntryPath: null,
      },
    );
    const [[publicRequest], [fileRequest]] = requestSubtitleSource.mock.calls;
    expect(publicRequest).toMatchObject({
      url: SITE_FILE_URL,
      headers: {},
      credentialId: null,
    });
    expect(fileRequest).toMatchObject({url: CDN_FILE_URL, credentialId: null});
  });

  it('returns the bytes the public file url answers with as the file', async () => {
    const fileBytes = Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nŞimdi\n');
    requestSubtitleSource.mockResolvedValueOnce(toFileResponse(fileBytes));

    await expect(
      makeClient().downloadSubtitle(siteRef, null),
    ).resolves.toMatchObject({fileBytes});
    expect(requestSubtitleSource).toHaveBeenCalledOnce();
  });

  it('falls back to the public file url once every shared token is limited', async () => {
    const fileBytes = Buffer.from('public file bytes');
    requestSubtitleSource
      .mockImplementationOnce(async siteRequest => {
        throw new SourceRateLimitError({
          subtitleSource: SubtitleSource.ANISUB,
          retryAfterMs: 60000,
          credentialId: siteRequest.credentialId,
        });
      })
      .mockResolvedValueOnce(toFileResponse(fileBytes));

    await expect(
      makeClient({[SubtitleSource.ANISUB]: [SHARED_TOKEN]}).downloadSubtitle(
        siteRef,
        null,
      ),
    ).resolves.toMatchObject({fileBytes});
    const [, [publicRequest]] = requestSubtitleSource.mock.calls;
    expect(publicRequest).toMatchObject({
      url: SITE_FILE_URL,
      headers: {},
      credentialId: null,
    });
  });

  it('falls back to the public file url once the site rejects every shared token', async () => {
    const fileBytes = Buffer.from('public file bytes');
    requestSubtitleSource
      .mockResolvedValueOnce({
        status: StatusCodes.UNAUTHORIZED,
        headers: {'content-type': 'application/json'},
        body: Buffer.from('{"success":false}'),
      })
      .mockResolvedValueOnce(toFileResponse(fileBytes));

    await expect(
      makeClient({[SubtitleSource.ANISUB]: [SHARED_TOKEN]}).downloadSubtitle(
        siteRef,
        null,
      ),
    ).resolves.toMatchObject({fileBytes});
    expect(requestSubtitleSource.mock.calls[1][0]).toMatchObject({
      url: SITE_FILE_URL,
      headers: {},
    });
  });

  it("downloads under the user's own token, never a shared one", async () => {
    requestSubtitleSource.mockResolvedValueOnce(
      toFileResponse(Buffer.from('user file')),
    );

    await makeClient({
      [SubtitleSource.ANISUB]: [SHARED_TOKEN],
    }).downloadSubtitle(siteRef, tokenCredential);

    expect(requestSubtitleSource.mock.calls[0][0]).toMatchObject({
      headers: {Authorization: `Bearer ${ACCESS_TOKEN}`},
      credentialId: tokenCredential.credentialId,
    });
  });

  it('takes the public file url for a link the token endpoint cannot read, even with a shared token', async () => {
    const addonFileUrl = 'https://anisub.co/stremio/file/sub-71001.srt';
    const fileBytes = Buffer.from('public file bytes');
    requestSubtitleSource.mockResolvedValueOnce(toFileResponse(fileBytes));

    await expect(
      makeClient({[SubtitleSource.ANISUB]: [SHARED_TOKEN]}).downloadSubtitle(
        {...siteRef, siteFileUrl: addonFileUrl},
        null,
      ),
    ).resolves.toMatchObject({fileBytes});
    expect(requestSubtitleSource).toHaveBeenCalledOnce();
    expect(requestSubtitleSource.mock.calls[0][0]).toMatchObject({
      url: addonFileUrl,
      headers: {},
      credentialId: null,
    });
  });

  it("passes a user token's rejection on, so it never falls back to the keyless path", async () => {
    requestSubtitleSource.mockResolvedValueOnce({
      status: StatusCodes.UNAUTHORIZED,
      headers: {'content-type': 'application/json'},
      body: Buffer.from('{"success":false}'),
    });

    await expect(
      makeClient().downloadSubtitle(siteRef, tokenCredential),
    ).rejects.toMatchObject({
      name: 'SourceCredentialError',
      credentialId: tokenCredential.credentialId,
    });
    expect(requestSubtitleSource).toHaveBeenCalledOnce();
  });
});
