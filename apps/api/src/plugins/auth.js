import fp from 'fastify-plugin';
import {
  hasAnyPermission,
  hasPermission,
  hasPermissions,
} from '@repo/shared/lib/authorization.js';
import {
  getAuthContext,
  isExpectedTokenError,
  toBlockedDenial,
  toTokenDenial,
} from '../lib/auth/identity.js';
import {RolePolicy} from '../lib/auth/role-policy.js';
import {UserPolicy} from '../lib/auth/user-policy.js';
import {verifyAccessToken} from '../lib/auth/token.js';
import {forbidden, unauthorized} from '../lib/errors.js';
import {securityFromHooks} from '../lib/openapi.js';

export default fp(
  async function authPlugin(fastify) {
    fastify.decorateRequest('auth', null);
    fastify.decorateRequest('roleMap', null);
    fastify.decorateRequest('userPolicy', null);
    fastify.decorateRequest('rolePolicy', null);

    fastify.decorate(
      'authenticate',
      async function authenticate(request, reply) {
        const header = request.headers.authorization;
        if (!header?.startsWith('Bearer ')) {
          return reply.respond(unauthorized());
        }

        let payload;
        try {
          payload = await verifyAccessToken(header.slice(7));
        } catch (err) {
          // Unexpected failures (crypto/runtime) are logged; bad tokens are routine.
          if (!isExpectedTokenError(err)) {
            request.log.warn({err}, 'Token verification failed unexpectedly');
          }
          return reply.respond(toTokenDenial(err));
        }

        const context = await getAuthContext(payload.sub);
        if (!context) {
          return reply.respond(toBlockedDenial());
        }

        const {principal, roleMap} = context;
        request.auth = principal;
        request.roleMap = roleMap;
        request.userPolicy = new UserPolicy(principal, roleMap);
        request.rolePolicy = new RolePolicy(principal, roleMap);
      },
    );

    fastify.authenticate.openApiSecurity = [{bearerAuth: []}];

    const permissionGate = predicate => {
      const hook = async function (request, reply) {
        if (!request.auth) {
          await fastify.authenticate(request, reply);
        }
        if (reply.sent) {
          return;
        }
        if (!predicate(request.auth?.permissions)) {
          return reply.respond(forbidden());
        }
      };
      hook.openApiSecurity = fastify.authenticate.openApiSecurity;
      return hook;
    };

    fastify.decorate('requirePermission', required =>
      permissionGate(granted => hasPermission(granted, required)),
    );

    fastify.decorate('requirePermissions', required =>
      permissionGate(granted => hasPermissions(granted, required)),
    );

    fastify.decorate('requireAnyPermission', required =>
      permissionGate(granted => hasAnyPermission(granted, required)),
    );

    fastify.decorate('guardSubtree', function (guards) {
      for (const guard of guards) {
        this.addHook('onRequest', guard);
      }
      const added = securityFromHooks(guards);
      this.addHook('onRoute', route => {
        const requirements = [...(route.schema?.security ?? []), ...added];
        if (requirements.length > 0) {
          (route.schema ??= {}).security = [Object.assign({}, ...requirements)];
        }
      });
    });
  },
  {name: 'auth'},
);
