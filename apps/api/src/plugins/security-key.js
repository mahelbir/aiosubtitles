import fp from 'fastify-plugin';
import {config} from '../config/index.js';
import {isSameSecret} from '../lib/crypto.js';
import {unauthorized} from '../lib/errors.js';

export const SECURITY_KEY_HEADER = 'x-security-key';

function readSecurityKey(request) {
  return request.query?.securityKey ?? request.headers[SECURITY_KEY_HEADER];
}

export default fp(
  async function securityKeyPlugin(fastify) {
    fastify.decorate(
      'requireSecurityKey',
      async function requireSecurityKey(request, reply) {
        if (!isSameSecret(readSecurityKey(request), config.securityKey)) {
          return reply.respond(unauthorized('Erişim engellendi.'));
        }
      },
    );
    fastify.requireSecurityKey.openApiSecurity = [{securityKey: []}];
  },
  {name: 'security-key'},
);
