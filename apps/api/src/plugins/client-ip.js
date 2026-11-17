import fp from 'fastify-plugin';
import {config} from '../config/index.js';
import {createClientIpResolver} from '../lib/ip.js';

export default fp(
  async function clientIpPlugin(
    fastify,
    {header = config.clientIpHeader, trustProxy = config.trustProxy} = {},
  ) {
    const resolveClientIp = createClientIpResolver({header, trustProxy});
    fastify.decorate('resolveClientIp', resolveClientIp);
    fastify.decorateRequest('clientIp', {
      getter() {
        return resolveClientIp({
          remoteAddress: this.socket.remoteAddress,
          headers: this.headers,
        });
      },
    });
  },
  {name: 'client-ip'},
);
