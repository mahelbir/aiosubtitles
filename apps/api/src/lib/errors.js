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

export const forbidden = (message = 'İzin yok.') => ({
  message,
  statusCode: StatusCodes.FORBIDDEN,
});

export const unauthorized = (message = 'Geçersiz oturum.') => ({
  message,
  statusCode: StatusCodes.UNAUTHORIZED,
});

export const conflict = (message = 'Kayıt çakışması.') => ({
  message,
  statusCode: StatusCodes.CONFLICT,
});

export const unprocessable = (message = 'İstek işlenemedi.') => ({
  message,
  statusCode: StatusCodes.UNPROCESSABLE_ENTITY,
});

export const tooManyRequests = (
  message = 'Çok fazla istek gönderildi. Daha sonra tekrar deneyin.',
) => ({
  message,
  statusCode: StatusCodes.TOO_MANY_REQUESTS,
});
