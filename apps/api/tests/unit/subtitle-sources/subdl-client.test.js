import {strToU8, zipSync} from 'fflate';
import {StatusCodes} from 'http-status-codes';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  CredentialKind,
  CredentialStatus,
} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {toCandidateCredentials} from '../../../src/lib/subtitle-source-credentials.js';
import {subdlClient} from '../../../src/lib/subtitle-sources/subdl/subdl-client.js';
import {listSubtitleSourceClients} from '../../../src/lib/subtitle-sources/subtitle-source-clients.js';
import {SubtitleSourceBudgetScope} from '../../../src/lib/subtitle-sources/subtitle-source-contract.js';
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

const API_KEY = 'fixture-subdl-key';
const keyCredential = makeSubtitleSourceCredential({apiKey: API_KEY});
const episodeQuery = makeSearchQuery({
  videoId: 'tt9900001:1:3',
  videoType: 'series',
  imdbId: 'tt9900001',
  catalogSeason: 1,
  catalogEpisode: 3,
  languageCodes: ['tur', 'eng'],
});
const subtitleRef = {
  subtitleSource: SubtitleSource.SUBDL,
  siteFileId: '3197651-3213944',
  siteFileUrl: 'https://dl.subdl.com/subtitle/3197651-3213944.zip',
  catalogSeason: 1,
  catalogEpisode: 3,
};

afterEach(() => {
  vi.resetAllMocks();
});

describe('subdlClient', () => {
  it('names its subtitle source and needs an api key', () => {
    expect(subdlClient.subtitleSource).toBe(SubtitleSource.SUBDL);
    expect(subdlClient.credentialKinds).toEqual([CredentialKind.API_KEY]);
    expect(subdlClient.canSearchWithoutCredential()).toBe(false);
    expect(subdlClient.canDownloadWithoutCredential()).toBe(false);
  });

  it('searches by id, not by video hash', () => {
    expect(subdlClient.isSearchHashSensitive).toBe(false);
  });

  it("declares the free key's daily download limit against the user's own key", () => {
    expect(subdlClient.downloadBudgets).toEqual([
      {
        budgetScope: SubtitleSourceBudgetScope.CREDENTIAL,
        windowMs: 86400000,
        requestMax: 50,
      },
    ]);
  });

  it('implements the search, download and credential check calls', () => {
    expect(subdlClient.searchSubtitles).toBeTypeOf('function');
    expect(subdlClient.downloadSubtitle).toBeTypeOf('function');
    expect(subdlClient.checkCredential).toBeTypeOf('function');
  });

  it('is registered with the subtitle source clients', () => {
    expect(listSubtitleSourceClients()).toContain(subdlClient);
  });

  it('answers a search without a credential with no hits and no request', async () => {
    await expect(
      subdlClient.searchSubtitles(episodeQuery, null),
    ).resolves.toBeNull();
    expect(requestSubtitleSource).not.toHaveBeenCalled();
  });

  it('answers a kitsu-only query with no hits and no request', async () => {
    await expect(
      subdlClient.searchSubtitles(
        makeSearchQuery({
          videoId: 'kitsu:7442:5',
          videoType: 'series',
          imdbId: null,
          kitsuId: '7442',
          catalogSeason: 1,
          catalogEpisode: 5,
        }),
        keyCredential,
      ),
    ).resolves.toBeNull();
    expect(requestSubtitleSource).not.toHaveBeenCalled();
  });

  it('searches once with the key, counted against the credential, and maps the hits', async () => {
    requestSubtitleSource.mockResolvedValueOnce({
      status: StatusCodes.OK,
      headers: {'content-type': 'application/json'},
      body: await readFixture('subtitle-sources/subdl/subtitles.json'),
    });
    const hits = await subdlClient.searchSubtitles(episodeQuery, keyCredential);
    expect(hits.map(hit => hit.siteFileId)).toEqual([
      '3197651-3213944',
      '3197652-3213945',
      '3197653-3213946',
      '3197654-3213947',
    ]);
    expect(requestSubtitleSource).toHaveBeenCalledTimes(1);
    const [searchRequest] = requestSubtitleSource.mock.calls[0];
    expect(searchRequest.credentialId).toBe(keyCredential.credentialId);
    expect(new URL(searchRequest.url).searchParams.get('languages')).toBe(
      'TR,EN',
    );
  });

  it("downloads the zip under the user's own key, counted against the credential", async () => {
    const zipBytes = zipSync({
      'Fixture.Show.S01E03.srt': strToU8(
        '1\n00:00:01,000 --> 00:00:02,000\nMerhaba\n',
      ),
    });
    requestSubtitleSource.mockResolvedValueOnce({
      status: StatusCodes.OK,
      headers: {'content-type': 'application/zip'},
      body: zipBytes,
    });
    const download = await subdlClient.downloadSubtitle(
      subtitleRef,
      keyCredential,
    );
    expect(download.fileBytes).toBe(zipBytes);
    expect(requestSubtitleSource).toHaveBeenCalledTimes(1);
    const [downloadRequest] = requestSubtitleSource.mock.calls[0];
    expect(downloadRequest.url).toBe(
      'https://dl.subdl.com/subtitle/3197651-3213944.zip',
    );
    expect(downloadRequest.headers).toEqual({'x-api-key': API_KEY});
    expect(downloadRequest.credentialId).toBe(keyCredential.credentialId);
  });
});

describe('subdlClient.checkCredential', () => {
  it('checks the key once on the account route, counted against the credential', async () => {
    requestSubtitleSource.mockResolvedValueOnce({
      status: StatusCodes.FORBIDDEN,
      headers: {},
      body: '{"status":false}',
    });
    await expect(
      subdlClient.checkCredential(keyCredential),
    ).resolves.toMatchObject({credentialStatus: CredentialStatus.INVALID});
    expect(requestSubtitleSource).toHaveBeenCalledTimes(1);
    const [checkRequest] = requestSubtitleSource.mock.calls[0];
    expect(new URL(checkRequest.url).pathname).toBe('/api/v1/me');
    expect(checkRequest.credentialId).toBe(keyCredential.credentialId);
  });
});

describe('subdl credential use', () => {
  function readCandidates({credentials, hasConfiguredCredential}) {
    return {
      searchCandidates: toCandidateCredentials({
        credentials,
        hasConfiguredCredential,
        canUseWithoutCredential: subdlClient.canSearchWithoutCredential(),
      }),
      downloadCandidates: toCandidateCredentials({
        credentials,
        hasConfiguredCredential,
        canUseWithoutCredential: subdlClient.canDownloadWithoutCredential(),
      }),
    };
  }

  it('gives a user without a key no keyless search and no keyless download', () => {
    expect(
      readCandidates({credentials: [], hasConfiguredCredential: false}),
    ).toEqual({searchCandidates: [], downloadCandidates: []});
  });

  it('gives a user whose every key is unusable no keyless path either', () => {
    expect(
      readCandidates({credentials: [], hasConfiguredCredential: true}),
    ).toEqual({searchCandidates: [], downloadCandidates: []});
  });

  it("runs a user's search and download under the user's own key", () => {
    expect(
      readCandidates({
        credentials: [keyCredential],
        hasConfiguredCredential: true,
      }),
    ).toEqual({
      searchCandidates: [keyCredential],
      downloadCandidates: [keyCredential],
    });
  });
});
