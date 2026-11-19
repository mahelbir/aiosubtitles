import {createLogger} from '../logger.js';
import {VideoIdKind, parseStremioVideoId} from './parse-video-id.js';

const logger = createLogger('video-catalog');

export const UNRESOLVED_VIDEO_EPISODE = Object.freeze({
  imdbId: null,
  catalogSeason: null,
  catalogEpisode: null,
  isEpisodeResolved: false,
});

export async function resolveVideoEpisode({videoId, resolveKitsuVideo}) {
  const parsedVideoId = parseStremioVideoId(videoId);
  const {kitsuEpisode} = parsedVideoId;
  if (parsedVideoId.videoIdKind !== VideoIdKind.KITSU) {
    return {
      imdbId: parsedVideoId.imdbId,
      catalogSeason: parsedVideoId.catalogSeason,
      catalogEpisode: parsedVideoId.catalogEpisode,
      kitsuEpisode,
      isEpisodeResolved: true,
    };
  }
  try {
    const kitsuVideo = await resolveKitsuVideo({
      kitsuId: parsedVideoId.kitsuId,
      kitsuEpisode,
    });
    return {
      imdbId: kitsuVideo?.imdbId ?? null,
      catalogSeason: kitsuVideo?.catalogSeason ?? null,
      catalogEpisode: kitsuVideo?.catalogEpisode ?? null,
      kitsuEpisode,
      isEpisodeResolved: true,
    };
  } catch (error) {
    logger.warn({errorName: error.name}, 'Kitsu lookup failed.');
    return {...UNRESOLVED_VIDEO_EPISODE, kitsuEpisode};
  }
}
