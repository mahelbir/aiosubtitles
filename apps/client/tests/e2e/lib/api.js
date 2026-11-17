import {escapeRegExp, trimEnd} from 'es-toolkit';
import {StatusCodes} from 'http-status-codes';
import {ErrorCode} from '@repo/shared/constants/error-code.js';
import {
  getE2eApiPort,
  getE2eClientOrigin,
} from '../../../../api/tests/e2e/ports.js';

export const FALLBACK_SUCCESS_MESSAGE = 'İşlem başarılı.';

export const REFRESH_PATH = '/auth/refresh';

export const FIXTURE_RECORD_PATH = '/fixtures/record';

export const NETWORK_FAILURE_STATUS = 0;

export function getApiUrl(path) {
  const url = new URL(process.env.NEXT_PUBLIC_API_URL);
  url.port = String(getE2eApiPort());
  return `${trimEnd(url.href, '/')}${path}`;
}

export function getSuccessEnvelope(
  data = null,
  message = FALLBACK_SUCCESS_MESSAGE,
) {
  return {success: true, message, data};
}

export function getErrorEnvelope(message, errorCode = null) {
  return {success: false, message, data: errorCode ? {errorCode} : null};
}

export function getValidationEnvelope(errors) {
  return {
    success: false,
    message: errors[0].message,
    data: {errorCode: ErrorCode.VALIDATION_ERROR, errors},
  };
}

export function getPrincipal(permissions) {
  return {id: 'u-1', email: 'ada@ornek.com', permissions, roles: []};
}

export function getApiFailure(status, message) {
  if (status === NETWORK_FAILURE_STATUS) {
    return {
      name: 'a network failure',
      status,
      response: {abort: 'failed'},
      error: {message: 'Sunucuya ulaşılamadı.', status},
    };
  }
  return {
    name: `a ${status}`,
    status,
    response: {status, json: getErrorEnvelope(message)},
    error: {message, status},
  };
}

export function getTransientFailures(message) {
  return [
    StatusCodes.SERVICE_UNAVAILABLE,
    StatusCodes.INTERNAL_SERVER_ERROR,
    StatusCodes.REQUEST_TIMEOUT,
    StatusCodes.TOO_MANY_REQUESTS,
    NETWORK_FAILURE_STATUS,
  ].map(status => getApiFailure(status, message));
}

export function getFailedRequestPattern(failures) {
  return getFailedLoadPattern(getApiUrl(''), failures);
}

export function getFailedPagePattern(failures) {
  return getFailedLoadPattern(getE2eClientOrigin(), failures);
}

function getFailedLoadPattern(origin, failures) {
  const alternatives = Object.entries(failures).flatMap(([path, statuses]) =>
    statuses.map(
      status =>
        `${getFailureLog(status)} \\(${escapeRegExp(origin)}${getPathPattern(path)}\\)`,
    ),
  );
  return new RegExp(`^Failed to load resource: (?:${alternatives.join('|')})$`);
}

function getPathPattern(path) {
  const segments = path
    .split('/')
    .map(segment =>
      segment.startsWith(':') ? '[^/?#)]+' : escapeRegExp(segment),
    );
  return `${segments.join('/')}(?:\\?[^)]*)?`;
}

export function getRefreshFailurePattern(path, refreshStatus) {
  return getFailedRequestPattern({
    [path]: [StatusCodes.UNAUTHORIZED],
    [REFRESH_PATH]: [refreshStatus],
  });
}

function getFailureLog(failure) {
  if (typeof failure === 'string') {
    return escapeRegExp(failure);
  }
  return failure === NETWORK_FAILURE_STATUS
    ? 'net::ERR_FAILED'
    : `the server responded with a status of ${failure} \\([^)]*\\)`;
}

export function respondInSequence(...responses) {
  let index = 0;
  return () => responses[Math.min(index++, responses.length - 1)];
}

export async function stubApi(page, url, respond) {
  const hits = [];
  await page.route(url, async route => {
    const request = route.request();
    const hit = {
      authorization: request.headers().authorization ?? null,
      url: new URL(request.url()),
      body: request.postDataJSON(),
    };
    hits.push(hit);
    const {abort, ...response} = await respond(hit);
    await (abort ? route.abort(abort) : route.fulfill(response));
  });
  return hits;
}
