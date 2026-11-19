import {omitBy, pick} from 'es-toolkit';
import {StatusCodes} from 'http-status-codes';
import {ZodError} from 'zod';
import {CredentialStatus} from '@repo/shared/constants/credential.js';
import {
  CHANGED_ACCOUNT_SECRET_MESSAGE,
  updateUserConfigSchema,
  userConfigSchema,
} from '@repo/shared/schemas/user-config.js';
import {sequelize} from '../../../../db/index.js';
import {UserConfigCredential} from '../../../../db/models/user-config-credential.js';
import {UserConfig} from '../../../../db/models/user-config.js';
import {
  openCredentialSecret,
  sealCredentialSecret,
} from '../../../../lib/credential-secret.js';
import {getSuccessEnvelopeSchema} from '../../../../lib/response.js';
import {getSubtitleSourceRegistry} from '../../../_subtitle-source-registry.js';
import {
  USER_CONFIG_API_ROUTE_CONFIG,
  assertSubtitleSourcesRegistered,
  checkCredentials,
  getCredentialPositions,
  readMaskedUserConfig,
  toCredentialRow,
  userConfigGoneRefusal,
  userConfigParamsSchema,
} from '../_user-config.js';

const UNCHECKED_CREDENTIAL_VALUES = {
  credentialStatus: CredentialStatus.UNCHECKED,
  credentialCheckedAt: null,
  quotaRemainingCount: null,
  quotaResetAt: null,
};

export default async function (fastify, opts) {
  const subtitleSourceRegistry = getSubtitleSourceRegistry(opts);

  fastify.patch(
    '/:userConfigId',
    {
      config: USER_CONFIG_API_ROUTE_CONFIG,
      schema: {
        params: userConfigParamsSchema,
        body: updateUserConfigSchema,
        response: {
          [StatusCodes.OK]: getSuccessEnvelopeSchema(userConfigSchema),
        },
      },
    },
    async (request, reply) => {
      const {userConfigId} = request.params;
      const {credentials, ...preferences} = request.body;
      reply.abort(
        assertSubtitleSourcesRegistered(subtitleSourceRegistry, credentials),
      );
      const changedCredentials = await sequelize.transaction(
        async transaction => {
          const userConfig = await UserConfig.findOneLocked(
            {attributes: ['id'], where: {id: userConfigId}},
            transaction,
          );
          reply.abort(userConfig ? null : userConfigGoneRefusal());
          await userConfig.update(preferences, {transaction});
          return credentials
            ? replaceCredentials({userConfigId, credentials, transaction})
            : [];
        },
      );
      await checkCredentials({
        subtitleSourceRegistry,
        userConfigId,
        credentials: changedCredentials,
        log: request.log,
      });
      const updated = await readMaskedUserConfig(request, userConfigId);
      reply.abort(updated ? null : userConfigGoneRefusal());
      return reply.success(updated, 'Configuration saved.');
    },
  );
}

async function replaceCredentials({userConfigId, credentials, transaction}) {
  const storedCredentials = await UserConfigCredential.findAll({
    attributes: [
      'id',
      'userConfigId',
      'subtitleSource',
      'credentialKind',
      'credentialSecret',
    ],
    where: {userConfigId},
    transaction,
  });
  const storedById = new Map(
    storedCredentials.map(credential => [credential.id, credential]),
  );
  const keptIds = new Set(
    credentials.flatMap(({credentialId}) => credentialId ?? []),
  );
  const credentialPositions = getCredentialPositions(credentials);
  const newRows = [];
  const keptWrites = [];
  for (const [index, credential] of credentials.entries()) {
    const credentialPosition = credentialPositions[index];
    if (credential.credentialId === undefined) {
      newRows.push(
        toCredentialRow({userConfigId, credential, credentialPosition}),
      );
      continue;
    }
    const stored = storedById.get(credential.credentialId);
    if (
      stored?.subtitleSource !== credential.subtitleSource ||
      stored.credentialKind !== credential.credentialKind
    ) {
      throw UserConfigCredential.notFound;
    }
    keptWrites.push({stored, credential, credentialPosition, index});
  }
  const removedIds = storedCredentials
    .map(({id}) => id)
    .filter(id => !keptIds.has(id));
  if (removedIds.length > 0) {
    await UserConfigCredential.destroy({
      where: {userConfigId, id: removedIds},
      transaction,
    });
  }
  const [changedKept, created] = await Promise.all([
    Promise.all(
      keptWrites.map(write =>
        updateKeptCredential({...write, userConfigId, transaction}),
      ),
    ),
    UserConfigCredential.bulkCreate(newRows, {transaction, validate: true}),
  ]);
  return [...changedKept.filter(Boolean), ...created];
}

function mergeStoredCredentialSecret({
  userConfigId,
  stored,
  credentialSecret,
  index,
}) {
  const enteredCredentialSecret = omitBy(
    credentialSecret,
    credentialSecretPart => credentialSecretPart === '',
  );
  const blankCredentialSecretParts = Object.keys(credentialSecret).filter(
    credentialSecretPart => !(credentialSecretPart in enteredCredentialSecret),
  );
  if (blankCredentialSecretParts.length === 0) {
    return enteredCredentialSecret;
  }
  const storedCredentialSecret = openCredentialSecret({
    userConfigId,
    subtitleSource: stored.subtitleSource,
    sealedSecret: stored.credentialSecret,
  });
  if (storedCredentialSecret === null) {
    throw new ZodError(
      blankCredentialSecretParts.map(credentialSecretPart => ({
        code: 'custom',
        input: credentialSecret,
        message: CHANGED_ACCOUNT_SECRET_MESSAGE,
        path: ['credentials', index, 'credentialSecret', credentialSecretPart],
      })),
    );
  }
  return {
    ...pick(storedCredentialSecret, blankCredentialSecretParts),
    ...enteredCredentialSecret,
  };
}

async function updateKeptCredential({
  userConfigId,
  stored,
  credential,
  credentialPosition,
  index,
  transaction,
}) {
  const isSecretChanged = Object.values(credential.credentialSecret).some(
    credentialSecretPart => credentialSecretPart !== '',
  );
  await stored.update(
    {
      credentialPosition,
      ...(isSecretChanged && {
        ...UNCHECKED_CREDENTIAL_VALUES,
        credentialSecret: sealCredentialSecret({
          userConfigId,
          subtitleSource: credential.subtitleSource,
          credentialSecret: mergeStoredCredentialSecret({
            userConfigId,
            stored,
            credentialSecret: credential.credentialSecret,
            index,
          }),
        }),
      }),
    },
    {transaction},
  );
  return isSecretChanged ? stored : null;
}
