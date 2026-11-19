import {describe, expect, it} from 'vitest';
import {CredentialKind} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {loadLiveSecrets} from '../../scripts/lib/live-secrets.js';
import {
  anisubClient,
  createAnisubClient,
} from '../../src/lib/subtitle-sources/anisub/anisub-client.js';
import {anisubMapping} from '../../src/lib/subtitle-sources/anisub/anisub-mapping.js';
import {createTestSharedCredentialPool} from '../helpers/shared-credentials.js';
import {makeSubtitleSourceCredential} from '../helpers/subtitle-source-factories.js';
import {listMissingSecretNames, runLiveCase} from './helpers/live-report.js';
import {
  makeLiveSearchQuery,
  toSubtitleRef,
} from './helpers/live-search-query.js';

const serviceName = SubtitleSource.label(SubtitleSource.ANISUB);
const liveSecrets = loadLiveSecrets();
const ANISUB_VIDEO_ID = 'tt0877057:1:1';
const SITE_ID_DOWNLOAD_URL_PATTERN =
  /^https:\/\/anisub\.co\/api\/integrations\/subtitles\/\d+\/download(\?episode=\d+)?$/;

describe('AniSub live', () => {
  it('searches with the token and downloads once through the token endpoint', async testContext => {
    await runLiveCase(
      {
        serviceName,
        liveNote: 'Search and one token download.',
        missingSecretNames: listMissingSecretNames(liveSecrets, [
          'ANISUB_ACCESS_TOKEN',
        ]),
      },
      testContext,
      async () => {
        const credential = makeSubtitleSourceCredential({
          credentialKind: CredentialKind.ACCESS_TOKEN,
          apiKey: undefined,
          accessToken: liveSecrets.ANISUB_ACCESS_TOKEN,
        });
        const searchQuery = makeLiveSearchQuery(ANISUB_VIDEO_ID, ['tur']);
        const hits = await anisubClient.searchSubtitles(
          searchQuery,
          credential,
        );
        expect(hits.length).toBeGreaterThan(0);
        for (const hit of hits) {
          expect(
            anisubMapping.buildIntegrationDownloadRequest(
              toSubtitleRef(hit, searchQuery),
              credential,
            ).url,
          ).toMatch(SITE_ID_DOWNLOAD_URL_PATTERN);
        }
        const download = await anisubClient.downloadSubtitle(
          toSubtitleRef(hits[0], searchQuery),
          credential,
        );
        expect(download.fileBytes.length).toBeGreaterThan(0);
      },
    );
  });

  it('searches and downloads once on the keyless path, with no token anywhere', async testContext => {
    await runLiveCase(
      {
        serviceName,
        liveNote: 'Keyless search and one public download.',
      },
      testContext,
      async () => {
        const {sharedCredentialPool} = createTestSharedCredentialPool({});
        const keylessClient = createAnisubClient({sharedCredentialPool});
        const searchQuery = makeLiveSearchQuery(ANISUB_VIDEO_ID, ['tur']);
        const hits = await keylessClient.searchSubtitles(searchQuery, null);
        expect(hits.length).toBeGreaterThan(0);
        const download = await keylessClient.downloadSubtitle(
          toSubtitleRef(hits[0], searchQuery),
          null,
        );
        expect(download.fileBytes.length).toBeGreaterThan(0);
      },
    );
  });
});
