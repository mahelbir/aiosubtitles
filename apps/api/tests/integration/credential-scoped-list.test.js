import {afterEach, describe, expect, it, vi} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {CredentialKind} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {computeUrlCode} from '@repo/subtitle-core/stremio-row/url-code.js';
import {SubtitleVideoCandidate} from '../../src/db/models/subtitle-video-candidate.js';
import {Subtitle} from '../../src/db/models/subtitle.js';
import {drainPendingSearches} from '../../src/lib/subtitle-search/search-subtitle-source.js';
import {createSubtitleSourceRegistry} from '../../src/lib/subtitle-sources/subtitle-source-clients.js';
import {
  createStubVideoCatalog,
  requestAddonPath,
  toListPath,
} from '../helpers/addon-requests.js';
import {setTestAppOptions} from '../helpers/app.js';
import {createUserConfig} from '../helpers/factories.js';
import {createFixtureSubtitleSourceClient} from '../helpers/fixture-subtitle-source.js';
import {makeSubtitleSourceHit} from '../helpers/subtitle-source-factories.js';
import {makeSwitchStatesOnly} from '../helpers/user-config-factories.js';

const COMMUNITY = SubtitleSource.STREMIO_COMMUNITY_SUBTITLES;
const MOVIE_ID = 'tt0133093';
const URL_CODE_PATTERN = /\/([\da-f]{64})\.(?:srt|ass)$/;

const communityClient = createFixtureSubtitleSourceClient({
  subtitleSource: COMMUNITY,
  credentialKinds: [CredentialKind.ACCESS_TOKEN],
  isSearchCredentialScoped: true,
  canSearchWithoutCredential: vi.fn(() => false),
  canDownloadWithoutCredential: vi.fn(() => false),
});

setTestAppOptions({
  subtitleSourceRegistry: createSubtitleSourceRegistry([communityClient]),
  videoCatalog: createStubVideoCatalog(),
});

afterEach(async () => {
  await drainPendingSearches();
});

function createTokenUserConfig(accessToken) {
  return createUserConfig({
    subtitleSourceSwitchStates: makeSwitchStatesOnly([COMMUNITY]),
    credentials: [
      {
        subtitleSource: COMMUNITY,
        credentialKind: CredentialKind.ACCESS_TOKEN,
        credentialSecret: {accessToken},
      },
    ],
  });
}

function makeCommunityHit(siteFileId) {
  return makeSubtitleSourceHit({
    subtitleSource: COMMUNITY,
    siteFileId,
    isQuotaCostly: true,
    releaseNames: ['The.Matrix.1999.1080p.BluRay.x264-AAA'],
  });
}

async function listUrlCodes(userConfigId) {
  const response = await requestAddonPath(
    toListPath({userConfigId, videoId: MOVIE_ID}),
  );
  expect(response.statusCode).toBe(StatusCodes.OK);
  return response
    .json()
    .subtitles.map(({url}) => url.match(URL_CODE_PATTERN)?.[1]);
}

function toUrlCode(searchHit) {
  return computeUrlCode({...searchHit, archiveEntryPath: ''});
}

describe('a credential-scoped source in the list', () => {
  it('lists each user only the hits of their own token', async () => {
    const firstHit = makeCommunityHit('first-user-hit');
    const secondHit = makeCommunityHit('second-user-hit');
    communityClient.searchSubtitles
      .mockReset()
      .mockResolvedValueOnce([firstHit])
      .mockResolvedValueOnce([secondHit]);
    const {userConfig: firstUser} = await createTokenUserConfig('token-one');
    const {userConfig: secondUser} = await createTokenUserConfig('token-two');

    const firstUrlCodes = await listUrlCodes(firstUser.id);
    const secondUrlCodes = await listUrlCodes(secondUser.id);

    expect(firstUrlCodes).toEqual([toUrlCode(firstHit)]);
    expect(secondUrlCodes).toEqual([toUrlCode(secondHit)]);
    expect(await Subtitle.count({where: {subtitleSource: COMMUNITY}})).toBe(2);
    expect(await SubtitleVideoCandidate.count()).toBe(0);
  });
});
