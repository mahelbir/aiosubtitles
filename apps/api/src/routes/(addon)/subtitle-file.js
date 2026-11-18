import {z} from 'zod';
import {getUuidField} from '@repo/shared/schemas/common.js';
import {
  SubtitleFileExtension,
  SubtitleMessage,
} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {VIDEO_ID_LENGTH_MAX} from '@repo/subtitle-core/stremio-row/build-subtitle-url.js';
import {Subtitle} from '../../db/models/subtitle.js';
import {
  downloadSubtitleFile,
  readStoredSubtitleFile,
} from '../../lib/subtitle-store/download-subtitle-file.js';
import {userConfigCache} from '../../lib/user-config-cache.js';
import {parseStremioVideoId} from '../../lib/video-catalog/parse-video-id.js';
import {getSubtitleSourceRegistry} from '../_subtitle-source-registry.js';
import {
  toSubtitleFileRouteConfig,
  writeSubtitleFile,
  writeSubtitleMessage,
} from './_subtitle-file-reply.js';

const STREMIO_VIDEO_ID_PATTERN = /^(tt\d+(:\d+){0,2}|kitsu:\d+(:\d+)?)$/;
const URL_CODE_PATTERN = /^[\da-f]{64}$/;

const userConfigIdField = getUuidField();

const SUBTITLE_FILE_SCHEMA = {
  params: z.object({
    userConfigId: z.string(),
    videoId: z
      .string()
      .max(VIDEO_ID_LENGTH_MAX)
      .regex(STREMIO_VIDEO_ID_PATTERN),
    urlCode: z.string().regex(URL_CODE_PATTERN),
    fileExtension: z.enum(SubtitleFileExtension.values),
  }),
};

export default async function (fastify, opts) {
  const subtitleSourceRegistry = getSubtitleSourceRegistry(opts);

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
      const {catalogSeason, catalogEpisode} = parseStremioVideoId(videoId);
      const videoContext = {videoId, catalogSeason, catalogEpisode};
      const storedFile = await readStoredSubtitleFile({subtitle, videoContext});
      const subtitleFile =
        storedFile ??
        (await downloadSubtitleFile({
          subtitle,
          videoContext,
          cachedUserConfig: await readCachedUserConfig(userConfigId),
          isBackground: false,
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

async function readCachedUserConfig(userConfigId) {
  const parsed = userConfigIdField.safeParse(userConfigId);
  return parsed.success ? userConfigCache.get(parsed.data) : null;
}
