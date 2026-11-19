import {CredentialKind} from '@repo/shared/constants/credential.js';
import {SubtitleLanguage} from '@repo/shared/constants/subtitle-language.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {
  sharedCredentialPool as defaultSharedCredentialPool,
  reserveKeylessCall,
} from '../shared-credential-pool.js';
import {
  SubtitleSourceBudgetScope,
  SubtitleSourceVideoType,
} from '../subtitle-source-contract.js';
import {requestSubtitleSource as requestSite} from '../subtitle-source-request.js';
import {anisubMapping} from './anisub-mapping.js';

const KEYLESS_DOWNLOAD_WINDOW = 60000;
const KEYLESS_DOWNLOAD_MAX = 60;
const CREDENTIAL_DOWNLOAD_WINDOW = 86400000;
const CREDENTIAL_DOWNLOAD_MAX = 1000;

export function createAnisubClient({
  requestSubtitleSource = requestSite,
  sharedCredentialPool = defaultSharedCredentialPool,
} = {}) {
  const subtitleSource = SubtitleSource.ANISUB;

  async function finishDownload(fileResponse, fileLink, signal) {
    if (fileLink === null) {
      return anisubMapping.toDownload(fileResponse);
    }
    return anisubMapping.toDownload(
      await requestSubtitleSource({
        ...anisubMapping.buildDownloadRequest(fileLink),
        signal,
      }),
      fileLink.fileNameHint,
    );
  }

  async function downloadWithToken(subtitleRef, credential, signal) {
    const fileResponse = await requestSubtitleSource({
      ...anisubMapping.buildIntegrationDownloadRequest(subtitleRef, credential),
      signal,
    });
    return finishDownload(
      fileResponse,
      anisubMapping.toDownloadLink(fileResponse, credential),
      signal,
    );
  }

  async function downloadKeyless(subtitleRef, signal) {
    const fileResponse = await requestSubtitleSource({
      ...anisubMapping.buildDownloadRequest(subtitleRef),
      signal,
    });
    return finishDownload(
      fileResponse,
      anisubMapping.toFileDownloadLink(fileResponse),
      signal,
    );
  }

  return {
    subtitleSource,
    credentialKinds: [CredentialKind.ACCESS_TOKEN],
    isSearchHashSensitive: false,
    servedLanguageCodes: [SubtitleLanguage.TUR],
    servedVideoTypes: [
      SubtitleSourceVideoType.MOVIE,
      SubtitleSourceVideoType.SERIES,
    ],
    isSearchKeyless: true,
    isKeylessLimitSeparate: true,
    canUseSharedCredential: true,
    canDownloadWithSharedCredential: true,
    downloadBudgets: [
      {
        budgetScope: SubtitleSourceBudgetScope.SUBTITLE_SOURCE,
        windowMs: KEYLESS_DOWNLOAD_WINDOW,
        requestMax: KEYLESS_DOWNLOAD_MAX,
      },
      {
        budgetScope: SubtitleSourceBudgetScope.CREDENTIAL,
        windowMs: CREDENTIAL_DOWNLOAD_WINDOW,
        requestMax: CREDENTIAL_DOWNLOAD_MAX,
      },
    ],
    isAvailable: () => true,
    canSearchWithoutCredential: () => true,
    canDownloadWithoutCredential: () => true,
    async searchSubtitles(searchQuery, credential, {signal} = {}) {
      const searchRequest = anisubMapping.buildSearchRequest(searchQuery);
      if (searchRequest === null) {
        return null;
      }
      return anisubMapping.toSearchHits(
        await requestSubtitleSource({...searchRequest, signal}),
        searchQuery,
      );
    },
    async downloadSubtitle(
      subtitleRef,
      credential,
      {signal, reserveCall} = {},
    ) {
      if (!credential && !anisubMapping.hasTokenFileLink(subtitleRef)) {
        await reserveKeylessCall({subtitleSource, reserveCall});
        return downloadKeyless(subtitleRef, signal);
      }
      return sharedCredentialPool.callWithCredential({
        subtitleSource,
        credentialKind: CredentialKind.ACCESS_TOKEN,
        credential,
        reserveCall,
        runCall: activeCredential =>
          activeCredential
            ? downloadWithToken(subtitleRef, activeCredential, signal)
            : downloadKeyless(subtitleRef, signal),
      });
    },
    async checkCredential(credential, {signal} = {}) {
      return anisubMapping.toCredentialCheck(
        await requestSubtitleSource({
          ...anisubMapping.buildCredentialCheckRequest(credential),
          signal,
        }),
      );
    },
    async readQuota(credential, {signal} = {}) {
      return anisubMapping.toQuota(
        await requestSubtitleSource({
          ...anisubMapping.buildQuotaRequest(credential),
          signal,
        }),
      );
    },
  };
}

export const anisubClient = createAnisubClient();
