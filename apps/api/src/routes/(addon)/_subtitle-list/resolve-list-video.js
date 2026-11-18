import {isNil} from 'es-toolkit';
import {VideoType} from '@repo/shared/constants/video-type.js';
import {parseReleaseName} from '@repo/subtitle-core/release-name/parse-release-name.js';
import {createLogger} from '../../../lib/logger.js';
import {parseStremioVideoId} from '../../../lib/video-catalog/parse-video-id.js';
import {
  UNRESOLVED_VIDEO_EPISODE,
  resolveVideoEpisode,
} from '../../../lib/video-catalog/resolve-video-episode.js';
import {
  findVideoVariantBySize,
  recordVideoVariant,
} from '../../../lib/video-catalog/video-variants.js';
import {AddonVideoType} from '../_addon-video-type.js';

const logger = createLogger('subtitle-list');

export async function resolveListVideo({
  videoId,
  videoType,
  extras,
  videoCatalog,
  raceDeadline,
}) {
  const parsedVideoId = parseStremioVideoId(videoId);
  const searchVideoType = toSearchVideoType(
    videoType,
    parsedVideoId.catalogEpisode,
  );
  const [catalogVideo, playedVideo] = await Promise.all([
    resolveCatalogVideo({
      videoId,
      searchVideoType,
      videoCatalog,
      raceDeadline,
    }),
    resolvePlayedVideo({videoId, extras}),
  ]);
  const {imdbId, catalogSeason, catalogEpisode, catalogMeta} = catalogVideo;
  const {videoHash, videoSizeBytes, videoFilename} = playedVideo;
  return {
    videoContext: {
      videoId,
      catalogSeason,
      catalogEpisode,
      videoHash,
      videoRelease: videoFilename ? parseReleaseName(videoFilename) : null,
      catalogDurationMs: catalogMeta?.catalogDurationMs ?? null,
    },
    searchQuery: {
      videoId,
      videoType: searchVideoType,
      imdbId,
      kitsuId: parsedVideoId.kitsuId,
      catalogSeason,
      catalogEpisode,
      tvdbId: catalogMeta?.tvdbId ?? null,
      videoHash,
      videoSizeBytes,
      videoFilename,
    },
  };
}

function toSearchVideoType(videoType, catalogEpisode) {
  if (videoType !== AddonVideoType.ANIME) {
    return videoType;
  }
  return isNil(catalogEpisode) ? VideoType.MOVIE : VideoType.SERIES;
}

async function resolveCatalogVideo({
  videoId,
  searchVideoType,
  videoCatalog,
  raceDeadline,
}) {
  const catalogVideo = await raceDeadline(
    resolveVideoEpisode({
      videoId,
      resolveKitsuVideo: videoCatalog.resolveKitsuVideo,
    }),
    UNRESOLVED_VIDEO_EPISODE,
  );
  const catalogMeta = catalogVideo.imdbId
    ? await raceDeadline(
        videoCatalog.readCatalogMeta({
          videoType: searchVideoType,
          imdbId: catalogVideo.imdbId,
        }),
        null,
      )
    : null;
  return {
    imdbId: catalogVideo.imdbId,
    catalogSeason: catalogVideo.catalogSeason,
    catalogEpisode: catalogVideo.catalogEpisode,
    catalogMeta,
  };
}

async function resolvePlayedVideo({videoId, extras}) {
  const {videoHash, videoSizeBytes, videoFilename} = extras;
  if (videoHash !== null) {
    if (videoSizeBytes !== null) {
      recordVideoVariant({
        videoId,
        videoHash,
        videoSizeBytes,
        videoFilename,
      }).catch(error => {
        logger.warn({errorName: error.name}, 'Video variant write failed.');
      });
    }
    return extras;
  }
  if (videoSizeBytes === null) {
    return extras;
  }
  const videoVariant = await findVideoVariantBySize({videoId, videoSizeBytes});
  return {
    videoHash: videoVariant?.videoHash ?? null,
    videoSizeBytes,
    videoFilename: videoFilename ?? videoVariant?.videoFilename ?? null,
  };
}
