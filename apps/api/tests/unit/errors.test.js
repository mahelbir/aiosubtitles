import {describe, expect, it} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {tooManyRequests, unprocessable} from '../../src/lib/errors.js';

describe('tooManyRequests', () => {
  it('carries the status the envelope renders a refusal from', () => {
    expect(tooManyRequests().statusCode).toBe(StatusCodes.TOO_MANY_REQUESTS);
  });

  it('words the refusal in English, so no transport says it twice', () => {
    expect(tooManyRequests().message).toBe(
      'Too many requests. Try again later.',
    );
  });

  it('lets a caller narrow the wording without inventing a status', () => {
    const denied = tooManyRequests('Too many sign-in attempts.');
    expect(denied.message).toBe('Too many sign-in attempts.');
    expect(denied.statusCode).toBe(StatusCodes.TOO_MANY_REQUESTS);
  });
});

describe('unprocessable', () => {
  it('refuses with the validation status and an English default', () => {
    expect(unprocessable()).toEqual({
      message: 'The request could not be processed.',
      statusCode: StatusCodes.UNPROCESSABLE_ENTITY,
    });
  });

  it('carries the wording a caller names', () => {
    expect(unprocessable('This setting cannot be sent.')).toEqual({
      message: 'This setting cannot be sent.',
      statusCode: StatusCodes.UNPROCESSABLE_ENTITY,
    });
  });
});
