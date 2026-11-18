import {CredentialKind} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {SubtitleSourceBudgetScope} from '../subtitle-source-contract.js';
import {requestSubtitleSource} from '../subtitle-source-request.js';
import {thesubtitledbMapping} from './thesubtitledb-mapping.js';

const ANONYMOUS_DOWNLOAD_WINDOW = 3600000;
const ANONYMOUS_DOWNLOAD_MAX = 1000;
const CREDENTIAL_DOWNLOAD_WINDOW = 86400000;
const CREDENTIAL_DOWNLOAD_MAX = 100000;

export const thesubtitledbClient = {
  subtitleSource: SubtitleSource.THESUBTITLEDB,
  credentialKinds: [CredentialKind.API_KEY],
  isSearchHashSensitive: false,
  downloadBudgets: [
    {
      budgetScope: SubtitleSourceBudgetScope.SUBTITLE_SOURCE,
      windowMs: ANONYMOUS_DOWNLOAD_WINDOW,
      requestMax: ANONYMOUS_DOWNLOAD_MAX,
    },
    {
      budgetScope: SubtitleSourceBudgetScope.CREDENTIAL,
      windowMs: CREDENTIAL_DOWNLOAD_WINDOW,
      requestMax: CREDENTIAL_DOWNLOAD_MAX,
    },
  ],
  canSearchWithoutCredential: () => true,
  canDownloadWithoutCredential: () => true,
  async searchSubtitles(searchQuery, credential, {signal} = {}) {
    const searchRequest = thesubtitledbMapping.buildSearchRequest(
      searchQuery,
      credential,
    );
    if (searchRequest === null) {
      return [];
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
