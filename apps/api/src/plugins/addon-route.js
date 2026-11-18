import fp from 'fastify-plugin';
import {StatusCodes} from 'http-status-codes';

export default fp(
  async function addonRoutePlugin(fastify) {
    fastify.addHook('onRoute', route => {
      const {isAddonRoute, replyAddonFallback} = route.config ?? {};
      if (!isAddonRoute) {
        return;
      }
      if (!replyAddonFallback) {
        throw new Error('An addon route needs a replyAddonFallback.');
      }
      route.errorHandler = (err, request, reply) => {
        request.log.error({err}, 'Addon route failed');
        return replyAddonFallback(request, reply.code(StatusCodes.OK));
      };
    });
  },
  {name: 'addon-route'},
);
