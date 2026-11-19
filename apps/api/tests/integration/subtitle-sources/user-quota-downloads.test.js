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
import {anisubClient} from '../../../src/lib/subtitle-sources/anisub/anisub-client.js';
import {anisubMapping} from '../../../src/lib/subtitle-sources/anisub/anisub-mapping.js';
import {subdlClient} from '../../../src/lib/subtitle-sources/subdl/subdl-client.js';
import {subdlMapping} from '../../../src/lib/subtitle-sources/subdl/subdl-mapping.js';
import {createSubtitleSourceRegistry} from '../../../src/lib/subtitle-sources/subtitle-source-clients.js';
import {thesubtitledbClient} from '../../../src/lib/subtitle-sources/thesubtitledb/thesubtitledb-client.js';
import {thesubtitledbMapping} from '../../../src/lib/subtitle-sources/thesubtitledb/thesubtitledb-mapping.js';
import {persistSearchHits} from '../../../src/lib/subtitle-store/persist-search-hits.js';
import {readVideoCandidates} from '../../../src/lib/subtitle-store/read-video-candidates.js';
import {userConfigCache} from '../../../src/lib/user-config-cache.js';
import {createUserConfig} from '../../helpers/factories.js';
import {createFixtureSubtitleSourceClient} from '../../helpers/fixture-subtitle-source.js';
import {readFixture} from '../../helpers/read-fixture.js';
import {makeSearchQuery} from '../../helpers/subtitle-source-factories.js';

const SHIPPED_CLIENT_FIELDS = [
  'subtitleSource',
  'credentialKinds',
  'isSearchHashSensitive',
  'downloadBudgets',
  'isAvailable',
  'canSearchWithoutCredential',
  'canDownloadWithoutCredential',
  'canUseSharedCredential',
];

const USER_QUOTA_SOURCES = [
  {
    shippedClient: subdlClient,
    videoId: 'tt9900001:1:3',
    credentialKind: CredentialKind.API_KEY,
    credentialSecret: {apiKey: 'subdl-background-key'},
    readSearchHits: async () =>
      subdlMapping.toSearchHits(
        toJsonResponse(
          await readFixture('subtitle-sources/subdl/subtitles.json'),
        ),
      ),
  },
  {
    shippedClient: thesubtitledbClient,
    videoId: 'tt0944947:1:1',
    credentialKind: CredentialKind.API_KEY,
    credentialSecret: {apiKey: 'thesubtitledb-background-key'},
    readSearchHits: async () =>
      thesubtitledbMapping.toSearchHits(
        toJsonResponse(
          await readFixture(
            'subtitle-sources/thesubtitledb/by-imdb-episode.json',
          ),
        ),
      ),
  },
  {
    shippedClient: anisubClient,
    videoId: 'tt0877057:1:1',
    credentialKind: CredentialKind.ACCESS_TOKEN,
    credentialSecret: {accessToken: 'anisub-background-token'},
    readSearchHits: async () =>
      anisubMapping.toSearchHits(
        toJsonResponse(
          await readFixture('subtitle-sources/anisub/addon-subtitles.json'),
        ),
        makeSearchQuery({languageCodes: ['tur']}),
      ),
  },
];

function toJsonResponse(body) {
  return {
    status: StatusCodes.OK,
    headers: {'content-type': 'application/json'},
    body,
  };
}

function makeVideoContext(videoId) {
  const [, catalogSeason, catalogEpisode] = videoId.split(':').map(Number);
  const episodeTag = `S${String(catalogSeason).padStart(2, '0')}E${String(catalogEpisode).padStart(2, '0')}`;
  return {
    videoId,
    catalogSeason,
    catalogEpisode,
    videoHash: null,
    videoRelease: parseReleaseName(
      `Fixture.Show.${episodeTag}.1080p.WEB-DL-GROUP`,
    ),
    catalogDurationMs: null,
  };
}

async function storeCandidates({videoId, readSearchHits}, videoContext) {
  await persistSearchHits({videoId, searchHits: await readSearchHits()});
  return readVideoCandidates({videoId, videoContext});
}

async function readKeyedUserConfig(
  {shippedClient, credentialKind, credentialSecret},
  listImprovementSwitchStates,
) {
  const {userConfig} = await createUserConfig({
    listImprovementSwitchStates,
    credentials: [
      {
        subtitleSource: shippedClient.subtitleSource,
        credentialKind,
        credentialSecret,
      },
    ],
  });
  return userConfigCache.get(userConfig.id);
}

async function runBackgroundDownloads(
  userQuotaSource,
  listImprovementSwitchStates = {},
) {
  const fixtureClient = createFixtureSubtitleSourceClient({
    ...pick(userQuotaSource.shippedClient, SHIPPED_CLIENT_FIELDS),
    downloadSubtitle: vi.fn(async () => {
      throw new Error('The fixture site has no file.');
    }),
  });
  const subtitleSourceRegistry = createSubtitleSourceRegistry([fixtureClient]);
  const videoContext = makeVideoContext(userQuotaSource.videoId);
  const cachedUserConfig = await readKeyedUserConfig(
    userQuotaSource,
    listImprovementSwitchStates,
  );
  const candidates = await storeCandidates(userQuotaSource, videoContext);
  const [foregroundCredentials, backgroundCredentials] = await Promise.all([
    readDownloadCredentials({cachedUserConfig, client: fixtureClient}),
    readDownloadCredentials({
      cachedUserConfig,
      client: fixtureClient,
      isBackground: true,
    }),
  ]);
  expect(candidates).not.toHaveLength(0);
  expect(foregroundCredentials).toHaveLength(1);

  await downloadFreeCandidates({
    client: fixtureClient,
    candidates,
    videoContext,
    credentials: backgroundCredentials,
    cachedUserConfig,
    subtitleSourceRegistry,
  });
  scheduleListBackgroundWork({
    cachedUserConfig,
    videoContext,
    candidates,
    credentialsBySource: {
      [fixtureClient.subtitleSource]: backgroundCredentials,
    },
    subtitleSourceRegistry,
  });
  await drainBackgroundQueues();
  return fixtureClient.downloadSubtitle;
}

function toSourceCases(userQuotaSources) {
  return userQuotaSources.map(userQuotaSource => [
    SubtitleSource.label(userQuotaSource.shippedClient.subtitleSource),
    userQuotaSource,
  ]);
}

describe('background downloads on the user quota', () => {
  it.each(
    toSourceCases(
      USER_QUOTA_SOURCES.filter(
        ({shippedClient}) => !shippedClient.canUseSharedCredential,
      ),
    ),
  )(
    "never spends a user's own %s key from background work once the switch is off",
    async (_, userQuotaSource) => {
      const downloadSubtitle = await runBackgroundDownloads(userQuotaSource, {
        [userQuotaSource.shippedClient.subtitleSource]: false,
      });

      expect(downloadSubtitle).not.toHaveBeenCalled();
    },
  );

  it.each(
    toSourceCases(
      USER_QUOTA_SOURCES.filter(
        ({shippedClient}) => !shippedClient.canUseSharedCredential,
      ),
    ),
  )(
    "spends a user's own %s key from background work once the switch is on",
    async (_, userQuotaSource) => {
      const downloadSubtitle = await runBackgroundDownloads(userQuotaSource, {
        [userQuotaSource.shippedClient.subtitleSource]: true,
      });

      expect(downloadSubtitle).toHaveBeenCalled();
      for (const [, credential] of downloadSubtitle.mock.calls) {
        expect(credential).toEqual(
          expect.objectContaining(userQuotaSource.credentialSecret),
        );
      }
    },
  );

  it("never spends a user's own SubDL key while its switch is off by default", async () => {
    const downloadSubtitle = await runBackgroundDownloads(
      USER_QUOTA_SOURCES.find(
        ({shippedClient}) => shippedClient === subdlClient,
      ),
    );

    expect(downloadSubtitle).not.toHaveBeenCalled();
  });

  it("spends a user's own TheSubtitleDB key while its switch is on by default", async () => {
    const downloadSubtitle = await runBackgroundDownloads(
      USER_QUOTA_SOURCES.find(
        ({shippedClient}) => shippedClient === thesubtitledbClient,
      ),
    );

    expect(downloadSubtitle).toHaveBeenCalled();
  });

  it.each(
    toSourceCases(
      USER_QUOTA_SOURCES.filter(
        ({shippedClient}) => shippedClient.canUseSharedCredential,
      ),
    ),
  )(
    "downloads %s in the background on the server path only, never with the user's own token",
    async (_, userQuotaSource) => {
      const downloadSubtitle = await runBackgroundDownloads(userQuotaSource);

      expect(downloadSubtitle).toHaveBeenCalled();
      for (const [, credential] of downloadSubtitle.mock.calls) {
        expect(credential).toBeNull();
      }
    },
  );
});
