import {describe, expect, it} from 'vitest';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {loadLiveSecrets} from '../../scripts/lib/live-secrets.js';
import {subsourceClient} from '../../src/lib/subtitle-sources/subsource/subsource-client.js';
import {makeSubtitleSourceCredential} from '../helpers/subtitle-source-factories.js';
import {listMissingSecretNames, runLiveCase} from './helpers/live-report.js';
import {
  makeLiveSearchQuery,
  toSubtitleRef,
} from './helpers/live-search-query.js';

const serviceName = SubtitleSource.label(SubtitleSource.SUBSOURCE);
const liveSecrets = loadLiveSecrets();

describe('SubSource live', () => {
  it('searches tt0133093 in English with the key and downloads once', async testContext => {
    await runLiveCase(
      {
        serviceName,
        liveNote: 'Keyed search and one download.',
        missingSecretNames: listMissingSecretNames(liveSecrets, [
          'SUBSOURCE_API_KEY',
        ]),
      },
      testContext,
      async () => {
        const credential = makeSubtitleSourceCredential({
          apiKey: liveSecrets.SUBSOURCE_API_KEY,
        });
        const searchQuery = makeLiveSearchQuery('tt0133093', ['eng']);
        const hits = await subsourceClient.searchSubtitles(
          searchQuery,
          credential,
        );
        expect(hits.length).toBeGreaterThan(0);
        const download = await subsourceClient.downloadSubtitle(
          toSubtitleRef(hits[0], searchQuery),
          credential,
        );
        expect(download.fileBytes.length).toBeGreaterThan(0);
      },
    );
  });
});
