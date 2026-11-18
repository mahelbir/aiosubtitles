import {StatusCodes} from 'http-status-codes';
import {changeUserConfigPasswordSchema} from '@repo/shared/schemas/user-config.js';
import {sequelize} from '../../../../db/index.js';
import {UserConfig} from '../../../../db/models/user-config.js';
import {hashPassword} from '../../../../lib/crypto.js';
import {getSuccessEnvelopeSchema} from '../../../../lib/response.js';
import {
  USER_CONFIG_API_ROUTE_CONFIG,
  createPasswordAttemptCheck,
  readLockedPasswordHash,
  userConfigParamsSchema,
} from '../_user-config.js';

export default async function (fastify) {
  const assertPasswordAttempt = createPasswordAttemptCheck(fastify);

  fastify.put(
    '/:userConfigId/password',
    {
      config: USER_CONFIG_API_ROUTE_CONFIG,
      schema: {
        params: userConfigParamsSchema,
        body: changeUserConfigPasswordSchema,
        response: {[StatusCodes.OK]: getSuccessEnvelopeSchema()},
      },
    },
    async (request, reply) => {
      const {userConfigId} = request.params;
      const {currentPassword, newPassword} = request.body;
      await sequelize.transaction(async transaction => {
        reply.abort(
          await assertPasswordAttempt(request, {
            password: currentPassword,
            passwordHash: await readLockedPasswordHash(
              userConfigId,
              transaction,
            ),
          }),
        );
        await UserConfig.update(
          {passwordHash: hashPassword(newPassword)},
          {where: {id: userConfigId}, transaction},
        );
      });
      return reply.success(null, 'Password changed.');
    },
  );
}
