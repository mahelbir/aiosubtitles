import {uniq} from 'es-toolkit';
import {EncryptJWT, jwtDecrypt} from 'jose';
import {JWTClaimValidationFailed} from 'jose/errors';
import {deriveSecretKey} from './crypto.js';

const KEY_MANAGEMENT_ALGORITHM = 'dir';
const CONTENT_ENCRYPTION_ALGORITHM = 'A256GCM';

const key = deriveSecretKey('jwt');

export function generateJwt({type, seconds, jti = null}, payload = {}) {
  const jwt = new EncryptJWT(payload)
    .setProtectedHeader({
      alg: KEY_MANAGEMENT_ALGORITHM,
      enc: CONTENT_ENCRYPTION_ALGORITHM,
    })
    .setAudience(type)
    .setExpirationTime(`${seconds}s`)
    .setIssuedAt();
  if (jti) {
    delete payload.jti;
    jwt.setJti(jti);
  }
  return jwt.encrypt(key);
}

export async function verifyJwt({
  token,
  type,
  jti = null,
  requiredClaims = [],
}) {
  const {payload} = await jwtDecrypt(token, key, {
    audience: type,
    keyManagementAlgorithms: [KEY_MANAGEMENT_ALGORITHM],
    contentEncryptionAlgorithms: [CONTENT_ENCRYPTION_ALGORITHM],
    requiredClaims: uniq(['exp', ...requiredClaims, ...(jti ? ['jti'] : [])]),
  });
  if (jti && payload.jti !== jti) {
    throw new JWTClaimValidationFailed(
      'unexpected "jti" claim value',
      payload,
      'jti',
      'check_failed',
    );
  }
  return payload;
}
