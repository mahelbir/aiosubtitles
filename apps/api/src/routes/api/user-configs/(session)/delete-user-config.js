import {StatusCodes} from 'http-status-codes';
import {deleteUserConfigSchema} from '@repo/shared/schemas/user-config.js';
import {sequelize} from '../../../../db/index.js';
import {UserConfig} from '../../../../db/models/user-config.js';
import {getSuccessEnvelopeSchema} from '../../../../lib/response.js';
import {readLockedPasswordHash} from '../../../../lib/user-config-password.js';
import {
  USER_CONFIG_API_ROUTE_CONFIG,
  createPasswordAttemptCheck,
  userConfigParamsSchema,
} from '../_user-config.js';

export default async function (fastify) {
  const assertPasswordAttempt = createPasswordAttemptCheck(fastify);

  fastify.delete(
    '/:userConfigId',
    {
      config: USER_CONFIG_API_ROUTE_CONFIG,
      schema: {
        params: userConfigParamsSchema,
        body: deleteUserConfigSchema,
        response: {[StatusCodes.OK]: getSuccessEnvelopeSchema()},
      },
    },
    async (request, reply) => {
      const {userConfigId} = request.params;
      await sequelize.transaction(async transaction => {
        const passwordHash = await readLockedPasswordHash(
          userConfigId,
          transaction,
        );
        if (passwordHash === null) {
          return;
        }
        reply.abort(
          await assertPasswordAttempt(request, {
            password: request.body.password,
            passwordHash,
          }),
        );
        await UserConfig.destroy({where: {id: userConfigId}, transaction});
      });
      return reply.success(null, 'Configuration deleted.');
    },
  );
}
