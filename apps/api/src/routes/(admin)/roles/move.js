import {RoleDirection} from '@repo/shared/constants/role.js';
import {getRoleSchema, moveRoleSchema} from '@repo/shared/schemas/role.js';
import {sequelize} from '../../../db/index.js';
import {Role} from '../../../db/models/role.js';
import {allocateByMove} from './_helper.js';

export default async function (fastify) {
  fastify.patch(
    '/:id/move',
    {schema: {params: getRoleSchema, body: moveRoleSchema}},
    async (request, reply) => {
      const {direction} = request.body;
      const roleId = request.params.id;

      await sequelize.transaction(async transaction => {
        const {position, error, roster} = await allocateByMove(
          {
            roleId,
            direction,
            message:
              direction === RoleDirection.UP
                ? 'Rol zaten en üstte.'
                : 'Rol zaten en altta.',
          },
          transaction,
        );

        const role = await Role.withScope(
          'visibleTo',
          request.rolePolicy.visibility,
        ).findOneLocked(
          {
            where: {id: roleId},
            attributes: ['id', 'position', 'isLocked'],
            rejectOnEmpty: Role.notFound,
          },
          transaction,
        );

        reply.abort(
          request.rolePolicy.assertCanManage(role, roster) ??
            error ??
            request.rolePolicy.assertCanSetPosition(position, roster),
        );

        await role.update({position}, {transaction});
      });

      return reply.success();
    },
  );
}
