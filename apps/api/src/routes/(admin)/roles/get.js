import {getRoleSchema} from '@repo/shared/schemas/role.js';
import {Role} from '../../../db/models/role.js';
import {
  getCachedRoster,
  toVisibleRoster,
} from '../../../lib/auth/role-roster.js';
import {toRoleDetailJson} from './_helper.js';

export default async function (fastify) {
  fastify.get(
    '/:id',
    {schema: {params: getRoleSchema}},
    async (request, reply) => {
      const [role, roster] = await Promise.all([
        Role.withScope('withPermissions')
          .withScope('visibleTo', request.rolePolicy.visibility)
          .findOne({
            where: {id: request.params.id},
            attributes: ['id', 'slug', 'label', 'position', 'isLocked'],
            rejectOnEmpty: Role.notFound,
          }),
        getCachedRoster(),
      ]);
      return reply.success(
        toRoleDetailJson(
          role,
          request.rolePolicy,
          toVisibleRoster(roster, request.rolePolicy.visibility),
        ),
      );
    },
  );
}
