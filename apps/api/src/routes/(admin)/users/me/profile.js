import {StatusCodes} from 'http-status-codes';
import {updateProfileSchema} from '@repo/shared/schemas/user.js';
import {User} from '../../../../db/models/user.js';
import {userCache} from '../../../../lib/user-cache.js';

export default async function (fastify) {
  /* The profile is the user record, not the principal: it grows fields that authorization never carries. */
  fastify.get('/', async (request, reply) => {
    const user = await userCache.get(request.auth.id);
    if (!user) {
      return reply.error(null, User.notFoundMessage, StatusCodes.NOT_FOUND);
    }
    return reply.success({
      id: user.id,
      email: user.email,
    });
  });

  fastify.patch(
    '/',
    {schema: {body: updateProfileSchema}},
    async (request, reply) => {
      if (Object.keys(request.body).length === 0) {
        return reply.success(null, 'Değişiklik yok.');
      }
      const [count] = await User.update(request.body, {
        where: {id: request.auth.id},
      });
      if (count === 0) {
        return reply.error(null, User.notFoundMessage, StatusCodes.NOT_FOUND);
      }
      return reply.success(null, 'Profil güncellendi.');
    },
  );
}
