import {config} from '../../config/index.js';
import {generateJwt, verifyJwt} from '../jwt.js';
import {uuidV7} from '../common.js';

const ACCESS_TOKEN_TYPE = 'auth:access';
const REFRESH_TOKEN_TYPE = 'auth:refresh';
const REQUIRED_CLAIMS = ['sub', 'jti'];

export async function generateAccessToken(sub) {
  const jti = uuidV7();
  const ttl = config.accessTokenTtl;
  const token = await generateJwt(
    {
      type: ACCESS_TOKEN_TYPE,
      seconds: ttl,
      jti,
    },
    {sub},
  );
  return {token, jti, ttl};
}

export async function generateRefreshToken(sub) {
  const jti = uuidV7();
  const token = await generateJwt(
    {
      type: REFRESH_TOKEN_TYPE,
      seconds: config.refreshTokenTtl,
      jti,
    },
    {sub},
  );
  return {token, jti};
}

export function verifyAccessToken(token, jti = null) {
  return verifyJwt({
    token,
    type: ACCESS_TOKEN_TYPE,
    jti,
    requiredClaims: REQUIRED_CLAIMS,
  });
}

export function verifyRefreshToken(token, jti = null) {
  return verifyJwt({
    token,
    type: REFRESH_TOKEN_TYPE,
    jti,
    requiredClaims: REQUIRED_CLAIMS,
  });
}
