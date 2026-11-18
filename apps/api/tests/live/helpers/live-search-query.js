import {makeVideoSearchQuery} from '../../../scripts/lib/video-search-query.js';

export function makeLiveSearchQuery(videoId, languageCodes, overrides = {}) {
  return {...makeVideoSearchQuery({videoId, languageCodes}), ...overrides};
}

export function toSubtitleRef(hit, searchQuery) {
  return {
    subtitleSource: hit.subtitleSource,
    siteFileId: hit.siteFileId,
    siteFileUrl: hit.siteFileUrl,
    catalogSeason: searchQuery.catalogSeason,
    catalogEpisode: searchQuery.catalogEpisode,
    isSitePack: hit.isSitePack,
  };
}
