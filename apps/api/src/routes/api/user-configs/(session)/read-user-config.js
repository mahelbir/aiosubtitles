import {StatusCodes} from 'http-status-codes';
import {userConfigSchema} from '@repo/shared/schemas/user-config.js';
import {getSuccessEnvelopeSchema} from '../../../../lib/response.js';
import {
  USER_CONFIG_API_ROUTE_CONFIG,
  readMaskedUserConfig,
  userConfigGoneRefusal,
  userConfigParamsSchema,
} from '../_user-config.js';

export default async function (fastify) {
  fastify.get(
    '/:userConfigId',
    {
      config: USER_CONFIG_API_ROUTE_CONFIG,
      schema: {
        params: userConfigParamsSchema,
        response: {
          [StatusCodes.OK]: getSuccessEnvelopeSchema(userConfigSchema),
        },
      },
    },
    async (request, reply) => {
      const userConfig = await readMaskedUserConfig(
        request,
        request.params.userConfigId,
      );
      reply.abort(userConfig ? null : userConfigGoneRefusal());
      return reply.success(userConfig);
    },
  );
}
