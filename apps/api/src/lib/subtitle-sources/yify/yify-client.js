import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {SubtitleSourceBudgetScope} from '../subtitle-source-contract.js';
import {requestSubtitleSource} from '../subtitle-source-request.js';
import {yifyMapping} from './yify-mapping.js';

const DOWNLOAD_WINDOW = 60000;
const DOWNLOAD_MAX = 10;

export const yifyClient = {
  subtitleSource: SubtitleSource.YIFY,
  credentialKinds: [],
  isSearchHashSensitive: false,
  downloadBudgets: [
    {
      budgetScope: SubtitleSourceBudgetScope.SUBTITLE_SOURCE,
      windowMs: DOWNLOAD_WINDOW,
      requestMax: DOWNLOAD_MAX,
    },
  ],
  isAvailable: () => true,
  canSearchWithoutCredential: () => true,
  canDownloadWithoutCredential: () => true,
  async searchSubtitles(searchQuery, credential, {signal} = {}) {
    const searchRequest = yifyMapping.buildSearchRequest(searchQuery);
    if (searchRequest === null) {
      return null;
    }
    return yifyMapping.toSearchHits(
      await requestSubtitleSource({...searchRequest, signal}),
    );
  },
  async downloadSubtitle(subtitleRef, credential, {signal} = {}) {
    const downloadLink = yifyMapping.toDownloadLink(
      await requestSubtitleSource({
        ...yifyMapping.buildDownloadRequest(subtitleRef),
        signal,
      }),
    );
    return yifyMapping.toDownload(
      await requestSubtitleSource({
        ...yifyMapping.buildFileRequest(downloadLink),
        signal,
      }),
    );
  },
};
