import {CredentialKind} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {SubtitleSourceBudgetScope} from '../subtitle-source-contract.js';
import {requestSubtitleSource} from '../subtitle-source-request.js';
import {anisubMapping} from './anisub-mapping.js';

const ANONYMOUS_DOWNLOAD_WINDOW = 60000;
const ANONYMOUS_DOWNLOAD_MAX = 60;
const CREDENTIAL_DOWNLOAD_WINDOW = 86400000;
const CREDENTIAL_DOWNLOAD_MAX = 1000;

async function requestLinkedFile(fileLink, signal) {
  return anisubMapping.toDownload(
    await requestSubtitleSource({
      ...anisubMapping.buildDownloadRequest(fileLink),
      signal,
    }),
    fileLink.fileNameHint,
  );
}

export const anisubClient = {
  subtitleSource: SubtitleSource.ANISUB,
  credentialKinds: [CredentialKind.ACCESS_TOKEN],
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
    const searchRequest = anisubMapping.buildSearchRequest(searchQuery);
    if (searchRequest === null) {
      return [];
    }
    return anisubMapping.toSearchHits(
      await requestSubtitleSource({...searchRequest, signal}),
      searchQuery,
    );
  },
  async downloadSubtitle(subtitleRef, credential, {signal} = {}) {
    const integrationRequest = anisubMapping.buildIntegrationDownloadRequest(
      subtitleRef,
      credential,
    );
    const fileResponse = await requestSubtitleSource({
      ...(integrationRequest ??
        anisubMapping.buildDownloadRequest(subtitleRef)),
      signal,
    });
    const fileLink =
      integrationRequest === null
        ? anisubMapping.toFileDownloadLink(fileResponse)
        : anisubMapping.toDownloadLink(fileResponse, credential);
    return fileLink === null
      ? anisubMapping.toDownload(fileResponse)
      : requestLinkedFile(fileLink, signal);
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
