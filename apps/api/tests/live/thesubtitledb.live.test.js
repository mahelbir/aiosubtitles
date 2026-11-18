import {describe, expect, it} from 'vitest';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {thesubtitledbClient} from '../../src/lib/subtitle-sources/thesubtitledb/thesubtitledb-client.js';
import {runLiveCase} from './helpers/live-report.js';
import {
  makeLiveSearchQuery,
  toSubtitleRef,
} from './helpers/live-search-query.js';

const serviceName = SubtitleSource.label(SubtitleSource.THESUBTITLEDB);

describe('TheSubtitleDB live', () => {
  it('searches tt0133093 without a key and downloads once', async testContext => {
    await runLiveCase(
      {serviceName, liveNote: 'Keyless search and one download.'},
      testContext,
      async () => {
        const searchQuery = makeLiveSearchQuery('tt0133093', ['tur', 'eng']);
        const hits = await thesubtitledbClient.searchSubtitles(
          searchQuery,
          null,
        );
        expect(hits.length).toBeGreaterThan(0);
        const download = await thesubtitledbClient.downloadSubtitle(
          toSubtitleRef(hits[0], searchQuery),
          null,
        );
        expect(download.fileBytes.length).toBeGreaterThan(0);
      },
    );
  });
});
