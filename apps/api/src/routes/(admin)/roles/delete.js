import {getRoleSchema} from '@repo/shared/schemas/role.js';
import {sequelize} from '../../../db/index.js';
import {Role} from '../../../db/models/role.js';

export default async function (fastify) {
  fastify.delete(
    '/:id',
    {schema: {params: getRoleSchema}},
    async (request, reply) => {
      await sequelize.transaction(async transaction => {
        const role = await Role.withScope(
          'visibleTo',
          request.rolePolicy.visibility,
        ).findOneLocked(
          {
            where: {id: request.params.id},
            attributes: ['id', 'position', 'isLocked'],
          },
          transaction,
        );
        if (!role) {
          return;
        }

        reply.abort(request.rolePolicy.assertCanManage(role));

        await role.destroy({transaction});
      });

      return reply.success();
    },
  );
}
