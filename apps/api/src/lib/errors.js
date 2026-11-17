import {StatusCodes} from 'http-status-codes';

export class DenialError extends Error {
  statusCode;

  /** @param {{message: string, statusCode?: number}} denied */
  constructor(denied) {
    super(denied.message);
    this.name = 'DenialError';
    this.statusCode = denied.statusCode ?? StatusCodes.FORBIDDEN;
  }
}

/**
 * @param {{message: string, statusCode?: number}|null} denied
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

export const unauthorized = (message = 'Invalid session.') => ({
  message,
  statusCode: StatusCodes.UNAUTHORIZED,
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
