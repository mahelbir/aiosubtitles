import {describe, expect, it} from 'vitest';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {loadLiveSecrets} from '../../scripts/lib/live-secrets.js';
import {betaseriesClient} from '../../src/lib/subtitle-sources/betaseries/betaseries-client.js';
import {makeSubtitleSourceCredential} from '../helpers/subtitle-source-factories.js';
import {listMissingSecretNames, runLiveCase} from './helpers/live-report.js';
import {
  makeLiveSearchQuery,
  toSubtitleRef,
} from './helpers/live-search-query.js';

const serviceName = SubtitleSource.label(SubtitleSource.BETASERIES);
const liveSecrets = loadLiveSecrets();

describe('BetaSeries live', () => {
  it('searches tt0903747:1:1 in French and English and downloads once', async testContext => {
    await runLiveCase(
      {
        serviceName,
        liveNote: 'Keyed episode search and one download.',
        missingSecretNames: listMissingSecretNames(liveSecrets, [
          'BETASERIES_API_KEY',
        ]),
      },
      testContext,
      async () => {
        const credential = makeSubtitleSourceCredential({
          apiKey: liveSecrets.BETASERIES_API_KEY,
        });
        const searchQuery = makeLiveSearchQuery('tt0903747:1:1', [
          'fre',
          'eng',
        ]);
        const hits = await betaseriesClient.searchSubtitles(
          searchQuery,
          credential,
        );
        expect(hits.length).toBeGreaterThan(0);
        const download = await betaseriesClient.downloadSubtitle(
          toSubtitleRef(hits[0], searchQuery),
          credential,
        );
        expect(download.fileBytes.length).toBeGreaterThan(0);
      },
    );
  });
});
