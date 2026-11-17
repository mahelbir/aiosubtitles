import {StatusCodes} from 'http-status-codes';
import {getSourceSchema} from '@repo/shared/schemas/socket.js';
import {RemoteNamespace} from '../../../../sockets/remote-namespace.js';
import {socket} from '../../../../sockets/index.js';

export default async function (fastify) {
  fastify.get(
    '/:source',
    {schema: {params: getSourceSchema}},
    async (request, reply) => {
      const remote = socket[request.params.source];
      if (!(remote instanceof RemoteNamespace)) {
        return reply.error(null, 'Kaynak bulunamadı.', StatusCodes.NOT_FOUND);
      }
      const {url, namespace, path, auth} = remote.constructor;
      return reply.success({
        url,
        namespace,
        path: path ?? null,
        auth: auth ?? null,
      });
    },
  );
}
