import {getRoleSchema, updateRoleSchema} from '@repo/shared/schemas/role.js';
import {sequelize} from '../../../db/index.js';
import {Role} from '../../../db/models/role.js';
import {RolePermission} from '../../../db/models/role-permission.js';
import {unprocessable} from '../../../lib/errors.js';
import {allocateByPlacement, setPermissions} from './_helper.js';

export default async function (fastify) {
  fastify.patch(
    '/:id',
    {schema: {params: getRoleSchema, body: updateRoleSchema}},
    async (request, reply) => {
      const {permissions, anchorRoleId, placement, ...values} = request.body;
      const roleId = request.params.id;

      reply.abort(
        anchorRoleId === roleId
          ? unprocessable('Rol kendi konumuna göre taşınamaz.')
          : null,
      );

      await sequelize.transaction(async transaction => {
        const allocated = anchorRoleId
          ? await allocateByPlacement(
              {
                anchorRoleId,
                placement,
                excludeRoleId: roleId,
                maxPosition: request.rolePolicy.visibility.maxPosition,
                message: 'Konum rolü bulunamadı.',
              },
              transaction,
            )
          : null;

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

        const held = permissions
          ? (
              await RolePermission.findAll({
                attributes: ['permission'],
                where: {roleId: role.id},
                raw: true,
                transaction,
              })
            ).map(entry => entry.permission)
          : null;

        reply.abort(
          request.rolePolicy.assertCanManage(role, allocated?.roster) ??
            allocated?.error ??
            request.rolePolicy.assertCanSetPosition(
              allocated?.position,
              allocated?.roster,
            ) ??
            (held
              ? request.rolePolicy.assertCanChangeGrants(held, permissions)
              : null),
        );

        if (allocated) {
          values.position = allocated.position;
        }
        if (Object.keys(values).length > 0) {
          await role.update(values, {transaction});
        }
        if (held) {
          await setPermissions(
            {roleId: role.id, current: held, next: permissions},
            transaction,
          );
        }
      });

      await fastify.revalidateUserSockets();
      return reply.success(null, 'Rol güncellendi.');
    },
  );
}
