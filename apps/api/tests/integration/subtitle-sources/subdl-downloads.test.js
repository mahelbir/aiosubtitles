import {pick} from 'es-toolkit';
import {StatusCodes} from 'http-status-codes';
import {describe, expect, it, vi} from 'vitest';
import {CredentialKind} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {parseReleaseName} from '@repo/subtitle-core/release-name/parse-release-name.js';
import {drainBackgroundQueues} from '../../../src/lib/subtitle-background/background-queues.js';
import {
  downloadFreeCandidates,
  scheduleListBackgroundWork,
} from '../../../src/lib/subtitle-background/background-jobs.js';
import {readDownloadCredentials} from '../../../src/lib/subtitle-source-credentials.js';
import {subdlClient} from '../../../src/lib/subtitle-sources/subdl/subdl-client.js';
import {subdlMapping} from '../../../src/lib/subtitle-sources/subdl/subdl-mapping.js';
import {createSubtitleSourceRegistry} from '../../../src/lib/subtitle-sources/subtitle-source-clients.js';
import {persistSearchHits} from '../../../src/lib/subtitle-store/persist-search-hits.js';
import {readVideoCandidates} from '../../../src/lib/subtitle-store/read-video-candidates.js';
import {userConfigCache} from '../../../src/lib/user-config-cache.js';
import {createUserConfig} from '../../helpers/factories.js';
import {createFixtureSubtitleSourceClient} from '../../helpers/fixture-subtitle-source.js';
import {readFixture} from '../../helpers/read-fixture.js';

const VIDEO_ID = 'tt9900001:1:3';

const subdlFixtureClient = createFixtureSubtitleSourceClient({
  ...pick(subdlClient, [
    'subtitleSource',
    'credentialKinds',
    'isSearchHashSensitive',
    'downloadBudgets',
    'canSearchWithoutCredential',
    'canDownloadWithoutCredential',
  ]),
  downloadSubtitle: vi.fn(),
});
const subtitleSourceRegistry = createSubtitleSourceRegistry([
  subdlFixtureClient,
]);
const videoContext = {
  videoId: VIDEO_ID,
  catalogSeason: 1,
  catalogEpisode: 3,
  videoHash: null,
  videoRelease: parseReleaseName('Fixture.Show.S01E03.1080p.WEB-DL-GROUP'),
  catalogDurationMs: null,
};

async function storeSubdlCandidates() {
  await persistSearchHits({
    videoId: VIDEO_ID,
    searchHits: subdlMapping.toSearchHits({
      status: StatusCodes.OK,
      headers: {'content-type': 'application/json'},
      body: await readFixture('subtitle-sources/subdl/subtitles.json'),
    }),
  });
  return readVideoCandidates({videoId: VIDEO_ID, videoContext});
}

async function readKeyedUserConfig() {
  const {userConfig} = await createUserConfig({
    credentials: [
      {
        subtitleSource: SubtitleSource.SUBDL,
        credentialKind: CredentialKind.API_KEY,
        credentialSecret: {apiKey: 'subdl-background-key'},
      },
    ],
  });
  return userConfigCache.get(userConfig.id);
}

describe('SubDL background downloads', () => {
  it("never spends a user's SubDL key from background work", async () => {
    const cachedUserConfig = await readKeyedUserConfig();
    const candidates = await storeSubdlCandidates();
    const credentials = readDownloadCredentials({
      cachedUserConfig,
      client: subdlFixtureClient,
    });
    expect(candidates).not.toHaveLength(0);
    expect(credentials).toHaveLength(1);

    await downloadFreeCandidates({
      client: subdlFixtureClient,
      candidates,
      videoContext,
      credentials,
      cachedUserConfig,
      subtitleSourceRegistry,
    });
    scheduleListBackgroundWork({
      cachedUserConfig,
      videoContext,
      candidates,
      credentialsBySource: {[SubtitleSource.SUBDL]: credentials},
      subtitleSourceRegistry,
    });
    await drainBackgroundQueues();

    expect(subdlFixtureClient.downloadSubtitle).not.toHaveBeenCalled();
  });
});
