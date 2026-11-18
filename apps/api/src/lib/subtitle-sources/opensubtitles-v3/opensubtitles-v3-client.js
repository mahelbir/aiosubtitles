import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {SubtitleSourceBudgetScope} from '../subtitle-source-contract.js';
import {requestSubtitleSource} from '../subtitle-source-request.js';
import {opensubtitlesV3Mapping} from './opensubtitles-v3-mapping.js';

const DOWNLOAD_WINDOW = 60000;
const DOWNLOAD_MAX = 10;

export const opensubtitlesV3Client = {
  subtitleSource: SubtitleSource.OPENSUBTITLES_V3,
  credentialKinds: [],
  isSearchHashSensitive: false,
  downloadBudgets: [
    {
      budgetScope: SubtitleSourceBudgetScope.SUBTITLE_SOURCE,
      windowMs: DOWNLOAD_WINDOW,
      requestMax: DOWNLOAD_MAX,
    },
  ],
  canSearchWithoutCredential: () => true,
  canDownloadWithoutCredential: () => true,
  async searchSubtitles(searchQuery, credential, {signal} = {}) {
    const searchRequest =
      opensubtitlesV3Mapping.buildSearchRequest(searchQuery);
    if (searchRequest === null) {
      return [];
    }
    return opensubtitlesV3Mapping.toSearchHits(
      await requestSubtitleSource({...searchRequest, signal}),
      searchQuery,
    );
  },
  async downloadSubtitle(subtitleRef, credential, {signal} = {}) {
    return opensubtitlesV3Mapping.toDownload(
      await requestSubtitleSource({
        ...opensubtitlesV3Mapping.buildDownloadRequest(subtitleRef),
        signal,
      }),
    );
  },
};
