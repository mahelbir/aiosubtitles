import {Op} from 'sequelize';
import {listUsersSchema} from '@repo/shared/schemas/user.js';
import {foldIdentifier} from '../../../db/collation.js';
import {dbUtils} from '../../../db/utils.js';
import {User} from '../../../db/models/user.js';
import {UserRole} from '../../../db/models/user-role.js';
import {isValidUuid} from '../../../lib/common.js';
import {toUserJson} from './_helper.js';

export default async function (fastify) {
  fastify.get(
    '/',
    {schema: {querystring: listUsersSchema}},
    async (request, reply) => {
      const filters = {
        search: search => {
          if (isValidUuid(search)) {
            return {id: search};
          }
          return {[Op.or]: [{email: dbUtils.iLike(foldIdentifier(search))}]};
        },
        disabled: flags => {
          const state = dbUtils.nullState(flags);
          return state && {disabledAt: state};
        },
        roleId: roleIds =>
          dbUtils.relatedTo(
            {
              through: UserRole,
              foreignKey: 'userId',
              otherKey: 'roleId',
              values: roleIds,
            },
            User,
          ),
      };

      const result = await User.withScope('withRoles')
        .withScope('visibleTo', request.userPolicy.visibility)
        .paginateByOffset(request.query, {
          attributes: ['id', 'email', 'disabledAt'],
          filters,
        });
      result.items = result.items.map(user =>
        toUserJson(user, request.userPolicy),
      );

      return reply.success(result);
    },
  );
}
