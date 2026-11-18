import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {SubtitleSourceBudgetScope} from '../subtitle-source-contract.js';
import {requestSubtitleSource} from '../subtitle-source-request.js';
import {tvsubtitlesMapping} from './tvsubtitles-mapping.js';

const DOWNLOAD_WINDOW = 60000;
const DOWNLOAD_MAX = 10;

export const tvsubtitlesClient = {
  subtitleSource: SubtitleSource.TVSUBTITLES,
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
    const searchRequest = tvsubtitlesMapping.buildSearchRequest(searchQuery);
    if (searchRequest === null) {
      return [];
    }
    const showId = tvsubtitlesMapping.findShowId(
      await requestSubtitleSource({...searchRequest, signal}),
      searchQuery,
    );
    if (showId === null) {
      return [];
    }
    const episodeId = tvsubtitlesMapping.findEpisodeId(
      await requestSubtitleSource({
        ...tvsubtitlesMapping.buildSeasonRequest(showId, searchQuery),
        signal,
      }),
      searchQuery,
    );
    if (episodeId === null) {
      return [];
    }
    return tvsubtitlesMapping.toSearchHits(
      await requestSubtitleSource({
        ...tvsubtitlesMapping.buildEpisodeRequest(episodeId),
        signal,
      }),
      {showId, catalogSeason: searchQuery.catalogSeason},
    );
  },
  async downloadSubtitle(subtitleRef, credential, {signal} = {}) {
    const downloadLink = tvsubtitlesMapping.toDownloadLink(
      await requestSubtitleSource({
        ...tvsubtitlesMapping.buildDownloadRequest(subtitleRef),
        signal,
      }),
    );
    return tvsubtitlesMapping.toDownload(
      await requestSubtitleSource({
        ...tvsubtitlesMapping.buildFileRequest(downloadLink),
        signal,
      }),
      downloadLink,
    );
  },
};
