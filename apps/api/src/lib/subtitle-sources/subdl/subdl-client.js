import {CredentialKind} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {SubtitleSourceBudgetScope} from '../subtitle-source-contract.js';
import {requestSubtitleSource} from '../subtitle-source-request.js';
import {subdlMapping} from './subdl-mapping.js';

const CREDENTIAL_DOWNLOAD_WINDOW = 86400000;
const CREDENTIAL_DOWNLOAD_MAX = 50;

export const subdlClient = {
  subtitleSource: SubtitleSource.SUBDL,
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
    const searchRequest = subdlMapping.buildSearchRequest(
      searchQuery,
      credential,
    );
    if (searchRequest === null) {
      return null;
    }
    return subdlMapping.toSearchHits(
      await requestSubtitleSource({...searchRequest, signal}),
    );
  },
  async downloadSubtitle(subtitleRef, credential, {signal} = {}) {
    return subdlMapping.toDownload(
      await requestSubtitleSource({
        ...subdlMapping.buildDownloadRequest(subtitleRef, credential),
        signal,
      }),
    );
  },
  async checkCredential(credential, {signal} = {}) {
    return subdlMapping.toCredentialCheck(
      await requestSubtitleSource({
        ...subdlMapping.buildCredentialCheckRequest(credential),
        signal,
      }),
    );
  },
};
