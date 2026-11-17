import Fastify from 'fastify';
import clientIpPlugin from '../../src/plugins/client-ip.js';
import rateLimitPlugin from '../../src/plugins/rate-limit.js';
import responsePlugin from '../../src/plugins/response.js';

const CALLER_HEADER = 'x-probe-caller';

const opened = [];

export async function buildProbe(routes) {
  let guarded = 0;
  const app = Fastify({logger: false});
  opened.push(app);

  await app.register(responsePlugin);
  await app.register(clientIpPlugin);
  await app.register(rateLimitPlugin);

  const guard = async () => {
    guarded += 1;
  };

  for (const {path, config, isGuarded, handler} of routes) {
    app.get(
      path,
      {
        ...(config && {config}),
        ...(isGuarded && {onRequest: [guard]}),
      },
      handler ? handler(app) : async (request, reply) => reply.success(),
    );
  }

  await app.ready();
  return {app, guarded: () => guarded};
}

export const asCaller = id => ({[CALLER_HEADER]: id});

export const callerOf = request => request.headers[CALLER_HEADER];

export async function closeProbes() {
  await Promise.all(opened.splice(0).map(app => app.close()));
}
