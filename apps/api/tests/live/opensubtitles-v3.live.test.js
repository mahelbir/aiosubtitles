import {describe, expect, it} from 'vitest';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {opensubtitlesV3Client} from '../../src/lib/subtitle-sources/opensubtitles-v3/opensubtitles-v3-client.js';
import {runLiveCase} from './helpers/live-report.js';
import {
  makeLiveSearchQuery,
  toSubtitleRef,
} from './helpers/live-search-query.js';

const serviceName = SubtitleSource.label(SubtitleSource.OPENSUBTITLES_V3);

describe('OpenSubtitles v3 live', () => {
  it('searches tt0903747:1:1 and downloads the first url', async testContext => {
    await runLiveCase(
      {serviceName, liveNote: 'Episode search and one download.'},
      testContext,
      async () => {
        const searchQuery = makeLiveSearchQuery('tt0903747:1:1', ['eng']);
        const hits = await opensubtitlesV3Client.searchSubtitles(
          searchQuery,
          null,
        );
        expect(hits.length).toBeGreaterThan(0);
        const download = await opensubtitlesV3Client.downloadSubtitle(
          toSubtitleRef(hits[0], searchQuery),
          null,
        );
        expect(download.fileBytes.length).toBeGreaterThan(0);
      },
    );
  });
});
