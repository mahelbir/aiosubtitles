import {CredentialKind} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {SubtitleSourceBudgetScope} from '../subtitle-source-contract.js';
import {requestSubtitleSource} from '../subtitle-source-request.js';
import {stremioCommunitySubtitlesMapping} from './stremio-community-subtitles-mapping.js';

const DOWNLOAD_WINDOW = 60000;
const DOWNLOAD_MAX = 10;

export const stremioCommunitySubtitlesClient = {
  subtitleSource: SubtitleSource.STREMIO_COMMUNITY_SUBTITLES,
  credentialKinds: [CredentialKind.ACCESS_TOKEN],
  isSearchHashSensitive: true,
  isSearchCredentialScoped: true,
  downloadBudgets: [
    {
      budgetScope: SubtitleSourceBudgetScope.CREDENTIAL,
      windowMs: DOWNLOAD_WINDOW,
      requestMax: DOWNLOAD_MAX,
    },
  ],
  isAvailable: () => true,
  canSearchWithoutCredential: () => false,
  canDownloadWithoutCredential: () => false,
  async searchSubtitles(searchQuery, credential, {signal} = {}) {
    const searchRequest = stremioCommunitySubtitlesMapping.buildSearchRequest(
      searchQuery,
      credential,
    );
    if (searchRequest === null) {
      return null;
    }
    return stremioCommunitySubtitlesMapping.toSearchHits(
      await requestSubtitleSource({...searchRequest, signal}),
      searchQuery,
      credential,
    );
  },
  async downloadSubtitle(subtitleRef, credential, {signal} = {}) {
    return stremioCommunitySubtitlesMapping.toDownload(
      await requestSubtitleSource({
        ...stremioCommunitySubtitlesMapping.buildDownloadRequest(
          subtitleRef,
          credential,
        ),
        signal,
      }),
      credential,
    );
  },
  async checkCredential(credential, {signal} = {}) {
    return stremioCommunitySubtitlesMapping.toCredentialCheck(
      await requestSubtitleSource({
        ...stremioCommunitySubtitlesMapping.buildCredentialCheckRequest(
          credential,
        ),
        signal,
      }),
    );
  },
};
