import {VideoIdKind, parseStremioVideoId} from './parse-video-id.js';

export const UNRESOLVED_VIDEO_EPISODE = Object.freeze({
  imdbId: null,
  catalogSeason: null,
  catalogEpisode: null,
  isEpisodeResolved: false,
});

export async function resolveVideoEpisode({videoId, resolveKitsuVideo}) {
  const parsedVideoId = parseStremioVideoId(videoId);
  if (parsedVideoId.videoIdKind !== VideoIdKind.KITSU) {
    return {
      imdbId: parsedVideoId.imdbId,
      catalogSeason: parsedVideoId.catalogSeason,
      catalogEpisode: parsedVideoId.catalogEpisode,
      isEpisodeResolved: true,
    };
  }
  const kitsuVideo = await resolveKitsuVideo({
    kitsuId: parsedVideoId.kitsuId,
    kitsuEpisode: parsedVideoId.catalogEpisode,
  });
  return kitsuVideo
    ? {
        imdbId: kitsuVideo.imdbId,
        catalogSeason: kitsuVideo.catalogSeason,
        catalogEpisode: kitsuVideo.catalogEpisode,
        isEpisodeResolved: true,
      }
    : UNRESOLVED_VIDEO_EPISODE;
}
