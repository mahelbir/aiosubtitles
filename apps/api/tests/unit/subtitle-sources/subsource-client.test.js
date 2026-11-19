import {afterEach, describe, expect, it, vi} from 'vitest';
import {CredentialKind} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {subsourceClient} from '../../../src/lib/subtitle-sources/subsource/subsource-client.js';
import {listSubtitleSourceClients} from '../../../src/lib/subtitle-sources/subtitle-source-clients.js';
import {SubtitleSourceBudgetScope} from '../../../src/lib/subtitle-sources/subtitle-source-contract.js';
import {
  SourceRateLimitError,
  SourceUnavailableError,
} from '../../../src/lib/subtitle-sources/subtitle-source-errors.js';
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

afterEach(() => {
  vi.resetAllMocks();
});

describe('subsourceClient', () => {
  it('names its subtitle source and needs an api key', () => {
    expect(subsourceClient.subtitleSource).toBe(SubtitleSource.SUBSOURCE);
    expect(subsourceClient.credentialKinds).toEqual([CredentialKind.API_KEY]);
    expect(subsourceClient.canSearchWithoutCredential()).toBe(false);
    expect(subsourceClient.canDownloadWithoutCredential()).toBe(false);
  });

  it('searches by id, not by video hash', () => {
    expect(subsourceClient.isSearchHashSensitive).toBe(false);
  });

  it('declares the free plan download limit per key', () => {
    expect(subsourceClient.downloadBudgets).toEqual([
      {
        budgetScope: SubtitleSourceBudgetScope.CREDENTIAL,
        windowMs: 60000,
        requestMax: 60,
      },
    ]);
  });

  it('implements the search, download and credential check calls', () => {
    expect(subsourceClient.searchSubtitles).toBeTypeOf('function');
    expect(subsourceClient.downloadSubtitle).toBeTypeOf('function');
    expect(subsourceClient.checkCredential).toBeTypeOf('function');
  });

  it('is registered with the subtitle source clients', () => {
    expect(listSubtitleSourceClients()).toContain(subsourceClient);
  });

  it('answers a search without a credential with no hits and no request', async () => {
    await expect(
      subsourceClient.searchSubtitles(makeSearchQuery(), null),
    ).resolves.toBeNull();
  });

  it('answers a kitsu-only query with no hits and no request', async () => {
    await expect(
      subsourceClient.searchSubtitles(
        makeSearchQuery({
          videoId: 'kitsu:7442:5',
          videoType: 'series',
          imdbId: null,
          kitsuId: '7442',
          catalogSeason: 1,
          catalogEpisode: 5,
        }),
        makeSubtitleSourceCredential(),
      ),
    ).resolves.toBeNull();
    expect(requestSubtitleSource).not.toHaveBeenCalled();
  });

  it('settles its per-language calls through the shared hit-list rule', async () => {
    const [moviesBody, subtitlesBody] = await Promise.all([
      readFixture('subtitle-sources/subsource/movies-search.json'),
      readFixture('subtitle-sources/subsource/subtitles.json'),
    ]);
    const rateLimitError = new SourceRateLimitError({
      subtitleSource: SubtitleSource.SUBSOURCE,
      retryAfterMs: 60000,
      credentialId: null,
    });
    const seasonQuery = makeSearchQuery({
      videoId: 'tt9900001:1:3',
      videoType: 'series',
      imdbId: 'tt9900001',
      catalogSeason: 1,
      catalogEpisode: 3,
      languageCodes: ['tur', 'eng'],
    });
    const credential = makeSubtitleSourceCredential();
    requestSubtitleSource
      .mockResolvedValueOnce({status: 200, headers: {}, body: moviesBody})
      .mockResolvedValueOnce({status: 200, headers: {}, body: subtitlesBody})
      .mockRejectedValueOnce(
        new SourceUnavailableError({
          subtitleSource: SubtitleSource.SUBSOURCE,
          cause: new Error('Status 503.'),
        }),
      );
    const hits = await subsourceClient.searchSubtitles(seasonQuery, credential);
    expect(hits.map(hit => hit.siteFileId)).toEqual([
      '9200001',
      '9200002',
      '9200003',
    ]);
    expect(requestSubtitleSource).toHaveBeenCalledTimes(3);
    requestSubtitleSource
      .mockResolvedValueOnce({status: 200, headers: {}, body: moviesBody})
      .mockResolvedValueOnce({status: 200, headers: {}, body: subtitlesBody})
      .mockRejectedValueOnce(rateLimitError);
    await expect(
      subsourceClient.searchSubtitles(seasonQuery, credential),
    ).rejects.toBe(rateLimitError);
  });
});
