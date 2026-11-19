import {describe, expect, it} from 'vitest';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {listSubtitleSourceClients} from '../../../src/lib/subtitle-sources/subtitle-source-clients.js';
import {SubtitleSourceBudgetScope} from '../../../src/lib/subtitle-sources/subtitle-source-contract.js';
import {yifyClient} from '../../../src/lib/subtitle-sources/yify/yify-client.js';
import {makeSearchQuery} from '../../helpers/subtitle-source-factories.js';

describe('yifyClient', () => {
  it('names its subtitle source and takes no credential', () => {
    expect(yifyClient.subtitleSource).toBe(SubtitleSource.YIFY);
    expect(yifyClient.credentialKinds).toEqual([]);
    expect(yifyClient.canSearchWithoutCredential?.()).toBe(true);
    expect(yifyClient.canDownloadWithoutCredential?.()).toBe(true);
  });

  it('searches by id, not by video hash', () => {
    expect(yifyClient.isSearchHashSensitive).toBe(false);
  });

  it('declares the unknown-limit download budget', () => {
    expect(yifyClient.downloadBudgets).toEqual([
      {
        budgetScope: SubtitleSourceBudgetScope.SUBTITLE_SOURCE,
        windowMs: 60000,
        requestMax: 10,
      },
    ]);
  });

  it('implements the search and download calls and no credential calls', () => {
    expect(yifyClient.searchSubtitles).toBeTypeOf('function');
    expect(yifyClient.downloadSubtitle).toBeTypeOf('function');
    expect(yifyClient.checkCredential).toBeUndefined();
    expect(yifyClient.readQuota).toBeUndefined();
  });

  it('is registered with the subtitle source clients', () => {
    expect(listSubtitleSourceClients()).toContain(yifyClient);
  });

  it('answers a series query with no hits and no request', async () => {
    await expect(
      yifyClient.searchSubtitles?.(
        makeSearchQuery({
          videoId: 'tt0903747:1:1',
          videoType: 'series',
          imdbId: 'tt0903747',
          catalogSeason: 1,
          catalogEpisode: 1,
        }),
        null,
      ),
    ).resolves.toBeNull();
  });

  it('answers a query without an imdb id with no hits and no request', async () => {
    await expect(
      yifyClient.searchSubtitles?.(
        makeSearchQuery({
          videoId: 'kitsu:7442',
          imdbId: null,
          kitsuId: '7442',
        }),
        null,
      ),
    ).resolves.toBeNull();
  });
});
