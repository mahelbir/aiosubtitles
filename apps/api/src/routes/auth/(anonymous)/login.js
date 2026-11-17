import {StatusCodes} from 'http-status-codes';
import {loginSchema} from '@repo/shared/schemas/auth.js';
import {config} from '../../../config/index.js';
import {assertCanAuthenticate} from '../../../lib/auth/identity.js';
import {verifyPassword} from '../../../lib/crypto.js';
import {RateLimitPenalty} from '../../../lib/rate-limit.js';
import {User} from '../../../db/models/user.js';
import {issueTokens} from './_helper.js';

export default async function (fastify) {
  fastify.post(
    '/login',
    {
      config: {
        rateLimits: [
          {max: 1, timeWindow: 1000},
          {
            max: 10,
            timeWindow: 60000,
            penalty: RateLimitPenalty.EXPONENTIAL,
          },
        ],
      },
      schema: {body: loginSchema},
    },
    async (request, reply) => {
      if (!config.isPasswordLoginEnabled) {
        return reply.error(null, 'Giriş devre dışı.', StatusCodes.FORBIDDEN);
      }
      const {email, password} = request.body;
      const user = await User.findOne({
        where: {email},
        attributes: ['id', 'email', 'password', 'disabledAt'],
      });
      const isValid = verifyPassword(password, user?.password);
      if (!user || !isValid) {
        return reply.error(
          null,
          'E-posta veya parola hatalı.',
          StatusCodes.UNAUTHORIZED,
        );
      }
      reply.abort(assertCanAuthenticate(user));
      return reply.success(await issueTokens(user.id), 'Giriş başarılı.');
    },
  );
}
