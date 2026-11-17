import {StatusCodes} from 'http-status-codes';
import {ZodError} from 'zod';
import {ErrorCode} from '@repo/shared/constants/error-code.js';
import {config} from '../config/index.js';

const DEFAULT_SUCCESS_MESSAGE = 'İşlem başarılı.';
const DEFAULT_ERROR_MESSAGE = 'İşlem başarısız.';
const INTERNAL_ERROR_MESSAGE = 'Sunucu hatası.';

export function successEnvelope(data = null, message = null) {
  return {
    success: true,
    message: message || DEFAULT_SUCCESS_MESSAGE,
    data,
  };
}

export function errorEnvelope(data = null, message = null) {
  return {
    success: false,
    message: message || DEFAULT_ERROR_MESSAGE,
    data: data ?? null,
  };
}

/** @typedef {{statusCode: number, message: string, data: object|null}} Failure */

const failureMappers = [];

/**
 * @param {(err: Error) => {message: string, statusCode: number, data?: object}|null} mapper
 * @returns {void}
 */
export function registerFailureMapper(mapper) {
  if (!failureMappers.includes(mapper)) {
    failureMappers.push(mapper);
  }
}

/**
 * @param {{issues: {path: (string|number)[], message: string}[]}} zodError
 * @returns {Failure}
 */
export function toValidationFailure(zodError) {
  const errors = zodError.issues.map(issue => ({
    field: issue.path.join('.'),
    message: issue.message,
  }));
  return {
    statusCode: StatusCodes.UNPROCESSABLE_ENTITY,
    message: errors[0]?.message,
    data: {errorCode: ErrorCode.VALIDATION_ERROR, errors},
  };
}

/**
 * @param {{statusCode?: number, message?: string, errorCode?: string}} err
 * @returns {Failure}
 */
export function toFailure(err) {
  if (err instanceof ZodError) {
    return toValidationFailure(err);
  }
  if (err?.statusCode && err.statusCode < StatusCodes.INTERNAL_SERVER_ERROR) {
    return {
      statusCode: err.statusCode,
      message: err.message,
      data: err.errorCode ? {errorCode: err.errorCode} : null,
    };
  }
  for (const mapper of failureMappers) {
    const mapped = mapper(err);
    if (mapped) {
      return {
        statusCode: mapped.statusCode,
        message: mapped.message,
        data: mapped.data ?? null,
      };
    }
  }
  return {
    statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    message: INTERNAL_ERROR_MESSAGE,
    data: {
      errorCode: ErrorCode.INTERNAL_ERROR,
      ...(config.isErrorDetailsExposed && {errorDescription: err?.message}),
    },
  };
}
