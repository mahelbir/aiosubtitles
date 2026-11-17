import {getUserSchema} from '@repo/shared/schemas/user.js';
import {User} from '../../../db/models/user.js';
import {toUserJson} from './_helper.js';

export default async function (fastify) {
  fastify.get(
    '/:id',
    {schema: {params: getUserSchema}},
    async (request, reply) => {
      const user = await User.withScope('withRoles')
        .withScope('visibleTo', request.userPolicy.visibility)
        .findOne({
          where: {id: request.params.id},
          attributes: ['id', 'email', 'disabledAt'],
          rejectOnEmpty: User.notFound,
        });
      return reply.success(toUserJson(user, request.userPolicy));
    },
  );
}
