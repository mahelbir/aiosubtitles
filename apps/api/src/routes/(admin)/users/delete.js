import {StatusCodes} from 'http-status-codes';
import {getUserSchema} from '@repo/shared/schemas/user.js';
import {isSelf} from '@repo/shared/lib/authorization.js';
import {sequelize} from '../../../db/index.js';
import {User} from '../../../db/models/user.js';

export default async function (fastify) {
  fastify.delete(
    '/:id',
    {schema: {params: getUserSchema}},
    async (request, reply) => {
      if (isSelf(request.auth, {id: request.params.id})) {
        return reply.error(
          null,
          'Kendi hesabınızı silemezsiniz.',
          StatusCodes.FORBIDDEN,
        );
      }

      await sequelize.transaction(async transaction => {
        const user = await User.withScope('withRoles')
          .withScope('visibleTo', request.userPolicy.visibility)
          .findOneLocked(
            {where: {id: request.params.id}, attributes: ['id']},
            transaction,
          );
        if (!user) {
          return;
        }
        reply.abort(request.userPolicy.assertCanManage(user));
        await user.destroy({transaction});
      });

      await fastify.revalidateUserSockets([request.params.id]);
      return reply.success();
    },
  );
}
