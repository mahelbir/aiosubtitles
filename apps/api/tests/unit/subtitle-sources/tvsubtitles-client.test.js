import {describe, expect, it} from 'vitest';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {listSubtitleSourceClients} from '../../../src/lib/subtitle-sources/subtitle-source-clients.js';
import {SubtitleSourceBudgetScope} from '../../../src/lib/subtitle-sources/subtitle-source-contract.js';
import {tvsubtitlesClient} from '../../../src/lib/subtitle-sources/tvsubtitles/tvsubtitles-client.js';
import {makeSearchQuery} from '../../helpers/subtitle-source-factories.js';

describe('tvsubtitlesClient', () => {
  it('names its subtitle source and takes no credential', () => {
    expect(tvsubtitlesClient.subtitleSource).toBe(SubtitleSource.TVSUBTITLES);
    expect(tvsubtitlesClient.credentialKinds).toEqual([]);
    expect(tvsubtitlesClient.canSearchWithoutCredential()).toBe(true);
    expect(tvsubtitlesClient.canDownloadWithoutCredential()).toBe(true);
  });

  it('searches by title, not by video hash', () => {
    expect(tvsubtitlesClient.isSearchHashSensitive).toBe(false);
  });

  it('declares the unknown-limit download budget', () => {
    expect(tvsubtitlesClient.downloadBudgets).toEqual([
      {
        budgetScope: SubtitleSourceBudgetScope.SUBTITLE_SOURCE,
        windowMs: 60000,
        requestMax: 10,
      },
    ]);
  });

  it('implements the search and download calls and no credential calls', () => {
    expect(tvsubtitlesClient.searchSubtitles).toBeTypeOf('function');
    expect(tvsubtitlesClient.downloadSubtitle).toBeTypeOf('function');
    expect(tvsubtitlesClient.checkCredential).toBeUndefined();
    expect(tvsubtitlesClient.readQuota).toBeUndefined();
  });

  it('is registered with the subtitle source clients', () => {
    expect(listSubtitleSourceClients()).toContain(tvsubtitlesClient);
  });

  it('answers a movie query with no hits and no request', async () => {
    expect(
      await tvsubtitlesClient.searchSubtitles(
        makeSearchQuery({
          videoId: 'tt0133093',
          imdbId: 'tt0133093',
          catalogTitle: 'The Matrix',
        }),
        null,
      ),
    ).toEqual([]);
  });

  it('answers an episode query without a catalog title with no hits and no request', async () => {
    expect(
      await tvsubtitlesClient.searchSubtitles(
        makeSearchQuery({
          videoId: 'tt4574334:1:8',
          videoType: 'series',
          imdbId: 'tt4574334',
          catalogSeason: 1,
          catalogEpisode: 8,
          catalogTitle: null,
        }),
        null,
      ),
    ).toEqual([]);
  });
});
