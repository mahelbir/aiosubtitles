import {isIP} from 'node:net';
import {Maxios} from '@mepkg/maxios';
import {pickBy} from 'es-toolkit';
import {castArray} from 'es-toolkit/compat';
import {StatusCodes} from 'http-status-codes';
import proxyAddr from 'proxy-addr';
import {
  ADDON_MANIFEST_VERSION,
  ADDON_NAME,
} from '@repo/shared/constants/app.js';
import {
  SourceCredentialError,
  SourceRateLimitError,
  SourceUnavailableError,
  SubtitleSourceError,
} from './subtitle-source-errors.js';

export const SUBTITLE_SOURCE_BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';

export const SUBTITLE_SOURCE_REQUEST_TIMEOUT = 15000;

export const SUBTITLE_SOURCE_RESPONSE_BYTES_MAX = 20971520;

export const SUBTITLE_SOURCE_RETRY_AFTER_DEFAULT = 60000;

export const SUBTITLE_SOURCE_RETRY_AFTER_MAX = 86400000;

const SUBTITLE_SOURCE_REDIRECTS_MAX = 5;
const SUBTITLE_SOURCE_DEFAULT_HEADERS = {
  'User-Agent': `${ADDON_NAME} v${ADDON_MANIFEST_VERSION}`,
  Accept: '*/*',
};
const CROSS_ORIGIN_HEADER_NAMES = new Set([
  'user-agent',
  'accept',
  'accept-language',
]);
const REDIRECT_STATUSES = new Set([
  StatusCodes.MOVED_PERMANENTLY,
  StatusCodes.MOVED_TEMPORARILY,
  StatusCodes.SEE_OTHER,
  StatusCodes.TEMPORARY_REDIRECT,
  StatusCodes.PERMANENT_REDIRECT,
]);
const CREDENTIAL_REJECTED_STATUSES = new Set([
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
]);
const REDIRECT_PROTOCOLS = new Set(['http:', 'https:']);
const BODY_KEEPING_REDIRECT_STATUSES = new Set([
  StatusCodes.TEMPORARY_REDIRECT,
  StatusCodes.PERMANENT_REDIRECT,
]);
const isPrivateAddress = proxyAddr.compile([
  'loopback',
  'linklocal',
  'uniquelocal',
  '0.0.0.0/8',
  '100.64.0.0/10',
  '::/128',
]);
const HOSTNAME_DECORATION_PATTERN = /^\[|\]$|\.$/g;
const DELAY_SECONDS_PATTERN = /^\d+$/;
const HTTP_DATE_PATTERN = /^[A-Za-z]{3}/;
const ERROR_CODE_PATTERN = /^[A-Za-z][\w-]{0,63}$/;
const CHARSET_PATTERN = /charset\s*=\s*"?([^";\s]+)/i;
const DEFAULT_CHARSET = 'utf-8';

const subtitleSourceClient = new Maxios({
  cookies: false,
  timeout: SUBTITLE_SOURCE_REQUEST_TIMEOUT,
  maxRedirects: 0,
  headers: SUBTITLE_SOURCE_DEFAULT_HEADERS,
});

function readHeader(headers, headerName) {
  return castArray(headers[headerName])[0] ?? null;
}

function hasHeaderName(headers, headerName) {
  return Object.keys(headers).some(
    name => name.toLowerCase() === headerName.toLowerCase(),
  );
}

function decodeText(bodyBytes, contentType) {
  const charset = contentType?.match(CHARSET_PATTERN)?.[1] ?? DEFAULT_CHARSET;
  try {
    return new TextDecoder(charset).decode(bodyBytes);
  } catch {
    return new TextDecoder(DEFAULT_CHARSET).decode(bodyBytes);
  }
}

function parseBody(bodyBytes, headers, {responseType, isEmptyBodyAllowed}) {
  if (responseType === 'bytes') {
    return bodyBytes;
  }
  const contentType = readHeader(headers, 'content-type');
  const bodyText = decodeText(bodyBytes, contentType);
  if (responseType === 'text') {
    return bodyText;
  }
  if (contentType?.toLowerCase().includes('text/html')) {
    throw new SyntaxError('HTML answer where JSON was asked.');
  }
  return isEmptyBodyAllowed && bodyText.trim() === ''
    ? null
    : JSON.parse(bodyText);
}

function isSameOrigin(leftUrl, rightUrl) {
  return new URL(leftUrl).origin === new URL(rightUrl).origin;
}

export function isPrivateSubtitleSourceUrl(siteUrl) {
  const hostAddress = new URL(siteUrl).hostname.replace(
    HOSTNAME_DECORATION_PATTERN,
    '',
  );
  if (isIP(hostAddress)) {
    return isPrivateAddress(hostAddress, 0);
  }
  return !hostAddress.includes('.');
}

function findRetryAfterMs(headers) {
  const nowMs = Date.now();
  return (
    parseRetryAfterMs(readHeader(headers, 'retry-after'), nowMs) ??
    parseRetryAfterMs(readHeader(headers, 'ratelimit-reset'), nowMs)
  );
}

function toStatusError({status, headers}, {subtitleSource, credentialId}) {
  const retryAfterMs = findRetryAfterMs(headers);
  if (
    status === StatusCodes.TOO_MANY_REQUESTS ||
    (status === StatusCodes.SERVICE_UNAVAILABLE && retryAfterMs !== null)
  ) {
    return new SourceRateLimitError({
      subtitleSource,
      retryAfterMs: retryAfterMs ?? SUBTITLE_SOURCE_RETRY_AFTER_DEFAULT,
      credentialId,
    });
  }
  if (CREDENTIAL_REJECTED_STATUSES.has(status) && credentialId !== null) {
    return new SourceCredentialError({subtitleSource, credentialId});
  }
  return new SourceUnavailableError({
    subtitleSource,
    cause: new Error(`Status ${status}.`),
  });
}

export function parseRetryAfterMs(headerValue, nowMs) {
  const delayText = headerValue?.trim();
  if (!delayText) {
    return null;
  }
  let retryAfterMs = null;
  if (DELAY_SECONDS_PATTERN.test(delayText)) {
    retryAfterMs = Number(delayText) * 1000;
  } else if (HTTP_DATE_PATTERN.test(delayText)) {
    retryAfterMs = Math.max(0, Date.parse(delayText) - nowMs);
  }
  if (retryAfterMs === null || Number.isNaN(retryAfterMs)) {
    return null;
  }
  return Math.min(retryAfterMs, SUBTITLE_SOURCE_RETRY_AFTER_MAX);
}

export function buildSubtitleSourceRequestOptions({
  url,
  method = 'GET',
  headers = {},
  body,
  signal,
}) {
  return {
    url,
    method,
    headers: {
      ...pickBy(
        SUBTITLE_SOURCE_DEFAULT_HEADERS,
        (_, headerName) => !hasHeaderName(headers, headerName),
      ),
      ...headers,
    },
    data: body,
    signal: AbortSignal.any(
      [signal, AbortSignal.timeout(SUBTITLE_SOURCE_REQUEST_TIMEOUT)].filter(
        Boolean,
      ),
    ),
    timeout: SUBTITLE_SOURCE_REQUEST_TIMEOUT,
    maxRedirects: 0,
    responseType: 'stream',
    validateStatus: null,
  };
}

export async function readCappedBody(
  readable,
  bytesMax = SUBTITLE_SOURCE_RESPONSE_BYTES_MAX,
) {
  const chunks = [];
  let byteCount = 0;
  try {
    for await (const chunk of readable) {
      byteCount += chunk.byteLength;
      if (byteCount > bytesMax) {
        throw new RangeError('Response body over the byte cap.');
      }
      chunks.push(chunk);
    }
  } finally {
    readable.destroy();
  }
  return Buffer.concat(chunks, byteCount);
}

export function shouldReadSubtitleSourceBody(status, acceptedStatuses) {
  return (
    acceptedStatuses.includes(status) ||
    (status >= StatusCodes.OK && status < StatusCodes.MULTIPLE_CHOICES)
  );
}

export function findRedirectLocation({status, headers}, acceptedStatuses) {
  if (!REDIRECT_STATUSES.has(status) || acceptedStatuses.includes(status)) {
    return null;
  }
  return readHeader(headers, 'location');
}

export function buildRedirectRequest(previousRequest, locationHeader, status) {
  const previousUrl = new URL(previousRequest.url);
  const redirectUrl = new URL(locationHeader, previousUrl);
  if (!REDIRECT_PROTOCOLS.has(redirectUrl.protocol)) {
    throw new TypeError('Redirect to an unsupported protocol.');
  }
  if (previousUrl.protocol === 'https:' && redirectUrl.protocol === 'http:') {
    throw new TypeError('Redirect from https to http.');
  }
  if (isPrivateSubtitleSourceUrl(redirectUrl)) {
    throw new TypeError('Redirect to a private host.');
  }
  const method = previousRequest.method.toUpperCase();
  const isGetSwitched =
    (status === StatusCodes.SEE_OTHER && method !== 'HEAD') ||
    ((status === StatusCodes.MOVED_PERMANENTLY ||
      status === StatusCodes.MOVED_TEMPORARILY) &&
      method === 'POST');
  const isSameOriginHop = isSameOrigin(redirectUrl, previousUrl);
  if (
    !isSameOriginHop &&
    BODY_KEEPING_REDIRECT_STATUSES.has(status) &&
    previousRequest.body !== undefined
  ) {
    throw new TypeError('Redirect would send the body to another origin.');
  }
  const headers = pickBy(previousRequest.headers, (_, headerName) => {
    const lowerHeaderName = headerName.toLowerCase();
    if (isGetSwitched && lowerHeaderName.startsWith('content-')) {
      return false;
    }
    return isSameOriginHop || CROSS_ORIGIN_HEADER_NAMES.has(lowerHeaderName);
  });
  return {
    url: redirectUrl.href,
    method: isGetSwitched ? 'GET' : method,
    headers,
    body: isGetSwitched ? undefined : previousRequest.body,
  };
}

export function buildRedirectHop(
  {subtitleSourceRequest, readOptions},
  {status, locationHeader},
) {
  try {
    const redirectRequest = buildRedirectRequest(
      subtitleSourceRequest,
      locationHeader,
      status,
    );
    return {
      subtitleSourceRequest: redirectRequest,
      readOptions: isSameOrigin(redirectRequest.url, subtitleSourceRequest.url)
        ? readOptions
        : {...readOptions, credentialId: null},
    };
  } catch (error) {
    throw toSubtitleSourceError(error, readOptions);
  }
}

export function readSubtitleSourceResponse(
  maxiosResponse,
  {
    subtitleSource,
    credentialId = null,
    acceptedStatuses = [],
    responseType = 'json',
  },
) {
  const {status, headers, data: bodyBytes} = maxiosResponse;
  try {
    if (shouldReadSubtitleSourceBody(status, acceptedStatuses)) {
      if (bodyBytes.byteLength > SUBTITLE_SOURCE_RESPONSE_BYTES_MAX) {
        throw new RangeError('Response body over the byte cap.');
      }
      return {
        status,
        headers,
        body: parseBody(bodyBytes, headers, {
          responseType,
          isEmptyBodyAllowed:
            status === StatusCodes.NO_CONTENT ||
            acceptedStatuses.includes(status),
        }),
      };
    }
    if (status === StatusCodes.NOT_FOUND) {
      return {status, headers, body: null};
    }
    throw toStatusError(maxiosResponse, {subtitleSource, credentialId});
  } catch (error) {
    throw toSubtitleSourceError(error, {subtitleSource});
  }
}

export function toSubtitleSourceError(error, {subtitleSource}) {
  if (error instanceof SubtitleSourceError) {
    return error;
  }
  const errorCode = [error?.code, error?.name].find(
    errorName =>
      typeof errorName === 'string' && ERROR_CODE_PATTERN.test(errorName),
  );
  return new SourceUnavailableError({
    subtitleSource,
    cause: new Error(errorCode ?? 'Unknown'),
  });
}

export async function readSubtitleSourceBodyBytes(
  {status, data},
  acceptedStatuses,
) {
  if (shouldReadSubtitleSourceBody(status, acceptedStatuses)) {
    return readCappedBody(data);
  }
  data.destroy();
  return Buffer.alloc(0);
}

async function sendSubtitleSourceRequest(
  subtitleSourceHop,
  {signal, redirectCount},
) {
  const {subtitleSourceRequest, readOptions} = subtitleSourceHop;
  const requestOptions = buildSubtitleSourceRequestOptions({
    ...subtitleSourceRequest,
    signal,
  });
  const maxiosResponse = await subtitleSourceClient.request(requestOptions);
  const locationHeader = findRedirectLocation(
    maxiosResponse,
    readOptions.acceptedStatuses,
  );
  if (
    locationHeader !== null &&
    redirectCount < SUBTITLE_SOURCE_REDIRECTS_MAX
  ) {
    maxiosResponse.data.destroy();
    return sendSubtitleSourceRequest(
      buildRedirectHop(subtitleSourceHop, {
        status: maxiosResponse.status,
        locationHeader,
      }),
      {signal: requestOptions.signal, redirectCount: redirectCount + 1},
    );
  }
  return readSubtitleSourceResponse(
    {
      ...maxiosResponse,
      data: await readSubtitleSourceBodyBytes(
        maxiosResponse,
        readOptions.acceptedStatuses,
      ),
    },
    readOptions,
  );
}

export async function requestSubtitleSource({
  subtitleSource,
  url,
  method = 'GET',
  headers = {},
  body,
  responseType = 'json',
  signal,
  credentialId = null,
  acceptedStatuses = [],
}) {
  try {
    return await sendSubtitleSourceRequest(
      {
        subtitleSourceRequest: {url, method, headers, body},
        readOptions: {
          subtitleSource,
          credentialId,
          acceptedStatuses,
          responseType,
        },
      },
      {signal, redirectCount: 0},
    );
  } catch (error) {
    throw toSubtitleSourceError(error, {subtitleSource});
  }
}
