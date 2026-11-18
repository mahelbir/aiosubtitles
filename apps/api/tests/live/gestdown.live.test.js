import {describe, expect, it} from 'vitest';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {gestdownClient} from '../../src/lib/subtitle-sources/gestdown/gestdown-client.js';
import {runLiveCase} from './helpers/live-report.js';
import {
  makeLiveSearchQuery,
  toSubtitleRef,
} from './helpers/live-search-query.js';

const serviceName = SubtitleSource.label(SubtitleSource.GESTDOWN);

describe('Gestdown live', () => {
  it('searches tt0903747:1:1 by its tvdb id and downloads the first hit', async testContext => {
    await runLiveCase(
      {serviceName, liveNote: 'Keyless episode search and one download.'},
      testContext,
      async () => {
        const searchQuery = makeLiveSearchQuery('tt0903747:1:1', ['eng'], {
          tvdbId: '81189',
        });
        const hits = await gestdownClient.searchSubtitles(searchQuery, null);
        expect(hits.length).toBeGreaterThan(0);
        const download = await gestdownClient.downloadSubtitle(
          toSubtitleRef(hits[0], searchQuery),
          null,
        );
        expect(download.fileBytes.length).toBeGreaterThan(0);
      },
    );
  });
});
