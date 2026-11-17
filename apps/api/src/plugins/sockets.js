import fp from 'fastify-plugin';
import {Server} from 'socket.io';
import {config} from '../config/index.js';
import {GLOBAL_RATE_LIMIT_SCOPE, RateLimitPenalty} from '../lib/rate-limit.js';
import {socket} from '../sockets/index.js';
import {LocalNamespace} from '../sockets/local-namespace.js';
import {RemoteNamespace} from '../sockets/remote-namespace.js';
import {toRateLimitSubject} from './rate-limit.js';

const REVALIDATION_INTERVAL = 60 * 1000;

const HANDSHAKE_SCOPE = 'handshake';

const GLOBAL_HANDSHAKE_SCOPE = `${HANDSHAKE_SCOPE}${GLOBAL_RATE_LIMIT_SCOPE}`;

export const GLOBAL_HANDSHAKE_WINDOW = Object.freeze({
  max: 10,
  timeWindow: 60000,
  penalty: RateLimitPenalty.EXPONENTIAL,
});

export default fp(
  async function socketsPlugin(fastify, {basePath = config.apiBasePath} = {}) {
    const io = new Server(fastify.server, {
      path: `${basePath}/socket.io`,
      cors: {origin: config.corsOrigins, methods: ['GET', 'POST']},
    });
    const context = {
      io,
      log: fastify.log,
      handshakeBudget: toHandshakeBudget(fastify),
    };
    const locals = [];
    const remotes = [];
    const namespaces = Object.values(socket);

    for (const namespace of namespaces) {
      namespace.attach(context);
      if (namespace instanceof LocalNamespace) {
        locals.push(namespace);
      }
      if (namespace instanceof RemoteNamespace) {
        remotes.push(namespace);
      }
    }

    fastify.decorate('revalidateUserSockets', async (userIds = null) => {
      const results = await Promise.allSettled(
        locals.map(local => local.revalidate(userIds)),
      );
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          fastify.log.error(
            {
              err: result.reason,
              namespace: locals[index].constructor.namespace,
            },
            'Socket revalidation failed',
          );
        }
      });
    });

    let sweep = null;

    fastify.addHook('onReady', async () => {
      if (config.env !== 'test') {
        sweep = setInterval(
          () => fastify.revalidateUserSockets(),
          REVALIDATION_INTERVAL,
        );
      }
    });
    fastify.addHook('preClose', async () => {
      clearInterval(sweep);
      io.local.disconnectSockets(true);
      for (const remote of remotes) {
        remote.disconnect();
      }
    });
    fastify.addHook('onClose', async () => {
      await io.close();
    });

    fastify.log.info(
      {
        namespaces: namespaces.map(({constructor: {url, path, namespace}}) => ({
          url,
          path,
          namespace,
        })),
      },
      `Socket layer attached`,
    );
  },
  {name: 'sockets', dependencies: ['client-ip', 'rate-limit']},
);

function toHandshakeBudget(fastify) {
  const globalLimit = fastify.rateLimiter({
    ...GLOBAL_HANDSHAKE_WINDOW,
    scope: GLOBAL_HANDSHAKE_SCOPE,
  });
  return ({namespace, rateLimits}) => {
    const limits = [
      globalLimit,
      ...rateLimits.map(window =>
        fastify.rateLimiter({
          ...window,
          scope: `${HANDSHAKE_SCOPE}${namespace}`,
        }),
      ),
    ];
    return async function chargeHandshake({handshake}) {
      const subject = toRateLimitSubject(
        fastify.resolveClientIp({
          remoteAddress: handshake.address,
          headers: handshake.headers,
        }),
      );
      const results = await Promise.all(limits.map(limit => limit(subject)));
      const charged = limits.filter(
        (limit, index) => !results[index].isAllowed,
      );
      return {
        isExceeded: results.some(result => result.isExceeded),
        refund: () => Promise.all(charged.map(limit => limit.refund(subject))),
      };
    };
  };
}
