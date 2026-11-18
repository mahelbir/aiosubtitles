import {describe, expect, it} from 'vitest';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {anisubClient} from '../../src/lib/subtitle-sources/anisub/anisub-client.js';
import {anisubMapping} from '../../src/lib/subtitle-sources/anisub/anisub-mapping.js';
import {runLiveCase} from './helpers/live-report.js';
import {
  makeLiveSearchQuery,
  toSubtitleRef,
} from './helpers/live-search-query.js';

const serviceName = SubtitleSource.label(SubtitleSource.ANISUB);
const ANISUB_VIDEO_ID = 'tt0877057:1:1';
const GUARD_CREDENTIAL = {
  credentialId: 'live-guard',
  accessToken: 'live-guard-token',
};
const SITE_ID_DOWNLOAD_URL_PATTERN =
  /^https:\/\/anisub\.co\/api\/integrations\/subtitles\/\d+\/download(\?episode=\d+)?$/;

describe('AniSub live', () => {
  it('searches without a token and downloads its url once', async testContext => {
    await runLiveCase(
      {serviceName, liveNote: 'Token-free search and one download.'},
      testContext,
      async () => {
        const searchQuery = makeLiveSearchQuery(ANISUB_VIDEO_ID, ['tur']);
        const hits = await anisubClient.searchSubtitles(searchQuery, null);
        expect(hits.length).toBeGreaterThan(0);
        for (const hit of hits) {
          expect(
            anisubMapping.buildIntegrationDownloadRequest(
              toSubtitleRef(hit, searchQuery),
              GUARD_CREDENTIAL,
            ).url,
          ).toMatch(SITE_ID_DOWNLOAD_URL_PATTERN);
        }
        const download = await anisubClient.downloadSubtitle(
          toSubtitleRef(hits[0], searchQuery),
          null,
        );
        expect(download.fileBytes.length).toBeGreaterThan(0);
      },
    );
  });
});
