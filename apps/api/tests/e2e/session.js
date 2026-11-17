import {loginSchema} from '@repo/shared/schemas/auth.js';
import {User} from '../../src/db/models/user.js';
import {assertCanAuthenticate} from '../../src/lib/auth/identity.js';
import {issueTokens} from '../../src/routes/auth/(anonymous)/_helper.js';
import {E2E_SESSION_PATH} from './paths.js';

const sessionSchema = loginSchema.pick({email: true});

export async function sessionPlugin(fastify) {
  fastify.post(
    E2E_SESSION_PATH,
    {schema: {body: sessionSchema}},
    async (request, reply) => {
      const user = await User.findOne({
        where: {email: request.body.email},
        attributes: ['id', 'disabledAt'],
        rejectOnEmpty: User.notFound,
      });
      reply.abort(assertCanAuthenticate(user));
      return reply.success(await issueTokens(user.id));
    },
  );
}
