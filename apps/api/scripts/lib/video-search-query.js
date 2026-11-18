import {isNil} from 'es-toolkit';
import {VideoType} from '@repo/shared/constants/video-type.js';
import {parseStremioVideoId} from '../../src/lib/video-catalog/parse-video-id.js';

export function makeVideoSearchQuery({
  videoId,
  languageCodes,
  videoHash = null,
}) {
  const {imdbId, kitsuId, catalogSeason, catalogEpisode} =
    parseStremioVideoId(videoId);
  return {
    videoId,
    videoType: isNil(catalogSeason) ? VideoType.MOVIE : VideoType.SERIES,
    imdbId,
    kitsuId,
    catalogSeason,
    catalogEpisode,
    tvdbId: null,
    languageCodes,
    videoHash,
    videoSizeBytes: null,
    videoFilename: null,
  };
}
