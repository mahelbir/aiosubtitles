import {z} from 'zod';
import {StatusCodes} from 'http-status-codes';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {subtitleSourceOptionSchema} from '@repo/shared/schemas/user-config.js';
import {getSuccessEnvelopeSchema} from '../../lib/response.js';
import {getSubtitleSourceRegistry} from './_subtitle-source-registry.js';

const SUBTITLE_SOURCES_RATE_LIMITS = [{max: 30, timeWindow: 60000}];

export default async function (fastify, opts) {
  const {listSubtitleSourceClients} = getSubtitleSourceRegistry(opts);

  fastify.get(
    '/subtitle-sources',
    {
      config: {rateLimits: SUBTITLE_SOURCES_RATE_LIMITS},
      schema: {
        response: {
          [StatusCodes.OK]: getSuccessEnvelopeSchema(
            z.array(subtitleSourceOptionSchema),
          ),
        },
      },
    },
    async (request, reply) => {
      return reply.success(
        listSubtitleSourceClients().map(({subtitleSource}) =>
          toSubtitleSourceOption(subtitleSource),
        ),
      );
    },
  );
}

function toSubtitleSourceOption(subtitleSource) {
  const {credentialRequirement, credentialKinds, credentialLimit} =
    SubtitleSource.item(subtitleSource);
  return {
    subtitleSource,
    label: SubtitleSource.label(subtitleSource),
    credentialRequirement,
    credentialKinds,
    credentialLimit,
  };
}
