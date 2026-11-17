import {StatusCodes} from 'http-status-codes';
import {changePasswordSchema} from '@repo/shared/schemas/user.js';
import {sequelize} from '../../../../db/index.js';
import {User} from '../../../../db/models/user.js';
import {hashPassword, verifyPassword} from '../../../../lib/crypto.js';
import {RateLimitKey} from '../../../../lib/rate-limit.js';

export default async function (fastify) {
  fastify.patch(
    '/password',
    {
      config: {
        rateLimits: [
          {
            max: 5,
            timeWindow: 60000,
            key: RateLimitKey.USER,
          },
        ],
      },
      schema: {body: changePasswordSchema},
    },
    async (request, reply) => {
      await sequelize.transaction(async transaction => {
        const user = await User.findOneLocked(
          {
            where: {id: request.auth.id},
            attributes: ['id', 'password'],
            rejectOnEmpty: User.notFound,
          },
          transaction,
        );

        reply.abort(
          !verifyPassword(request.body.currentPassword, user.password)
            ? {
                message: 'Mevcut parola hatalı.',
                statusCode: StatusCodes.FORBIDDEN,
              }
            : null,
        );

        await user.update(
          {password: hashPassword(request.body.password)},
          {transaction},
        );
      });

      return reply.success(null, 'Parola güncellendi.');
    },
  );
}
