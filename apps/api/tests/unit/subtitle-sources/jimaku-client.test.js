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
import {SourceUnavailableError} from '../../../src/lib/subtitle-sources/subtitle-source-errors.js';
import {requestSubtitleSource} from '../../../src/lib/subtitle-sources/subtitle-source-request.js';
import {CatalogService} from '../../../src/lib/video-catalog/catalog-service.js';
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

const API_KEY = 'fixture-jimaku-key';
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

function makeClient(anilistId = 154587) {
  const readAnilistId = vi.fn(async () => anilistId);
  return {client: createJimakuClient({readAnilistId}), readAnilistId};
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
  it("names its subtitle source and needs the user's own api key", () => {
    expect(jimakuClient.subtitleSource).toBe(SubtitleSource.JIMAKU);
    expect(jimakuClient.credentialKinds).toEqual([CredentialKind.API_KEY]);
    expect(jimakuClient.canSearchWithoutCredential()).toBe(false);
    expect(jimakuClient.canDownloadWithoutCredential()).toBe(false);
  });

  it('takes one required key on the configure page', () => {
    expect(SubtitleSource.item(SubtitleSource.JIMAKU)).toMatchObject({
      credentialRequirement: CredentialRequirement.REQUIRED,
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

describe('jimaku credential use (D32)', () => {
  function readCandidates({credentials, hasConfiguredCredential}) {
    return {
      searchCandidates: toCandidateCredentials({
        credentials,
        hasConfiguredCredential,
        canUseWithoutCredential: jimakuClient.canSearchWithoutCredential(),
      }),
      downloadCandidates: toCandidateCredentials({
        credentials,
        hasConfiguredCredential,
        canUseWithoutCredential: jimakuClient.canDownloadWithoutCredential(),
      }),
    };
  }

  it('gives a user without a key no keyless search and no keyless download', () => {
    expect(
      readCandidates({credentials: [], hasConfiguredCredential: false}),
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
