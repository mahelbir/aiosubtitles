import {StatusCodes} from 'http-status-codes';
import {
  changeUserConfigPasswordSchema,
  userConfigSessionSchema,
} from '@repo/shared/schemas/user-config.js';
import {sequelize} from '../../../../db/index.js';
import {UserConfig} from '../../../../db/models/user-config.js';
import {hashPassword} from '../../../../lib/crypto.js';
import {getSuccessEnvelopeSchema} from '../../../../lib/response.js';
import {readLockedPasswordHash} from '../../../../lib/user-config-password.js';
import {
  USER_CONFIG_API_ROUTE_CONFIG,
  createPasswordAttemptCheck,
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
        response: {
          [StatusCodes.OK]: getSuccessEnvelopeSchema(userConfigSessionSchema),
        },
      },
    },
    async (request, reply) => {
      const {userConfigId} = request.params;
      const {currentPassword, newPassword} = request.body;
      const passwordHash = await sequelize.transaction(async transaction => {
        reply.abort(
          await assertPasswordAttempt(request, {
            password: currentPassword,
            passwordHash: await readLockedPasswordHash(
              userConfigId,
              transaction,
            ),
          }),
        );
        const newPasswordHash = hashPassword(newPassword);
        await UserConfig.update(
          {passwordHash: newPasswordHash},
          {where: {id: userConfigId}, transaction},
        );
        return newPasswordHash;
      });
      return reply.success(
        {
          sessionToken: await fastify.issueUserConfigSession({
            userConfigId,
            passwordHash,
          }),
        },
        'Password changed.',
      );
    },
  );
}
