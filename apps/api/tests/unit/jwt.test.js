import {describe, expect, it} from 'vitest';
import {EncryptJWT} from 'jose';
import {deriveSecretKey} from '../../src/lib/crypto.js';
import {generateJwt, verifyJwt} from '../../src/lib/jwt.js';

const subject = '018f3a2b-6c4d-7e8f-9a0b-1c2d3e4f5061';
const TYPE = 'fixture:session';
const OTHER_TYPE = 'fixture:other';
const REQUIRED_CLAIMS = ['sub', 'jti'];

const issue = ({type = TYPE, seconds = 60, jti = 'issued'} = {}) =>
  generateJwt({type, seconds, jti}, {sub: subject});

const verify = (token, {type = TYPE, jti = null} = {}) =>
  verifyJwt({token, type, jti, requiredClaims: REQUIRED_CLAIMS});

describe('issued tokens', () => {
  it('carries the subject the caller put there', async () => {
    const payload = await verify(await issue());
    expect(payload.sub).toBe(subject);
  });

  it('is encrypted, so the subject is not readable from the wire', async () => {
    const token = await issue();
    expect(token).not.toContain(subject);
    expect(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString(),
    ).not.toContain(subject);
  });
});

describe('audience separation', () => {
  it('refuses a token issued for another type', async () => {
    const token = await issue({type: OTHER_TYPE});
    await expect(verify(token)).rejects.toThrow();
  });
});

describe('tampering', () => {
  it('refuses a token whose ciphertext was altered', async () => {
    const parts = (await issue()).split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    await expect(verify(parts.join('.'))).rejects.toThrow();
  });

  it('refuses an empty or malformed token', async () => {
    await expect(verify('')).rejects.toThrow();
    await expect(verify('not.a.token')).rejects.toThrow();
  });

  it('refuses a token that has already expired', async () => {
    const expired = await issue({seconds: -1, jti: 'expired'});
    await expect(verify(expired)).rejects.toMatchObject({
      code: 'ERR_JWT_EXPIRED',
    });
  });

  it('refuses a token missing its subject or identifier', async () => {
    const withoutIdentifier = await generateJwt(
      {type: TYPE, seconds: 60},
      {sub: subject},
    );
    const withoutSubject = await generateJwt({
      type: TYPE,
      seconds: 60,
      jti: 'no-subject',
    });
    await expect(verify(withoutIdentifier)).rejects.toMatchObject({
      code: 'ERR_JWT_CLAIM_VALIDATION_FAILED',
    });
    await expect(verify(withoutSubject)).rejects.toMatchObject({
      code: 'ERR_JWT_CLAIM_VALIDATION_FAILED',
    });
  });

  it('refuses a token sealed with another algorithm under the same key', async () => {
    const token = await new EncryptJWT({sub: subject})
      .setProtectedHeader({alg: 'A256KW', enc: 'A256GCM'})
      .setAudience(TYPE)
      .setExpirationTime('60s')
      .encrypt(deriveSecretKey('jwt'));
    await expect(verify(token)).rejects.toMatchObject({
      code: 'ERR_JOSE_ALG_NOT_ALLOWED',
    });
  });
});

describe('identifier binding', () => {
  it('accepts the token when the expected identifier matches', async () => {
    const token = await issue({jti: 'expected'});
    await expect(verify(token, {jti: 'expected'})).resolves.toMatchObject({
      sub: subject,
    });
  });

  it('refuses the token when the expected identifier differs', async () => {
    const token = await issue({jti: 'mine'});
    await expect(verify(token, {jti: 'someone-elses-jti'})).rejects.toThrow();
  });

  it('refuses a token with no identifier when one is expected', async () => {
    const token = await generateJwt({type: TYPE, seconds: 60}, {sub: subject});
    await expect(verifyJwt({token, type: TYPE, jti: 'x'})).rejects.toThrow();
  });
});
