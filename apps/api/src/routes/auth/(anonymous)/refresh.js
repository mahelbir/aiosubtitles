import {StatusCodes} from 'http-status-codes';
import {refreshSchema} from '@repo/shared/schemas/auth.js';
import {assertCanAuthenticate} from '../../../lib/auth/identity.js';
import {verifyRefreshToken} from '../../../lib/auth/token.js';
import {userCache} from '../../../lib/user-cache.js';
import {issueTokens} from './_helper.js';

export default async function (fastify) {
  fastify.post(
    '/refresh',
    {
      config: {rateLimits: [{max: 60, timeWindow: 60000}]},
      schema: {body: refreshSchema},
    },
    async (request, reply) => {
      let payload;
      try {
        payload = await verifyRefreshToken(request.body.refreshToken);
      } catch {
        return reply.error(null, 'Geçersiz token.', StatusCodes.UNAUTHORIZED);
      }
      const user = await userCache.get(payload.sub);
      reply.abort(assertCanAuthenticate(user));
      const {accessToken, expiresIn} = await issueTokens(user.id);
      return reply.success({
        accessToken,
        expiresIn,
      });
    },
  );
}
