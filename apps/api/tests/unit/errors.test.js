import {describe, expect, it} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {ErrorCode} from '@repo/shared/constants/error-code.js';
import {
  DenialError,
  tooManyRequests,
  unauthorized,
  unprocessable,
} from '../../src/lib/errors.js';
import {toFailure} from '../../src/lib/response.js';

describe('unauthorized', () => {
  it('refuses with the unauthorized status and no error code by default', () => {
    expect(unauthorized()).toEqual({
      message: 'Invalid session.',
      statusCode: StatusCodes.UNAUTHORIZED,
      errorCode: null,
    });
  });

  it('carries the error code a caller names, so a client tells refusals apart', () => {
    expect(
      unauthorized('Your session expired.', ErrorCode.SESSION_EXPIRED),
    ).toEqual({
      message: 'Your session expired.',
      statusCode: StatusCodes.UNAUTHORIZED,
      errorCode: ErrorCode.SESSION_EXPIRED,
    });
  });

  it('reaches the failure envelope through the denial it raises', () => {
    const denied = unauthorized(
      'Wrong password.',
      ErrorCode.PASSWORD_INCORRECT,
    );

    expect(toFailure(new DenialError(denied))).toEqual({
      statusCode: StatusCodes.UNAUTHORIZED,
      message: 'Wrong password.',
      data: {errorCode: ErrorCode.PASSWORD_INCORRECT},
    });
  });

  it('keeps a denial without a code free of error data', () => {
    expect(toFailure(new DenialError(unauthorized()))).toEqual({
      statusCode: StatusCodes.UNAUTHORIZED,
      message: 'Invalid session.',
      data: null,
    });
  });
});

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
