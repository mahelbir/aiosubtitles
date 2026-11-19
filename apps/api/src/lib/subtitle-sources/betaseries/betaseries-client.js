import {CredentialKind} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {sharedCredentialPool as defaultSharedCredentialPool} from '../shared-credential-pool.js';
import {SubtitleSourceBudgetScope} from '../subtitle-source-contract.js';
import {requestSubtitleSource as requestSite} from '../subtitle-source-request.js';
import {betaseriesMapping} from './betaseries-mapping.js';

const DOWNLOAD_WINDOW = 60000;
const DOWNLOAD_MAX = 10;

export function createBetaseriesClient({
  requestSubtitleSource = requestSite,
  sharedCredentialPool = defaultSharedCredentialPool,
} = {}) {
  const subtitleSource = SubtitleSource.BETASERIES;
  const sharedKeyTarget = {
    subtitleSource,
    credentialKind: CredentialKind.API_KEY,
  };

  async function searchWithCredential(searchQuery, credential, signal) {
    const showRequest = betaseriesMapping.buildShowRequest(
      searchQuery,
      credential,
    );
    if (showRequest === null) {
      return null;
    }
    const showId = betaseriesMapping.findShowId(
      await requestSubtitleSource({...showRequest, signal}),
      credential,
    );
    if (showId === null) {
      return [];
    }
    const episodeId = betaseriesMapping.findEpisodeId(
      await requestSubtitleSource({
        ...betaseriesMapping.buildEpisodeRequest(
          showId,
          searchQuery,
          credential,
        ),
        signal,
      }),
      searchQuery,
      credential,
    );
    if (episodeId === null) {
      return [];
    }
    return betaseriesMapping.toSearchHits(
      await requestSubtitleSource({
        ...betaseriesMapping.buildSubtitlesRequest(
          episodeId,
          searchQuery,
          credential,
        ),
        signal,
      }),
      credential,
    );
  }

  return {
    subtitleSource,
    credentialKinds: [CredentialKind.API_KEY],
    isSearchHashSensitive: false,
    canUseSharedCredential: true,
    isDownloadKeyless: true,
    downloadBudgets: [
      {
        budgetScope: SubtitleSourceBudgetScope.SUBTITLE_SOURCE,
        windowMs: DOWNLOAD_WINDOW,
        requestMax: DOWNLOAD_MAX,
      },
    ],
    isAvailable: () => true,
    canSearchWithoutCredential: () =>
      sharedCredentialPool.hasUsableCredential(sharedKeyTarget),
    canDownloadWithoutCredential: () => true,
    searchSubtitles(searchQuery, credential, {signal} = {}) {
      return sharedCredentialPool.callWithCredential({
        ...sharedKeyTarget,
        credential,
        runCall: activeCredential =>
          searchWithCredential(searchQuery, activeCredential, signal),
      });
    },
    async downloadSubtitle(subtitleRef, credential, {signal} = {}) {
      return betaseriesMapping.toDownload(
        await requestSubtitleSource({
          ...betaseriesMapping.buildDownloadRequest(subtitleRef),
          signal,
        }),
      );
    },
    async checkCredential(credential, {signal} = {}) {
      return betaseriesMapping.toCredentialCheck(
        await requestSubtitleSource({
          ...betaseriesMapping.buildCredentialCheckRequest(credential),
          signal,
        }),
        credential,
      );
    },
  };
}

export const betaseriesClient = createBetaseriesClient();
