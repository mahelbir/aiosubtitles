import {
  getUserSchema,
  updateSelfSchema,
  updateUserSchema,
} from '@repo/shared/schemas/user.js';
import {isSelf} from '@repo/shared/lib/authorization.js';
import {sequelize} from '../../../db/index.js';
import {User} from '../../../db/models/user.js';
import {dbUtils} from '../../../db/utils.js';
import {hashPassword} from '../../../lib/crypto.js';
import {resolveRoles} from './_helper.js';

export default async function (fastify) {
  fastify.patch(
    '/:id',
    {schema: {params: getUserSchema, body: updateUserSchema}},
    async (request, reply) => {
      const parsed = isSelf(request.auth, {id: request.params.id})
        ? updateSelfSchema.safeParse(request.body)
        : {success: true, data: request.body};
      if (!parsed.success) {
        return reply.validationError(parsed.error);
      }

      const {roleIds, ...values} = parsed.data;
      if (values.password) {
        values.password = hashPassword(values.password);
      }

      await sequelize.transaction(async transaction => {
        const user = await User.withScope('withRoles')
          .withScope('visibleTo', request.userPolicy.visibility)
          .findOneLocked(
            {
              where: {id: request.params.id},
              attributes: ['id'],
              rejectOnEmpty: User.notFound,
            },
            transaction,
          );

        reply.abort(request.userPolicy.assertCanManage(user, {self: true}));

        let roles;
        if (roleIds) {
          const resolved = await resolveRoles(
            {roleIds, visibility: request.rolePolicy.visibility},
            transaction,
          );
          reply.abort(
            resolved.error ??
              request.rolePolicy.assertCanChangeAssignments(
                user.roles,
                resolved.roles,
              ),
          );
          roles = resolved.roles;
        }

        if (Object.keys(values).length > 0) {
          await user.update(values, {transaction});
        }
        if (roles) {
          await user.setRoles(dbUtils.getIds(roles), {transaction});
        }
      });

      return reply.success(null, 'Kullanıcı güncellendi.');
    },
  );
}
