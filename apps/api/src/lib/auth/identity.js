import {getPermissionsOfRoles} from '@repo/shared/lib/authorization.js';
import {unauthorized} from '../errors.js';
import {userCache} from '../user-cache.js';
import {roleCache} from './role-cache.js';

const EXPECTED_TOKEN_ERRORS = new Set([
  'ERR_JWT_EXPIRED',
  'ERR_JWT_CLAIM_VALIDATION_FAILED',
  'ERR_JWE_DECRYPTION_FAILED',
  'ERR_JWE_INVALID',
  'ERR_JWS_INVALID',
]);

export function isExpectedTokenError(err) {
  return EXPECTED_TOKEN_ERRORS.has(err?.code);
}

export function toTokenDenial(err) {
  return unauthorized(
    err?.code === 'ERR_JWT_EXPIRED'
      ? 'Oturum süresi doldu.'
      : 'Geçersiz oturum.',
  );
}

export function toBlockedDenial() {
  return unauthorized('Erişim engellendi.');
}

export function toIdentitySubject(user, roleMap) {
  const roles = user.roles ?? [];
  return {
    id: user.id,
    roles,
    permissions: getPermissionsOfRoles(roles, roleMap),
  };
}

export function canAuthenticate(user) {
  return Boolean(user && !user.disabledAt);
}

export function assertCanAuthenticate(user) {
  return canAuthenticate(user) ? null : toBlockedDenial();
}

export async function getAuthContext(sub) {
  const [user, roleMap] = await Promise.all([
    userCache.get(sub),
    roleCache.get(),
  ]);
  if (!canAuthenticate(user)) {
    return null;
  }
  return {
    principal: {
      ...toIdentitySubject(user, roleMap),
      email: user.email,
    },
    roleMap,
  };
}
