import {Op} from 'sequelize';
import {listRolesSchema} from '@repo/shared/schemas/role.js';
import {foldIdentifier} from '../../../db/collation.js';
import {dbUtils} from '../../../db/utils.js';
import {Role} from '../../../db/models/role.js';
import {isValidUuid} from '../../../lib/common.js';
import {
  getCachedRoster,
  ROSTER_ORDER,
  toVisibleRoster,
} from '../../../lib/auth/role-roster.js';
import {toRoleJson} from './_helper.js';

export default async function (fastify) {
  fastify.get(
    '/',
    {schema: {querystring: listRolesSchema}},
    async (request, reply) => {
      const [result, roster] = await Promise.all([
        Role.withScope(
          'visibleTo',
          request.rolePolicy.visibility,
        ).paginateByOffset(request.query, {
          attributes: ['id', 'slug', 'label', 'position', 'isLocked'],
          filters: {
            search: search => {
              if (isValidUuid(search)) {
                return {id: search};
              }
              return {
                [Op.or]: [
                  {slug: foldIdentifier(search)},
                  {label: dbUtils.iLike(search)},
                ],
              };
            },
          },
          order: ROSTER_ORDER,
          raw: true,
        }),
        getCachedRoster(),
      ]);
      const visible = toVisibleRoster(roster, request.rolePolicy.visibility);
      result.items = result.items.map(role =>
        toRoleJson(role, request.rolePolicy, visible),
      );
      return reply.success(result);
    },
  );
}
