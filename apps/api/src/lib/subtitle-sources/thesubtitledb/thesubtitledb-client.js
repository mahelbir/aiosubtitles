import {CredentialKind} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {SubtitleSourceBudgetScope} from '../subtitle-source-contract.js';
import {requestSubtitleSource} from '../subtitle-source-request.js';
import {thesubtitledbMapping} from './thesubtitledb-mapping.js';

const CREDENTIAL_DOWNLOAD_WINDOW = 86400000;
const CREDENTIAL_DOWNLOAD_MAX = 100000;

export const thesubtitledbClient = {
  subtitleSource: SubtitleSource.THESUBTITLEDB,
  credentialKinds: [CredentialKind.API_KEY],
  isSearchHashSensitive: false,
  downloadBudgets: [
    {
      budgetScope: SubtitleSourceBudgetScope.CREDENTIAL,
      windowMs: CREDENTIAL_DOWNLOAD_WINDOW,
      requestMax: CREDENTIAL_DOWNLOAD_MAX,
    },
  ],
  isAvailable: () => true,
  canSearchWithoutCredential: () => false,
  canDownloadWithoutCredential: () => false,
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
  async downloadSubtitle(subtitleRef, credential, {signal} = {}) {
    return thesubtitledbMapping.toDownload(
      await requestSubtitleSource({
        ...thesubtitledbMapping.buildDownloadRequest(subtitleRef, credential),
        signal,
      }),
    );
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
