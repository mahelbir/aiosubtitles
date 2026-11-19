import {z} from 'zod';
import {SubtitleFileExtension} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {Subtitle} from '../../db/models/subtitle.js';
import {SubtitleMessage} from '../../lib/stremio-row/stremio-row-enums.js';
import {
  downloadSubtitleFile,
  readStoredSubtitleFile,
} from '../../lib/subtitle-store/download-subtitle-file.js';
import {resolveVideoEpisode} from '../../lib/video-catalog/resolve-video-episode.js';
import {getSubtitleSourceRegistry} from '../_subtitle-source-registry.js';
import {getVideoCatalog} from '../_video-catalog.js';
import {readCachedUserConfig} from './_cached-user-config.js';
import {stremioVideoIdField} from './_stremio-video-id.js';
import {
  toSubtitleFileRouteConfig,
  writeSubtitleFile,
  writeSubtitleMessage,
} from './_subtitle-file-reply.js';

const URL_CODE_PATTERN = /^[\da-f]{64}$/;

const SUBTITLE_FILE_SCHEMA = {
  params: z.object({
    userConfigId: z.string(),
    videoId: stremioVideoIdField,
    urlCode: z.string().regex(URL_CODE_PATTERN),
    fileExtension: z.enum(SubtitleFileExtension.values),
  }),
};

export default async function (fastify, opts) {
  const subtitleSourceRegistry = getSubtitleSourceRegistry(opts);
  const videoCatalog = getVideoCatalog(opts);

  fastify.get(
    '/:userConfigId/subtitle-files/:videoId/:urlCode.:fileExtension',
    {
      schema: SUBTITLE_FILE_SCHEMA,
      config: toSubtitleFileRouteConfig(
        SubtitleMessage.SUBTITLE_DOWNLOAD_FAILED,
      ),
    },
    async (request, reply) => {
      const {userConfigId, videoId, urlCode, fileExtension} = request.params;
      const subtitle = await Subtitle.withScope('withStoredFile').findOne({
        where: {urlCode},
      });
      if (!subtitle) {
        return writeSubtitleMessage(reply, SubtitleMessage.SUBTITLE_NOT_FOUND);
      }
      const directFile = subtitle.isSitePack
        ? null
        : await readStoredSubtitleFile({subtitle, videoContext: {videoId}});
      const subtitleFile =
        directFile ??
        (await readEpisodeFile({
          subtitle,
          videoId,
          userConfigId,
          videoCatalog,
          subtitleSourceRegistry,
        }));
      if (subtitleFile.subtitleMessage) {
        return writeSubtitleMessage(reply, subtitleFile.subtitleMessage);
      }
      return writeSubtitleFile(reply, {
        parsedSubtitle: subtitleFile.parsedSubtitle,
        fileExtension,
      });
    },
  );
}

async function readEpisodeFile({
  subtitle,
  videoId,
  userConfigId,
  videoCatalog,
  subtitleSourceRegistry,
}) {
  const videoContext = {
    videoId,
    ...(await resolveVideoEpisode({
      videoId,
      resolveKitsuVideo: videoCatalog.resolveKitsuVideo,
    })),
  };
  const storedFile = subtitle.isSitePack
    ? await readStoredSubtitleFile({subtitle, videoContext})
    : null;
  return (
    storedFile ??
    downloadSubtitleFile({
      subtitle,
      videoContext,
      cachedUserConfig: await readCachedUserConfig(userConfigId),
      isBackground: false,
      subtitleSourceRegistry,
    })
  );
}
