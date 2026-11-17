import {describe, expect, it} from 'vitest';
import {
  decryptSecret,
  deriveSecretKey,
  encryptSecret,
  hashPassword,
  isSameSecret,
  verifyPassword,
} from '../../src/lib/crypto.js';

const SEALED = {context: 'fixture:secret'};

const UPPER_HEX = {
  encode: bytes => Buffer.from(bytes).toString('hex').toUpperCase(),
  decode: text => Uint8Array.from(Buffer.from(text, 'hex')),
};

describe('hashPassword', () => {
  it('never stores the plaintext', () => {
    const hash = hashPassword('correct horse');
    expect(hash).not.toContain('correct horse');
  });

  it('salts, so the same password hashes differently every time', () => {
    expect(hashPassword('same')).not.toBe(hashPassword('same'));
  });

  it('accepts a password longer than bcrypt can read directly', () => {
    const long = 'a'.repeat(200);
    expect(verifyPassword(long, hashPassword(long))).toBe(true);
  });

  it('does not collapse two long passwords that share a prefix', () => {
    const base = 'a'.repeat(80);
    expect(verifyPassword(`${base}one`, hashPassword(`${base}two`))).toBe(
      false,
    );
  });
});

describe('verifyPassword', () => {
  it('accepts the right password and refuses the wrong one', () => {
    const hash = hashPassword('secret');
    expect(verifyPassword('secret', hash)).toBe(true);
    expect(verifyPassword('Secret', hash)).toBe(false);
    expect(verifyPassword('', hash)).toBe(false);
  });

  it('refuses without a stored hash, rather than burning a comparison', () => {
    expect(verifyPassword('secret', null)).toBe(false);
    expect(verifyPassword('secret', undefined)).toBe(false);
  });
});

describe('deriveSecretKey', () => {
  it('returns a 256-bit key', () => {
    expect(deriveSecretKey('a')).toHaveLength(32);
  });

  it('separates purposes, so one leaked key does not open another', () => {
    expect(deriveSecretKey('a').equals(deriveSecretKey('b'))).toBe(false);
    expect(deriveSecretKey('a').equals(deriveSecretKey('a'))).toBe(true);
  });
});

describe('encryptSecret', () => {
  it('round-trips through decryptSecret', () => {
    const plain = 'gizli değer — ünlü harfler ✓';
    expect(decryptSecret(encryptSecret(plain, SEALED), SEALED)).toBe(plain);
  });

  it('round-trips without options, sealed to no context', () => {
    expect(decryptSecret(encryptSecret('secret'))).toBe('secret');
  });

  it('never leaks the plaintext', () => {
    expect(encryptSecret('correct horse', SEALED)).not.toContain(
      'correct horse',
    );
  });

  it('is url-safe by default', () => {
    expect(encryptSecret('a'.repeat(200), SEALED)).toMatch(/^[\w-]+$/);
  });

  it('writes the payload in the Node encoding it is given', () => {
    const options = {...SEALED, encoding: 'hex'};
    const encrypted = encryptSecret('a'.repeat(200), options);
    expect(encrypted).toMatch(/^[0-9a-f]+$/);
    expect(decryptSecret(encrypted, options)).toBe('a'.repeat(200));
  });

  it('writes the payload through the coder it is given', () => {
    const options = {...SEALED, encoding: UPPER_HEX};
    const encrypted = encryptSecret('secret', options);
    expect(encrypted).toMatch(/^[0-9A-F]+$/);
    expect(decryptSecret(encrypted, options)).toBe('secret');
  });

  it('returns the raw payload when the encoding is null', () => {
    const options = {...SEALED, encoding: null};
    const payload = encryptSecret('secret', options);
    expect(Buffer.isBuffer(payload)).toBe(true);
    expect(payload).toHaveLength(12 + 16 + 'secret'.length);
    expect(decryptSecret(payload, options)).toBe('secret');
    expect(decryptSecret(Uint8Array.from(payload), options)).toBe('secret');
  });

  it('uses a fresh iv, so the same input encrypts differently every time', () => {
    expect(encryptSecret('same', SEALED)).not.toBe(
      encryptSecret('same', SEALED),
    );
  });

  it('round-trips an empty string and a buffer', () => {
    expect(decryptSecret(encryptSecret('', SEALED), SEALED)).toBe('');
    expect(
      decryptSecret(encryptSecret(Buffer.from('bytes'), SEALED), SEALED),
    ).toBe('bytes');
  });
});

describe('decryptSecret', () => {
  it.each([
    ['iv', 0],
    ['tag', 12],
    ['ciphertext', -1],
  ])('refuses a payload whose %s was tampered with', (_, offset) => {
    const payload = Buffer.from(encryptSecret('secret', SEALED), 'base64url');
    payload[offset < 0 ? payload.length + offset : offset] ^= 1;
    expect(decryptSecret(payload.toString('base64url'), SEALED)).toBeNull();
  });

  it('refuses a payload sealed for another context', () => {
    const encrypted = encryptSecret('secret', SEALED);
    expect(decryptSecret(encrypted, {context: 'another:field'})).toBeNull();
    expect(decryptSecret(encrypted)).toBeNull();
    expect(decryptSecret(encryptSecret('secret'), SEALED)).toBeNull();
  });

  it('returns the plaintext bytes untouched when the plain encoding is null', () => {
    const bytes = Buffer.from([0xff, 0x00, 0xfe]);
    const plain = decryptSecret(encryptSecret(bytes, SEALED), {
      ...SEALED,
      plainEncoding: null,
    });
    expect(Buffer.isBuffer(plain)).toBe(true);
    expect([...plain]).toEqual([0xff, 0x00, 0xfe]);
  });

  it('returns the plaintext in the plain encoding it is given', () => {
    const encrypted = encryptSecret(Buffer.from([0xca, 0xfe]), SEALED);
    expect(decryptSecret(encrypted, {...SEALED, plainEncoding: 'hex'})).toBe(
      'cafe',
    );
  });

  it('refuses a payload of the wrong kind for its encoding', () => {
    const text = encryptSecret('secret', SEALED);
    const bytes = encryptSecret('secret', {...SEALED, encoding: null});
    expect(decryptSecret(text, {...SEALED, encoding: null})).toBeNull();
    expect(decryptSecret(bytes, SEALED)).toBeNull();
    expect(
      decryptSecret(Buffer.alloc(0), {...SEALED, encoding: null}),
    ).toBeNull();
  });

  it('refuses a payload read in another encoding', () => {
    const encrypted = encryptSecret('secret', {...SEALED, encoding: 'hex'});
    expect(decryptSecret(encrypted, SEALED)).toBeNull();
  });

  it('refuses a payload its coder cannot decode, rather than throwing', () => {
    const encoding = {
      encode: UPPER_HEX.encode,
      decode: () => {
        throw new Error('Invalid character.');
      },
    };
    const encrypted = encryptSecret('secret', {...SEALED, encoding});
    expect(decryptSecret(encrypted, {...SEALED, encoding})).toBeNull();
  });

  it('refuses a truncated or absent payload', () => {
    expect(
      decryptSecret(encryptSecret('secret', SEALED).slice(0, 8), SEALED),
    ).toBeNull();
    expect(decryptSecret('not-a-payload', SEALED)).toBeNull();
    expect(decryptSecret('', SEALED)).toBeNull();
    expect(decryptSecret(null, SEALED)).toBeNull();
    expect(decryptSecret(undefined, SEALED)).toBeNull();
  });
});

describe('isSameSecret', () => {
  it('matches an identical secret', () => {
    expect(isSameSecret('service-key', 'service-key')).toBe(true);
  });

  it('refuses a different secret of any length', () => {
    expect(isSameSecret('service-kez', 'service-key')).toBe(false);
    expect(isSameSecret('short', 'service-key')).toBe(false);
  });

  it('refuses a value that is not a string', () => {
    expect(isSameSecret(undefined, 'service-key')).toBe(false);
    expect(isSameSecret(['service-key'], 'service-key')).toBe(false);
  });
});
