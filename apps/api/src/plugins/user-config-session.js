import fp from 'fastify-plugin';
import {ErrorCode} from '@repo/shared/constants/error-code.js';
import {config} from '../config/index.js';
import {fingerprintPasswordHash, isSameSecret} from '../lib/crypto.js';
import {unauthorized} from '../lib/errors.js';
import {generateJwt, verifyJwt} from '../lib/jwt.js';
import {readPasswordHash} from '../lib/user-config-password.js';

export const USER_CONFIG_SESSION_TYPE = 'user-config-session';

const SESSION_REFUSAL = 'Your session expired. Enter your password again.';

const BEARER_PREFIX = 'Bearer ';

const REQUIRED_CLAIMS = ['sub', 'passwordFingerprint'];

const EXPECTED_TOKEN_ERRORS = new Set([
  'ERR_JWT_EXPIRED',
  'ERR_JWT_CLAIM_VALIDATION_FAILED',
  'ERR_JWE_DECRYPTION_FAILED',
  'ERR_JWE_INVALID',
  'ERR_JWS_INVALID',
  'ERR_JWT_INVALID',
]);

export default fp(
  async function userConfigSessionPlugin(fastify) {
    fastify.decorate('issueUserConfigSession', ({userConfigId, passwordHash}) =>
      generateJwt(
        {
          type: USER_CONFIG_SESSION_TYPE,
          seconds: config.userConfigSessionTtl,
        },
        {
          sub: userConfigId,
          passwordFingerprint: fingerprintPasswordHash(passwordHash),
        },
      ),
    );

    async function verifyUserConfigSession(request, reply) {
      const payload = await readSessionPayload(request);
      const isSessionValid =
        payload !== null &&
        payload.sub === request.params.userConfigId?.toLowerCase() &&
        (await isPasswordUnchanged(payload));
      if (!isSessionValid) {
        reply.abort(unauthorized(SESSION_REFUSAL, ErrorCode.SESSION_EXPIRED));
      }
    }
    verifyUserConfigSession.openApiSecurity = [{bearerAuth: []}];

    fastify.decorate('verifyUserConfigSession', verifyUserConfigSession);
  },
  {name: 'user-config-session'},
);

async function isPasswordUnchanged({sub, passwordFingerprint}) {
  const passwordHash = await readPasswordHash(sub);
  return (
    passwordHash === null ||
    isSameSecret(passwordFingerprint, fingerprintPasswordHash(passwordHash))
  );
}

async function readSessionPayload(request) {
  const header = request.headers.authorization;
  if (!header?.startsWith(BEARER_PREFIX)) {
    return null;
  }
  try {
    return await verifyJwt({
      token: header.slice(BEARER_PREFIX.length),
      type: USER_CONFIG_SESSION_TYPE,
      requiredClaims: REQUIRED_CLAIMS,
    });
  } catch (err) {
    if (!EXPECTED_TOKEN_ERRORS.has(err?.code)) {
      request.log.warn({err}, 'Session verification failed unexpectedly');
    }
    return null;
  }
}
