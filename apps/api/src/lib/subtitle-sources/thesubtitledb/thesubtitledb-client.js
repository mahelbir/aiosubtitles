import {CredentialKind} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {sharedCredentialPool as defaultSharedCredentialPool} from '../shared-credential-pool.js';
import {SubtitleSourceBudgetScope} from '../subtitle-source-contract.js';
import {requestSubtitleSource as requestSite} from '../subtitle-source-request.js';
import {thesubtitledbMapping} from './thesubtitledb-mapping.js';

const KEYLESS_DOWNLOAD_WINDOW = 3600000;
const KEYLESS_DOWNLOAD_MAX = 1000;
const CREDENTIAL_DOWNLOAD_WINDOW = 86400000;
const CREDENTIAL_DOWNLOAD_MAX = 100000;

export function createThesubtitledbClient({
  requestSubtitleSource = requestSite,
  sharedCredentialPool = defaultSharedCredentialPool,
} = {}) {
  const subtitleSource = SubtitleSource.THESUBTITLEDB;

  return {
    subtitleSource,
    credentialKinds: [CredentialKind.API_KEY],
    isSearchHashSensitive: false,
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
      const searchRequest = thesubtitledbMapping.buildSearchRequest(
        searchQuery,
        credential,
      );
      if (searchRequest === null) {
        return null;
      }
      return thesubtitledbMapping.toSearchHits(
        await requestSubtitleSource({...searchRequest, signal}),
      );
    },
    downloadSubtitle(subtitleRef, credential, {signal} = {}) {
      return sharedCredentialPool.callWithCredential({
        subtitleSource,
        credential,
        runCall: async activeCredential =>
          thesubtitledbMapping.toDownload(
            await requestSubtitleSource({
              ...thesubtitledbMapping.buildDownloadRequest(
                subtitleRef,
                activeCredential,
              ),
              signal,
            }),
          ),
      });
    },
    async checkCredential(credential, {signal} = {}) {
      return thesubtitledbMapping.toCredentialCheck(
        await requestSubtitleSource({
          ...thesubtitledbMapping.buildCredentialCheckRequest(credential),
          signal,
        }),
      );
    },
  };
}

export const thesubtitledbClient = createThesubtitledbClient();
