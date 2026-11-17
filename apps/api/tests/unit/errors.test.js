import {describe, expect, it} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {tooManyRequests, unprocessable} from '../../src/lib/errors.js';

describe('tooManyRequests', () => {
  it('carries the status the envelope renders a refusal from', () => {
    expect(tooManyRequests().statusCode).toBe(StatusCodes.TOO_MANY_REQUESTS);
  });

  it('words the refusal in Turkish, so no transport says it twice', () => {
    expect(tooManyRequests().message).toBe(
      'Çok fazla istek gönderildi. Daha sonra tekrar deneyin.',
    );
  });

  it('lets a caller narrow the wording without inventing a status', () => {
    const denied = tooManyRequests('Çok fazla giriş denemesi.');
    expect(denied.message).toBe('Çok fazla giriş denemesi.');
    expect(denied.statusCode).toBe(StatusCodes.TOO_MANY_REQUESTS);
  });
});

describe('unprocessable', () => {
  it('refuses with the validation status and a Turkish default', () => {
    expect(unprocessable()).toEqual({
      message: 'İstek işlenemedi.',
      statusCode: StatusCodes.UNPROCESSABLE_ENTITY,
    });
  });

  it('carries the wording a caller names', () => {
    expect(unprocessable('Ayar gönderilemez.')).toEqual({
      message: 'Ayar gönderilemez.',
      statusCode: StatusCodes.UNPROCESSABLE_ENTITY,
    });
  });
});
