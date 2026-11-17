import {describe, expect, it} from 'vitest';
import {EncryptJWT} from 'jose';
import {deriveSecretKey} from '../../src/lib/crypto.js';
import {generateJwt, verifyJwt} from '../../src/lib/jwt.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../../src/lib/auth/token.js';

const subject = '018f3a2b-6c4d-7e8f-9a0b-1c2d3e4f5061';

describe('access tokens', () => {
  it('carries the subject and nothing else the caller did not put there', async () => {
    const {token} = await generateAccessToken(subject);
    const payload = await verifyAccessToken(token);
    expect(payload.sub).toBe(subject);
    expect(payload).not.toHaveProperty('permissions');
    expect(payload).not.toHaveProperty('roles');
  });

  it('is encrypted, so the subject is not readable from the wire', async () => {
    const {token} = await generateAccessToken(subject);
    expect(token).not.toContain(subject);
    expect(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString(),
    ).not.toContain(subject);
  });

  it('reports the lifetime the client uses to schedule its refresh', async () => {
    const {ttl} = await generateAccessToken(subject);
    expect(ttl).toBeGreaterThan(0);
  });

  it('gets a distinct identifier per issue', async () => {
    const [first, second] = await Promise.all([
      generateAccessToken(subject),
      generateAccessToken(subject),
    ]);
    expect(first.jti).not.toBe(second.jti);
  });
});

describe('audience separation', () => {
  it('refuses a refresh token where an access token is required', async () => {
    const {token} = await generateRefreshToken(subject);
    await expect(verifyAccessToken(token)).rejects.toThrow();
  });

  it('refuses an access token where a refresh token is required', async () => {
    const {token} = await generateAccessToken(subject);
    await expect(verifyRefreshToken(token)).rejects.toThrow();
  });
});

describe('tampering', () => {
  it('refuses a token whose ciphertext was altered', async () => {
    const {token} = await generateAccessToken(subject);
    const parts = token.split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    await expect(verifyAccessToken(parts.join('.'))).rejects.toThrow();
  });

  it('refuses an empty or malformed token', async () => {
    await expect(verifyAccessToken('')).rejects.toThrow();
    await expect(verifyAccessToken('not.a.token')).rejects.toThrow();
  });

  it('refuses a token that has already expired', async () => {
    const expired = await generateJwt(
      {type: 'auth:access', seconds: -1, jti: 'expired'},
      {sub: subject},
    );
    await expect(verifyAccessToken(expired)).rejects.toMatchObject({
      code: 'ERR_JWT_EXPIRED',
    });
  });

  it('refuses a token missing its subject or identifier', async () => {
    const withoutIdentifier = await generateJwt(
      {type: 'auth:access', seconds: 60},
      {sub: subject},
    );
    const withoutSubject = await generateJwt({
      type: 'auth:access',
      seconds: 60,
      jti: 'no-subject',
    });
    await expect(verifyAccessToken(withoutIdentifier)).rejects.toMatchObject({
      code: 'ERR_JWT_CLAIM_VALIDATION_FAILED',
    });
    await expect(verifyAccessToken(withoutSubject)).rejects.toMatchObject({
      code: 'ERR_JWT_CLAIM_VALIDATION_FAILED',
    });
  });

  it('refuses a token sealed with another algorithm under the same key', async () => {
    const token = await new EncryptJWT({sub: subject})
      .setProtectedHeader({alg: 'A256KW', enc: 'A256GCM'})
      .setAudience('auth:access')
      .setExpirationTime('60s')
      .encrypt(deriveSecretKey('jwt'));
    await expect(verifyAccessToken(token)).rejects.toMatchObject({
      code: 'ERR_JOSE_ALG_NOT_ALLOWED',
    });
  });
});

describe('identifier binding', () => {
  it('accepts the token when the expected identifier matches', async () => {
    const {token, jti} = await generateAccessToken(subject);
    await expect(verifyAccessToken(token, jti)).resolves.toMatchObject({
      sub: subject,
    });
  });

  it('refuses the token when the expected identifier differs', async () => {
    const {token} = await generateAccessToken(subject);
    await expect(
      verifyAccessToken(token, 'someone-elses-jti'),
    ).rejects.toThrow();
  });

  it('refuses a token with no identifier when one is expected', async () => {
    const token = await generateJwt(
      {type: 'auth:access', seconds: 60},
      {sub: subject},
    );
    await expect(
      verifyJwt({token, type: 'auth:access', jti: 'x'}),
    ).rejects.toThrow();
  });
});
