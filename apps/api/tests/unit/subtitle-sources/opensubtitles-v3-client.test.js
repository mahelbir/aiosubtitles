import {describe, expect, it} from 'vitest';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {opensubtitlesV3Client} from '../../../src/lib/subtitle-sources/opensubtitles-v3/opensubtitles-v3-client.js';
import {listSubtitleSourceClients} from '../../../src/lib/subtitle-sources/subtitle-source-clients.js';
import {SubtitleSourceBudgetScope} from '../../../src/lib/subtitle-sources/subtitle-source-contract.js';
import {SourceUnavailableError} from '../../../src/lib/subtitle-sources/subtitle-source-errors.js';
import {makeSearchQuery} from '../../helpers/subtitle-source-factories.js';

describe('opensubtitlesV3Client', () => {
  it('names its subtitle source and takes no credential', () => {
    expect(opensubtitlesV3Client.subtitleSource).toBe(
      SubtitleSource.OPENSUBTITLES_V3,
    );
    expect(opensubtitlesV3Client.credentialKinds).toEqual([]);
    expect(opensubtitlesV3Client.canSearchWithoutCredential()).toBe(true);
    expect(opensubtitlesV3Client.canDownloadWithoutCredential()).toBe(true);
  });

  it('searches by id, not by video hash', () => {
    expect(opensubtitlesV3Client.isSearchHashSensitive).toBe(false);
  });

  it('declares the unknown-limit download budget', () => {
    expect(opensubtitlesV3Client.downloadBudgets).toEqual([
      {
        budgetScope: SubtitleSourceBudgetScope.SUBTITLE_SOURCE,
        windowMs: 60000,
        requestMax: 10,
      },
    ]);
  });

  it('implements the search and download calls and no credential calls', () => {
    expect(opensubtitlesV3Client.searchSubtitles).toBeTypeOf('function');
    expect(opensubtitlesV3Client.downloadSubtitle).toBeTypeOf('function');
    expect(opensubtitlesV3Client.checkCredential).toBeUndefined();
    expect(opensubtitlesV3Client.readQuota).toBeUndefined();
  });

  it('is registered with the subtitle source clients', () => {
    expect(listSubtitleSourceClients()).toContain(opensubtitlesV3Client);
  });

  it('answers a kitsu-only query with no hits and no request', async () => {
    await expect(
      opensubtitlesV3Client.searchSubtitles(
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
    ).resolves.toEqual([]);
  });

  it('rejects a download without a file url as an unavailable source', async () => {
    await expect(
      opensubtitlesV3Client.downloadSubtitle(
        {
          subtitleSource: SubtitleSource.OPENSUBTITLES_V3,
          siteFileId: '7100001',
          siteFileUrl: null,
          catalogSeason: null,
          catalogEpisode: null,
        },
        null,
      ),
    ).rejects.toBeInstanceOf(SourceUnavailableError);
  });
});
