import {SettingsValidationError} from '@mahelbir/settings';
import {isPlainObject} from 'es-toolkit';
import {StatusCodes} from 'http-status-codes';

export default async function (fastify) {
  const {settings, settingsDefinition} = fastify;

  fastify.patch(
    '/',
    {schema: {body: settingsDefinition.updateSchema}},
    async (request, reply) => {
      if (!hasLeaf(request.body)) {
        return reply.error(
          null,
          'Hiçbir ayar güncellenmedi.',
          StatusCodes.BAD_REQUEST,
        );
      }

      try {
        await settings.patch(request.body);
      } catch (error) {
        if (!(error instanceof SettingsValidationError)) {
          throw error;
        }
        await settings.reload();
        return reply.validationError(error);
      }
      await settings.reload();
      return reply.success(await settings.getRaw(), 'Ayarlar güncellendi.');
    },
  );
}

function hasLeaf(patch) {
  return Object.values(patch).some(
    value => !isPlainObject(value) || hasLeaf(value),
  );
}
