import {afterEach, describe, expect, it, vi} from 'vitest';
import {CredentialKind} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {altyazidbClient} from '../../../src/lib/subtitle-sources/altyazidb/altyazidb-client.js';
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

describe('altyazidbClient without an imdb id', () => {
  it('answers could-not-search without a request', async () => {
    await expect(
      altyazidbClient.searchSubtitles(
        makeSearchQuery({videoId: 'kitsu:7442:5', imdbId: null}),
        makeSubtitleSourceCredential(),
      ),
    ).resolves.toBeNull();
    expect(requestSubtitleSource).not.toHaveBeenCalled();
  });
});

describe('altyazidbClient', () => {
  it('names its subtitle source and needs an api key', () => {
    expect(altyazidbClient.subtitleSource).toBe(SubtitleSource.ALTYAZIDB);
    expect(altyazidbClient.credentialKinds).toEqual([CredentialKind.API_KEY]);
    expect(altyazidbClient.canSearchWithoutCredential()).toBe(false);
    expect(altyazidbClient.canDownloadWithoutCredential()).toBe(false);
  });

  it('searches by id, not by video hash', () => {
    expect(altyazidbClient.isSearchHashSensitive).toBe(false);
  });

  it('declares the default budget for an unknown limit', () => {
    expect(altyazidbClient.downloadBudgets).toEqual([
      {
        budgetScope: SubtitleSourceBudgetScope.SUBTITLE_SOURCE,
        windowMs: 60000,
        requestMax: 10,
      },
      {
        budgetScope: SubtitleSourceBudgetScope.CREDENTIAL,
        windowMs: 60000,
        requestMax: 10,
      },
    ]);
  });

  it('implements the search, download and credential check calls', () => {
    expect(altyazidbClient.searchSubtitles).toBeTypeOf('function');
    expect(altyazidbClient.downloadSubtitle).toBeTypeOf('function');
    expect(altyazidbClient.checkCredential).toBeTypeOf('function');
  });

  it('is registered with the subtitle source clients', () => {
    expect(listSubtitleSourceClients()).toContain(altyazidbClient);
  });

  it('settles its episode and PAKET calls through the shared hit-list rule', async () => {
    const episodeBody = await readFixture(
      'subtitle-sources/altyazidb/search-episode.json',
    );
    const rateLimitError = new SourceRateLimitError({
      subtitleSource: SubtitleSource.ALTYAZIDB,
      retryAfterMs: 60000,
      credentialId: null,
    });
    const episodeQuery = makeSearchQuery({
      videoId: 'tt9900001:1:4',
      videoType: 'series',
      imdbId: 'tt9900001',
      catalogSeason: 1,
      catalogEpisode: 4,
      languageCodes: ['tur'],
    });
    const credential = makeSubtitleSourceCredential();
    requestSubtitleSource
      .mockResolvedValueOnce({status: 200, headers: {}, body: episodeBody})
      .mockRejectedValueOnce(
        new SourceUnavailableError({
          subtitleSource: SubtitleSource.ALTYAZIDB,
          cause: new Error('Status 503.'),
        }),
      );
    const hits = await altyazidbClient.searchSubtitles(
      episodeQuery,
      credential,
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(requestSubtitleSource).toHaveBeenCalledTimes(2);
    requestSubtitleSource
      .mockResolvedValueOnce({status: 200, headers: {}, body: episodeBody})
      .mockRejectedValueOnce(rateLimitError);
    await expect(
      altyazidbClient.searchSubtitles(episodeQuery, credential),
    ).rejects.toBe(rateLimitError);
  });
});
