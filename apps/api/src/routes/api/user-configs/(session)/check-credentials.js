import {StatusCodes} from 'http-status-codes';
import {userConfigSchema} from '@repo/shared/schemas/user-config.js';
import {getSuccessEnvelopeSchema} from '../../../../lib/response.js';
import {getSubtitleSourceRegistry} from '../../../_subtitle-source-registry.js';
import {
  USER_CONFIG_API_ROUTE_CONFIG,
  checkCredentials,
  readMaskedUserConfig,
  readUserConfigWithCredentials,
  userConfigGoneRefusal,
  userConfigParamsSchema,
} from '../_user-config.js';

export default async function (fastify, opts) {
  const subtitleSourceRegistry = getSubtitleSourceRegistry(opts);

  fastify.post(
    '/:userConfigId/credential-checks',
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
      const {userConfigId} = request.params;
      const userConfig = await readUserConfigWithCredentials(userConfigId);
      reply.abort(userConfig ? null : userConfigGoneRefusal());
      await checkCredentials({
        subtitleSourceRegistry,
        userConfigId,
        credentials: userConfig.credentials,
        log: request.log,
      });
      const checked = await readMaskedUserConfig(request, userConfigId);
      reply.abort(checked ? null : userConfigGoneRefusal());
      return reply.success(checked, 'Credentials checked.');
    },
  );
}
