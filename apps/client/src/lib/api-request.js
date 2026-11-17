import {StatusCodes} from 'http-status-codes';

export class ApiError extends Error {
  constructor(message, {status = 0, errorCode = null, data = null} = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errorCode = errorCode;
    this.data = data;
  }

  get isTransient() {
    return (
      !this.status ||
      this.status >= StatusCodes.INTERNAL_SERVER_ERROR ||
      this.status === StatusCodes.REQUEST_TIMEOUT ||
      this.status === StatusCodes.TOO_MANY_REQUESTS
    );
  }
}

export async function requestApi(
  baseUrl,
  path,
  {method = 'GET', body, signal, envelope = false} = {},
) {
  const headers = {};
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      signal,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (cause) {
    throw new ApiError('Could not reach the server.', {data: cause});
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!payload || typeof payload.success !== 'boolean') {
    throw new ApiError('Invalid server response.', {status: response.status});
  }
  if (!payload.success) {
    throw new ApiError(payload.message, {
      status: response.status,
      errorCode: payload.data?.errorCode ?? null,
      data: payload.data,
    });
  }
  return envelope ? payload : payload.data;
}
