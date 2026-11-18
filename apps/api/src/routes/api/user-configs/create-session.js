import {z} from 'zod';
import {StatusCodes} from 'http-status-codes';
import {
  createUserConfigSessionSchema,
  userConfigSessionSchema,
} from '@repo/shared/schemas/user-config.js';
import {isValidUuid} from '../../../lib/common.js';
import {getSuccessEnvelopeSchema} from '../../../lib/response.js';
import {readPasswordHash} from '../../../lib/user-config-password.js';
import {
  USER_CONFIG_API_ROUTE_CONFIG,
  createPasswordAttemptCheck,
} from './_user-config.js';

export default async function (fastify) {
  const assertPasswordAttempt = createPasswordAttemptCheck(fastify);

  fastify.post(
    '/:userConfigId/sessions',
    {
      config: USER_CONFIG_API_ROUTE_CONFIG,
      schema: {
        params: z.object({userConfigId: z.string()}),
        body: createUserConfigSessionSchema,
        response: {
          [StatusCodes.OK]: getSuccessEnvelopeSchema(userConfigSessionSchema),
        },
      },
    },
    async (request, reply) => {
      const userConfigId = request.params.userConfigId.toLowerCase();
      const passwordHash = isValidUuid(userConfigId)
        ? await readPasswordHash(userConfigId)
        : null;
      reply.abort(
        await assertPasswordAttempt(request, {
          password: request.body.password,
          passwordHash,
        }),
      );
      return reply.success(
        {
          sessionToken: await fastify.issueUserConfigSession({
            userConfigId,
            passwordHash,
          }),
        },
        'Session opened.',
      );
    },
  );
}
