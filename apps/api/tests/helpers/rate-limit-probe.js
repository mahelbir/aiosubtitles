import Fastify from 'fastify';
import clientIpPlugin from '../../src/plugins/client-ip.js';
import rateLimitPlugin from '../../src/plugins/rate-limit.js';
import responsePlugin from '../../src/plugins/response.js';

const USER_HEADER = 'x-probe-user';

const opened = [];

export async function buildProbe(routes) {
  let guarded = 0;
  const app = Fastify({logger: false});
  opened.push(app);

  await app.register(responsePlugin);
  await app.register(clientIpPlugin);
  await app.register(rateLimitPlugin);
  app.decorateRequest('auth', null);

  const authenticate = async request => {
    guarded += 1;
    const id = request.headers[USER_HEADER];
    if (id) {
      request.auth = {id};
    }
  };

  for (const {path, config, authenticated, handler} of routes) {
    app.get(
      path,
      {
        ...(config && {config}),
        ...(authenticated && {onRequest: [authenticate]}),
      },
      handler ? handler(app) : async (request, reply) => reply.success(),
    );
  }

  await app.ready();
  return {app, guarded: () => guarded};
}

export const asUser = id => ({[USER_HEADER]: id});

export async function closeProbes() {
  await Promise.all(opened.splice(0).map(app => app.close()));
}
