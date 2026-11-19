import {StatusCodes} from 'http-status-codes';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {CredentialKind} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {anisubClient} from '../../../src/lib/subtitle-sources/anisub/anisub-client.js';
import {listSubtitleSourceClients} from '../../../src/lib/subtitle-sources/subtitle-source-clients.js';
import {SubtitleSourceBudgetScope} from '../../../src/lib/subtitle-sources/subtitle-source-contract.js';
import {SourceUnavailableError} from '../../../src/lib/subtitle-sources/subtitle-source-errors.js';
import {requestSubtitleSource} from '../../../src/lib/subtitle-sources/subtitle-source-request.js';
import {readFixture} from '../../helpers/read-fixture.js';
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
  it("names its subtitle source and requires the user's own access token", () => {
    expect(anisubClient.subtitleSource).toBe(SubtitleSource.ANISUB);
    expect(anisubClient.credentialKinds).toEqual([CredentialKind.ACCESS_TOKEN]);
    expect(anisubClient.canSearchWithoutCredential()).toBe(false);
    expect(anisubClient.canDownloadWithoutCredential()).toBe(false);
  });

  it('searches by id, not by video hash', () => {
    expect(anisubClient.isSearchHashSensitive).toBe(false);
  });

  it('declares the documented download limits', () => {
    expect(anisubClient.downloadBudgets).toEqual([
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
