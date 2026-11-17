import crypto from 'node:crypto';
import {bcryptHash, bcryptVerify} from 'melperjs/node';
import {config} from '../config/index.js';

const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const CIPHER_ALGORITHM = 'aes-256-gcm';
const CIPHER_ENCODING = 'base64url';
const PLAIN_ENCODING = 'utf8';
const SECRET_DIGEST = 'sha256';

/** @typedef {'base64url'|'base64'|'hex'|null|{encode: function(Uint8Array): string, decode: function(string): Uint8Array}} CipherEncoding */

export function deriveSecretKey(purpose) {
  return Buffer.from(
    crypto.hkdfSync('sha256', config.secretKey, '', purpose, KEY_LENGTH),
  );
}

const cipherKey = deriveSecretKey('secret');

/**
 * @param {string|Uint8Array} plain
 * @param {{context?: string, encoding?: CipherEncoding}} [options]
 * @returns {string|Buffer}
 */
export function encryptSecret(
  plain,
  {context = '', encoding = CIPHER_ENCODING} = {},
) {
  const body =
    plain instanceof Uint8Array ? plain : Buffer.from(plain, PLAIN_ENCODING);
  const payload = Buffer.allocUnsafe(IV_LENGTH + TAG_LENGTH + body.length);
  crypto.randomFillSync(payload, 0, IV_LENGTH);
  const cipher = crypto.createCipheriv(
    CIPHER_ALGORITHM,
    cipherKey,
    payload.subarray(0, IV_LENGTH),
  );
  cipher.setAAD(Buffer.from(context, 'utf8'));
  let offset = IV_LENGTH + TAG_LENGTH;
  offset += cipher.update(body).copy(payload, offset);
  cipher.final().copy(payload, offset);
  cipher.getAuthTag().copy(payload, IV_LENGTH);
  return encodePayload(payload, encoding);
}

/**
 * @param {string|Uint8Array|null|undefined} encrypted
 * @param {{context?: string, encoding?: CipherEncoding, plainEncoding?: BufferEncoding|null}} [options]
 * @returns {string|Buffer|null}
 */
export function decryptSecret(
  encrypted,
  {
    context = '',
    encoding = CIPHER_ENCODING,
    plainEncoding = PLAIN_ENCODING,
  } = {},
) {
  try {
    const payload = decodePayload(encrypted, encoding);
    if (!payload || payload.length < IV_LENGTH + TAG_LENGTH) {
      return null;
    }
    const decipher = crypto.createDecipheriv(
      CIPHER_ALGORITHM,
      cipherKey,
      payload.subarray(0, IV_LENGTH),
    );
    decipher.setAAD(Buffer.from(context, 'utf8'));
    decipher.setAuthTag(payload.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH));
    const head = decipher.update(payload.subarray(IV_LENGTH + TAG_LENGTH));
    const tail = decipher.final();
    const plain = tail.length ? Buffer.concat([head, tail]) : head;
    return plainEncoding === null ? plain : plain.toString(plainEncoding);
  } catch {
    return null;
  }
}

/**
 * @param {Buffer} payload
 * @param {CipherEncoding} encoding
 * @returns {string|Buffer}
 */
function encodePayload(payload, encoding) {
  if (encoding === null) {
    return payload;
  }
  return typeof encoding === 'string'
    ? payload.toString(encoding)
    : encoding.encode(payload);
}

/**
 * @param {unknown} encrypted
 * @param {CipherEncoding} encoding
 * @returns {Uint8Array|null}
 */
function decodePayload(encrypted, encoding) {
  if (encoding === null) {
    return encrypted instanceof Uint8Array ? encrypted : null;
  }
  if (!encrypted || typeof encrypted !== 'string') {
    return null;
  }
  return typeof encoding === 'string'
    ? Buffer.from(encrypted, encoding)
    : encoding.decode(encrypted);
}

export function hashPassword(plain) {
  return bcryptHash(plain, {
    key: config.secretKey,
    strength: config.bcryptStrength,
  });
}

export function verifyPassword(plain, hash) {
  if (!hash) {
    return false;
  }
  return bcryptVerify(plain, hash, {key: config.secretKey});
}

export function isSameSecret(presented, expected) {
  if (typeof presented !== 'string' || typeof expected !== 'string') {
    return false;
  }
  return crypto.timingSafeEqual(
    crypto.createHash(SECRET_DIGEST).update(presented).digest(),
    crypto.createHash(SECRET_DIGEST).update(expected).digest(),
  );
}
