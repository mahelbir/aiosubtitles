import {
  generateAccessToken,
  generateRefreshToken,
} from '../../../lib/auth/token.js';

export async function issueTokens(userId) {
  const [{token: accessToken, ttl}, {token: refreshToken}] = await Promise.all([
    generateAccessToken(userId),
    generateRefreshToken(userId),
  ]);
  return {
    accessToken,
    refreshToken,
    expiresIn: ttl,
    auth: {
      id: userId,
    },
  };
}
