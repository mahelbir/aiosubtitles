import {describe, expect, it} from 'vitest';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {animetoshoClient} from '../../src/lib/subtitle-sources/animetosho/animetosho-client.js';
import {runLiveCase} from './helpers/live-report.js';
import {
  makeLiveSearchQuery,
  toSubtitleRef,
} from './helpers/live-search-query.js';

const serviceName = SubtitleSource.label(SubtitleSource.ANIMETOSHO);

describe('AnimeTosho live', () => {
  it('searches kitsu:7442:5 through its AniDB id and decodes the first attachment', async testContext => {
    await runLiveCase(
      {
        serviceName,
        liveNote:
          'Keyless feed search by aid= (undocumented), one torrent detail and one xz attachment.',
      },
      testContext,
      async () => {
        const searchQuery = makeLiveSearchQuery('kitsu:7442:5', ['eng']);
        const hits = await animetoshoClient.searchSubtitles(searchQuery, null);
        expect(hits.length).toBeGreaterThan(0);
        const download = await animetoshoClient.downloadSubtitle(
          toSubtitleRef(hits[0], searchQuery),
          null,
        );
        expect(download.fileBytes.length).toBeGreaterThan(0);
      },
    );
  });
});
