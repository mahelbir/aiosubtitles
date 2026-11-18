import {castArray} from 'es-toolkit/compat';
import fp from 'fastify-plugin';
import {securityFromHooks} from '../lib/openapi.js';

export default fp(
  async function guardPlugin(fastify) {
    fastify.decorate('guardSubtree', function (guards) {
      const added = securityFromHooks(guards);
      this.addHook('onRoute', route => {
        route.onRequest = [...castArray(route.onRequest ?? []), ...guards];
        const requirements = [...(route.schema?.security ?? []), ...added];
        if (requirements.length > 0) {
          (route.schema ??= {}).security = [Object.assign({}, ...requirements)];
        }
      });
    });
  },
  {name: 'guard'},
);
