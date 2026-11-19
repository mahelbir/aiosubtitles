import {SubtitleLanguage} from '@repo/shared/constants/subtitle-language.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {
  SubtitleSourceBudgetScope,
  SubtitleSourceVideoType,
} from '../subtitle-source-contract.js';
import {requestSubtitleSource} from '../subtitle-source-request.js';
import {tvsubtitlesMapping} from './tvsubtitles-mapping.js';

const DOWNLOAD_WINDOW = 60000;
const DOWNLOAD_MAX = 10;

export const tvsubtitlesClient = {
  subtitleSource: SubtitleSource.TVSUBTITLES,
  credentialKinds: [],
  isSearchHashSensitive: false,
  servedLanguageCodes: [
    SubtitleLanguage.ARA,
    SubtitleLanguage.POB,
    SubtitleLanguage.BUL,
    SubtitleLanguage.ZHO,
    SubtitleLanguage.CES,
    SubtitleLanguage.DAN,
    SubtitleLanguage.NLD,
    SubtitleLanguage.ENG,
    SubtitleLanguage.FIN,
    SubtitleLanguage.FRE,
    SubtitleLanguage.GER,
    SubtitleLanguage.ELL,
    SubtitleLanguage.HUN,
    SubtitleLanguage.ITA,
    SubtitleLanguage.JPN,
    SubtitleLanguage.KOR,
    SubtitleLanguage.POL,
    SubtitleLanguage.POR,
    SubtitleLanguage.RON,
    SubtitleLanguage.RUS,
    SubtitleLanguage.SPA,
    SubtitleLanguage.SWE,
    SubtitleLanguage.TUR,
    SubtitleLanguage.UKR,
  ],
  servedVideoTypes: [SubtitleSourceVideoType.SERIES],
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
    const searchRequest = tvsubtitlesMapping.buildSearchRequest(searchQuery);
    if (searchRequest === null) {
      return null;
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
