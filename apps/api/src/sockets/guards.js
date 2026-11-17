import {
  hasAnyPermission,
  hasPermission,
  hasPermissions,
} from '@repo/shared/lib/authorization.js';
import {config} from '../config/index.js';
import {
  getAuthContext,
  toBlockedDenial,
  toTokenDenial,
} from '../lib/auth/identity.js';
import {verifyAccessToken} from '../lib/auth/token.js';
import {isSameSecret} from '../lib/crypto.js';
import {DenialError, forbidden, unauthorized} from '../lib/errors.js';
import {toHandshakeError} from './response.js';

function toMiddleware(resolvePrincipal) {
  return async function (socket, next) {
    try {
      socket.data.auth = await resolvePrincipal(socket);
      next();
    } catch (err) {
      next(toHandshakeError(err));
    }
  };
}

async function userPrincipal(socket) {
  if (socket.data.auth?.kind === 'user') {
    return socket.data.auth;
  }
  let payload;
  try {
    payload = await verifyAccessToken(socket.handshake.auth?.token ?? '');
  } catch (err) {
    throw new DenialError(toTokenDenial(err));
  }
  const context = await getAuthContext(payload.sub);
  if (!context) {
    throw new DenialError(toBlockedDenial());
  }
  return {kind: 'user', ...context.principal, expiresAt: payload.exp * 1000};
}

async function permissionPrincipal(socket, predicate) {
  const principal = await userPrincipal(socket);
  if (!predicate(principal.permissions)) {
    throw new DenialError(forbidden());
  }
  return principal;
}

async function servicePrincipal(socket) {
  if (!isSameSecret(socket.handshake.auth?.securityKey, config.securityKey)) {
    throw new DenialError(unauthorized());
  }
  return {kind: 'service'};
}

export function runSocketMiddleware(middleware, socket) {
  return new Promise(resolve => {
    Promise.resolve(middleware(socket, resolve)).catch(resolve);
  });
}

export function requireAnySocketGuard(guards) {
  return async function (socket, next) {
    let denied;
    for (const guard of guards) {
      denied = await runSocketMiddleware(guard, socket);
      if (!denied) {
        return next();
      }
    }
    next(denied ?? toHandshakeError(unauthorized()));
  };
}

export const socketGuard = {
  authenticate: toMiddleware(userPrincipal),

  requireSecurityKey: toMiddleware(servicePrincipal),

  requirePermission(required) {
    return toMiddleware(socket =>
      permissionPrincipal(socket, granted => hasPermission(granted, required)),
    );
  },

  requirePermissions(required) {
    return toMiddleware(socket =>
      permissionPrincipal(socket, granted => hasPermissions(granted, required)),
    );
  },

  requireAnyPermission(required) {
    return toMiddleware(socket =>
      permissionPrincipal(socket, granted =>
        hasAnyPermission(granted, required),
      ),
    );
  },
};
