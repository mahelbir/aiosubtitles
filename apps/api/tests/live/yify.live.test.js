import {describe, expect, it} from 'vitest';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {yifyClient} from '../../src/lib/subtitle-sources/yify/yify-client.js';
import {runLiveCase} from './helpers/live-report.js';
import {
  makeLiveSearchQuery,
  toSubtitleRef,
} from './helpers/live-search-query.js';

const serviceName = SubtitleSource.label(SubtitleSource.YIFY);

describe('YIFY live', () => {
  it('searches tt0133093 and downloads the first zip', async testContext => {
    await runLiveCase(
      {serviceName, liveNote: 'Movie page search and one zip download.'},
      testContext,
      async () => {
        const searchQuery = makeLiveSearchQuery('tt0133093', ['eng']);
        const hits = await yifyClient.searchSubtitles(searchQuery, null);
        expect(hits.length).toBeGreaterThan(0);
        const download = await yifyClient.downloadSubtitle(
          toSubtitleRef(hits[0], searchQuery),
          null,
        );
        expect(download.fileBytes.length).toBeGreaterThan(0);
      },
    );
  });
});
