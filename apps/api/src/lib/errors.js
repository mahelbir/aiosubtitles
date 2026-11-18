import {StatusCodes} from 'http-status-codes';

export class DenialError extends Error {
  statusCode;

  errorCode;

  /** @param {{message: string, statusCode?: number, errorCode?: string|null}} denied */
  constructor(denied) {
    super(denied.message);
    this.name = 'DenialError';
    this.statusCode = denied.statusCode ?? StatusCodes.FORBIDDEN;
    this.errorCode = denied.errorCode ?? null;
  }
}

/**
 * @param {{message: string, statusCode?: number, errorCode?: string|null}|null} denied
 * @returns {void}
 */
export function throwIfDenied(denied) {
  if (denied) {
    throw new DenialError(denied);
  }
}

export const forbidden = (message = 'Permission denied.') => ({
  message,
  statusCode: StatusCodes.FORBIDDEN,
});

export const unauthorized = (
  message = 'Invalid session.',
  errorCode = null,
) => ({
  message,
  statusCode: StatusCodes.UNAUTHORIZED,
  errorCode,
});

export const conflict = (message = 'Record conflict.') => ({
  message,
  statusCode: StatusCodes.CONFLICT,
});

export const unprocessable = (
  message = 'The request could not be processed.',
) => ({
  message,
  statusCode: StatusCodes.UNPROCESSABLE_ENTITY,
});

export const tooManyRequests = (
  message = 'Too many requests. Try again later.',
) => ({
  message,
  statusCode: StatusCodes.TOO_MANY_REQUESTS,
});
