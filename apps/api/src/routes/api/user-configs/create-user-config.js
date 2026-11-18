import {StatusCodes} from 'http-status-codes';
import {
  createUserConfigSchema,
  createdUserConfigSchema,
} from '@repo/shared/schemas/user-config.js';
import {sequelize} from '../../../db/index.js';
import {UserConfigCredential} from '../../../db/models/user-config-credential.js';
import {UserConfig} from '../../../db/models/user-config.js';
import {uuidV4} from '../../../lib/common.js';
import {hashPassword} from '../../../lib/crypto.js';
import {getSuccessEnvelopeSchema} from '../../../lib/response.js';
import {getSubtitleSourceRegistry} from '../_subtitle-source-registry.js';
import {
  assertSubtitleSourcesAvailable,
  checkCredentials,
  getCredentialPositions,
  toCredentialRow,
  toManifestUrl,
} from './_user-config.js';

const CREATE_RATE_LIMITS = [{max: 10, timeWindow: 3600000}];

export default async function (fastify, opts) {
  const subtitleSourceRegistry = getSubtitleSourceRegistry(opts);

  fastify.post(
    '/',
    {
      config: {rateLimits: CREATE_RATE_LIMITS},
      schema: {
        body: createUserConfigSchema,
        response: {
          [StatusCodes.CREATED]: getSuccessEnvelopeSchema(
            createdUserConfigSchema,
          ),
        },
      },
    },
    async (request, reply) => {
      const {password, credentials, ...preferences} = request.body;
      reply.abort(
        assertSubtitleSourcesAvailable(subtitleSourceRegistry, credentials),
      );
      const userConfigId = uuidV4();
      const manifestUrl = createdUserConfigSchema.shape.manifestUrl.safeParse(
        toManifestUrl(request, userConfigId),
      );
      if (!manifestUrl.success) {
        return reply.validationError(manifestUrl.error);
      }
      const passwordHash = hashPassword(password);
      const userConfigCredentials = await sequelize.transaction(
        async transaction => {
          await UserConfig.create(
            {...preferences, id: userConfigId, passwordHash},
            {transaction},
          );
          const credentialPositions = getCredentialPositions(credentials);
          return UserConfigCredential.bulkCreate(
            credentials.map((credential, index) =>
              toCredentialRow({
                userConfigId,
                credential,
                credentialPosition: credentialPositions[index],
              }),
            ),
            {transaction, validate: true},
          );
        },
      );
      const [sessionToken] = await Promise.all([
        fastify.issueUserConfigSession({userConfigId, passwordHash}),
        checkCredentials({
          subtitleSourceRegistry,
          userConfigId,
          credentials: userConfigCredentials,
          log: request.log,
        }),
      ]);
      return reply.success(
        {userConfigId, manifestUrl: manifestUrl.data, sessionToken},
        'Configuration created.',
        StatusCodes.CREATED,
      );
    },
  );
}
