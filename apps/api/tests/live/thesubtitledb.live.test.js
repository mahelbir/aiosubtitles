import {describe, expect, it} from 'vitest';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {loadLiveSecrets} from '../../scripts/lib/live-secrets.js';
import {thesubtitledbClient} from '../../src/lib/subtitle-sources/thesubtitledb/thesubtitledb-client.js';
import {makeSubtitleSourceCredential} from '../helpers/subtitle-source-factories.js';
import {listMissingSecretNames, runLiveCase} from './helpers/live-report.js';
import {
  makeLiveSearchQuery,
  toSubtitleRef,
} from './helpers/live-search-query.js';

const serviceName = SubtitleSource.label(SubtitleSource.THESUBTITLEDB);
const liveSecrets = loadLiveSecrets();

describe('TheSubtitleDB live', () => {
  it('searches tt0133093 with the key and downloads once', async testContext => {
    await runLiveCase(
      {
        serviceName,
        liveNote: 'Keyed search and one download.',
        missingSecretNames: listMissingSecretNames(liveSecrets, [
          'THESUBTITLEDB_API_KEY',
        ]),
      },
      testContext,
      async () => {
        const credential = makeSubtitleSourceCredential({
          apiKey: liveSecrets.THESUBTITLEDB_API_KEY,
        });
        const searchQuery = makeLiveSearchQuery('tt0133093', ['tur', 'eng']);
        const hits = await thesubtitledbClient.searchSubtitles(
          searchQuery,
          credential,
        );
        expect(hits.length).toBeGreaterThan(0);
        const download = await thesubtitledbClient.downloadSubtitle(
          toSubtitleRef(hits[0], searchQuery),
          credential,
        );
        expect(download.fileBytes.length).toBeGreaterThan(0);
      },
    );
  });
});
