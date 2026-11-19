import {pick} from 'es-toolkit';
import {StatusCodes} from 'http-status-codes';
import {describe, expect, it, vi} from 'vitest';
import {
  CredentialKind,
  CredentialStatus,
} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {computeUrlCode} from '@repo/subtitle-core/stremio-row/url-code.js';
import {parseReleaseName} from '@repo/subtitle-core/release-name/parse-release-name.js';
import {Subtitle} from '../../../src/db/models/subtitle.js';
import {drainBackgroundQueues} from '../../../src/lib/subtitle-background/background-queues.js';
import {
  downloadFreeCandidates,
  scheduleListBackgroundWork,
} from '../../../src/lib/subtitle-background/background-jobs.js';
import {readDownloadCredentials} from '../../../src/lib/subtitle-source-credentials.js';
import {createSubtitleSourceRegistry} from '../../../src/lib/subtitle-sources/subtitle-source-clients.js';
import {
  createWyzieClient,
  wyzieClient,
} from '../../../src/lib/subtitle-sources/wyzie/wyzie-client.js';
import {wyzieMapping} from '../../../src/lib/subtitle-sources/wyzie/wyzie-mapping.js';
import {downloadSubtitleFile} from '../../../src/lib/subtitle-store/download-subtitle-file.js';
import {persistSearchHits} from '../../../src/lib/subtitle-store/persist-search-hits.js';
import {readVideoCandidates} from '../../../src/lib/subtitle-store/read-video-candidates.js';
import {userConfigCache} from '../../../src/lib/user-config-cache.js';
import {createUserConfig} from '../../helpers/factories.js';
import {createFixtureSubtitleSourceClient} from '../../helpers/fixture-subtitle-source.js';
import {readFixture} from '../../helpers/read-fixture.js';
import {
  makeSearchQuery,
  makeSubtitleSourceCredential,
} from '../../helpers/subtitle-source-factories.js';

const VIDEO_ID = 'tt0133093';
const API_KEY_A = 'fixture-wyzie-key-a';
const API_KEY_B = 'fixture-wyzie-key-b';
const TOK_LABEL_A = 'fixture-tok-user-a';
const TOK_LABEL_B = 'fixture-tok-user-b';
const SITE_FILE_ID = 'charlie:1955024019';
const FILE_TEXT = [
  '1\n00:00:07,000 --> 00:00:09,000\nHello there.\n',
  '2\n00:00:10,000 --> 00:00:12,000\nGeneral Kenobi.\n',
].join('\n');
const SEARCH_FIXTURE = 'subtitle-sources/wyzie/search.json';
const searchQuery = makeSearchQuery({
  videoId: VIDEO_ID,
  imdbId: VIDEO_ID,
  languageCodes: ['eng', 'tur'],
});
const videoContext = {
  videoId: VIDEO_ID,
  catalogSeason: null,
  catalogEpisode: null,
  videoHash: null,
  videoRelease: parseReleaseName('Fixture.Movie.1999.1080p.BluRay.x264-GROUP'),
  catalogDurationMs: null,
};

const wyzieFixtureClient = createFixtureSubtitleSourceClient({
  ...pick(wyzieClient, [
    'subtitleSource',
    'credentialKinds',
    'isSearchHashSensitive',
    'downloadBudgets',
    'canSearchWithoutCredential',
    'canDownloadWithoutCredential',
  ]),
  downloadSubtitle: vi.fn(async () => ({
    fileBytes: new TextEncoder().encode(FILE_TEXT),
    fileNameHint: null,
    extractedEntryPath: null,
  })),
  readQuota: vi.fn(),
});

function setWyzieQuota(quotaRemainingCount) {
  wyzieFixtureClient.readQuota.mockReset().mockResolvedValue({
    credentialStatus: CredentialStatus.VALID,
    quotaRemainingCount,
    quotaAllowedCount: 20,
    quotaResetAt: null,
  });
}

function makeWyzieCredentialValues(apiKey) {
  return {
    subtitleSource: SubtitleSource.WYZIE,
    credentialKind: CredentialKind.API_KEY,
    credentialSecret: {apiKey},
  };
}

async function readKeyedUserConfig(apiKey, listImprovementSwitchStates = {}) {
  const {userConfig} = await createUserConfig({
    credentials: [makeWyzieCredentialValues(apiKey)],
    listImprovementSwitchStates,
  });
  return userConfigCache.get(userConfig.id);
}

async function createFakeWyzieSite() {
  const [searchRows, sourcesBody] = await Promise.all([
    readFixture(SEARCH_FIXTURE),
    readFixture('subtitle-sources/wyzie/sources-key.json'),
  ]);
  return vi.fn(async ({url}) => {
    const siteUrl = new URL(url);
    const tokLabel =
      siteUrl.searchParams.get('key') === API_KEY_A ? TOK_LABEL_A : TOK_LABEL_B;
    if (siteUrl.pathname === '/sources') {
      return {
        status: StatusCodes.OK,
        headers: {'content-type': 'application/json'},
        body: sourcesBody,
      };
    }
    if (siteUrl.pathname === '/search') {
      return {
        status: StatusCodes.OK,
        headers: {'content-type': 'application/json'},
        body: searchRows.map(row => ({
          ...row,
          url: row.url.replace(TOK_LABEL_A, tokLabel),
        })),
      };
    }
    return {
      status: StatusCodes.OK,
      headers: {'content-type': 'text/plain'},
      body: new TextEncoder().encode(FILE_TEXT),
    };
  });
}

describe('Wyzie background downloads', () => {
  async function runWyzieBackgroundWork(listImprovementSwitchStates) {
    wyzieFixtureClient.downloadSubtitle.mockClear();
    const cachedUserConfig = await readKeyedUserConfig(
      'wyzie-background-key',
      listImprovementSwitchStates,
    );
    await persistSearchHits({
      videoId: VIDEO_ID,
      searchHits: wyzieMapping.toSearchHits(
        {
          status: StatusCodes.OK,
          headers: {'content-type': 'application/json'},
          body: await readFixture(SEARCH_FIXTURE),
        },
        {
          searchQuery,
          credential: makeSubtitleSourceCredential(),
          codenames: ['charlie', 'xray'],
        },
      ),
    });
    const candidates = (
      await readVideoCandidates({videoId: VIDEO_ID, videoContext})
    ).filter(({subtitleSource}) => subtitleSource === SubtitleSource.WYZIE);
    const credentials = await readDownloadCredentials({
      cachedUserConfig,
      client: wyzieFixtureClient,
      isBackground: true,
    });
    const subtitleSourceRegistry = createSubtitleSourceRegistry([
      wyzieFixtureClient,
    ]);
    expect(candidates).not.toHaveLength(0);
    expect(credentials).toHaveLength(1);

    await downloadFreeCandidates({
      client: wyzieFixtureClient,
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
      credentialsBySource: {[SubtitleSource.WYZIE]: credentials},
      subtitleSourceRegistry,
    });
    await drainBackgroundQueues();
    return credentials;
  }

  it("never spends a user's Wyzie key from background work once the switch is off", async () => {
    setWyzieQuota(20);

    await runWyzieBackgroundWork({[SubtitleSource.WYZIE]: false});

    expect(wyzieFixtureClient.downloadSubtitle).not.toHaveBeenCalled();
  });

  it("downloads with the user's Wyzie key while the switch is on by default", async () => {
    setWyzieQuota(20);

    const [credential] = await runWyzieBackgroundWork({});

    expect(wyzieFixtureClient.downloadSubtitle).toHaveBeenCalled();
    for (const [, downloadCredential] of wyzieFixtureClient.downloadSubtitle
      .mock.calls) {
      expect(downloadCredential).toEqual(credential);
    }
  });

  it('keeps the viewer share of the Wyzie daily allowance', async () => {
    setWyzieQuota(10);

    await runWyzieBackgroundWork({});

    expect(wyzieFixtureClient.readQuota).toHaveBeenCalled();
    expect(wyzieFixtureClient.downloadSubtitle).not.toHaveBeenCalled();
  });
});

describe('Wyzie stored rows (ruling N1)', () => {
  it("downloads a row user A's search stored with user B's key alone", async () => {
    const requestSubtitleSource = await createFakeWyzieSite();
    const client = createWyzieClient({requestSubtitleSource});
    const subtitleSourceRegistry = createSubtitleSourceRegistry([client]);
    const userConfigB = await readKeyedUserConfig(API_KEY_B);
    const hits = await client.searchSubtitles(
      searchQuery,
      makeSubtitleSourceCredential({apiKey: API_KEY_A}),
    );
    await persistSearchHits({videoId: VIDEO_ID, searchHits: hits});
    const subtitle = await Subtitle.withScope('withStoredFile').findOne({
      where: {
        urlCode: computeUrlCode({
          subtitleSource: SubtitleSource.WYZIE,
          siteFileId: SITE_FILE_ID,
          archiveEntryPath: '',
        }),
      },
    });
    expect(subtitle.siteFileUrl).not.toContain('tok=');
    requestSubtitleSource.mockClear();

    const subtitleFile = await downloadSubtitleFile({
      subtitle,
      videoContext,
      cachedUserConfig: userConfigB,
      isBackground: false,
      subtitleSourceRegistry,
    });

    expect(subtitleFile.parsedSubtitle.cues.map(({text}) => text)).toEqual([
      'Hello there.',
      'General Kenobi.',
    ]);
    const requestUrls = requestSubtitleSource.mock.calls.map(
      ([{url}]) => new URL(url),
    );
    expect(requestUrls.map(({pathname}) => pathname)).toEqual([
      '/search',
      '/c/198e0c4d/id/1955024019',
    ]);
    for (const requestUrl of requestUrls) {
      expect(requestUrl.href).not.toContain(API_KEY_A);
      expect(requestUrl.href).not.toContain(TOK_LABEL_A);
    }
    expect(requestUrls[0].searchParams.get('key')).toBe(API_KEY_B);
    expect(requestUrls[1].searchParams.get('tok')).toBe(`${TOK_LABEL_B}-1`);
  });
});
