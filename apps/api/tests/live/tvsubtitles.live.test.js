import {describe, expect, it} from 'vitest';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {tvsubtitlesClient} from '../../src/lib/subtitle-sources/tvsubtitles/tvsubtitles-client.js';
import {runLiveCase} from './helpers/live-report.js';
import {
  makeLiveSearchQuery,
  toSubtitleRef,
} from './helpers/live-search-query.js';

const serviceName = SubtitleSource.label(SubtitleSource.TVSUBTITLES);

describe('TVsubtitles live', () => {
  it('searches tt4574334:1:8 by its title and downloads the first zip', async testContext => {
    await runLiveCase(
      {
        serviceName,
        liveNote: 'Title search post, season and episode pages, one zip.',
      },
      testContext,
      async () => {
        const searchQuery = makeLiveSearchQuery('tt4574334:1:8', ['eng'], {
          catalogTitle: 'Stranger Things',
        });
        const hits = await tvsubtitlesClient.searchSubtitles(searchQuery, null);
        expect(hits.length).toBeGreaterThan(0);
        const download = await tvsubtitlesClient.downloadSubtitle(
          toSubtitleRef(hits[0], searchQuery),
          null,
        );
        expect(download.fileBytes.length).toBeGreaterThan(0);
      },
    );
  });
});
