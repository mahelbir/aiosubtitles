import {z} from 'zod';
import {
  SubtitleMessage,
  SubtitleNotice,
} from '../../lib/stremio-row/stremio-row-enums.js';
import {
  toSubtitleFileRouteConfig,
  writeMessageText,
  writeSubtitleMessage,
} from './_subtitle-file-reply.js';

const SUBTITLE_NOTICE_SCHEMA = {
  params: z.object({
    userConfigId: z.string(),
    noticeName: z.string(),
  }),
};

export default async function (fastify) {
  fastify.get(
    '/:userConfigId/subtitle-notices/:noticeName.srt',
    {
      schema: SUBTITLE_NOTICE_SCHEMA,
      config: toSubtitleFileRouteConfig(SubtitleMessage.SUBTITLE_NOT_FOUND),
    },
    async (request, reply) => {
      const {noticeName} = request.params;
      if (!SubtitleNotice.has(noticeName)) {
        return writeSubtitleMessage(reply, SubtitleMessage.SUBTITLE_NOT_FOUND);
      }
      return writeMessageText(
        reply,
        SubtitleNotice.item(noticeName).noticeFileText,
      );
    },
  );
}
