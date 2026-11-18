import {Readable} from 'node:stream';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {Maxios, MaxiosRequestError, MaxiosResponseError} from '@mepkg/maxios';
import {
  SourceCredentialError,
  SourceRateLimitError,
  SourceUnavailableError,
} from '../../../src/lib/subtitle-sources/subtitle-source-errors.js';
import {
  SUBTITLE_SOURCE_BROWSER_USER_AGENT,
  SUBTITLE_SOURCE_REQUEST_TIMEOUT,
  SUBTITLE_SOURCE_RESPONSE_BYTES_MAX,
  SUBTITLE_SOURCE_RETRY_AFTER_DEFAULT,
  SUBTITLE_SOURCE_RETRY_AFTER_MAX,
  buildRedirectHop,
  buildRedirectRequest,
  buildSubtitleSourceRequestOptions,
  findRedirectLocation,
  isPrivateSubtitleSourceUrl,
  isSubtitleSourceFileUrl,
  isSubtitleSourceJsonResponse,
  parseRetryAfterMs,
  readCappedBody,
  readSubtitleSourceResponse,
  readSubtitleSourceBodyBytes,
  readSubtitleSourceContentType,
  readSubtitleSourceFileName,
  readSubtitleSourceJson,
  shouldReadSubtitleSourceBody,
  toSubtitleSourceError,
  toSubtitleSourceStatusError,
} from '../../../src/lib/subtitle-sources/subtitle-source-request.js';
import {toErrorText} from '../../helpers/caught-error.js';

const RESPONSE_BYTES_MAX = 20971520;
const RETRY_AFTER_DEFAULT_MS = 60000;
const RETRY_AFTER_MAX_MS = 86400000;
const SOURCE_URL = 'https://source.test/list';
const subtitleSourceClientStandIn = new Maxios({
  cookies: false,
  headers: {'User-Agent': 'AIOSubtitles v1.0.0', Accept: '*/*'},
});
const SECRET = 'SECRET-KEY-1';
const MAXIOS_REQUEST_OPTION_KEYS = [
  'url',
  'method',
  'baseURL',
  'headers',
  'params',
  'data',
  'cookies',
  'signal',
  'timeout',
  'httpVersion',
  'proxy',
  'maxRedirects',
  'responseType',
  'validateStatus',
];

function makeMaxiosResponse({status = 200, headers = {}, body = ''} = {}) {
  return {
    status,
    headers,
    data: Buffer.isBuffer(body) ? body : Buffer.from(body),
    finalUrl: SOURCE_URL,
  };
}

function makeJsonResponse(payload, {status = 200, headers = {}} = {}) {
  return makeMaxiosResponse({
    status,
    headers: {'content-type': 'application/json', ...headers},
    body: JSON.stringify(payload),
  });
}

function catchReadError(maxiosResponse, readOptions) {
  try {
    readSubtitleSourceResponse(maxiosResponse, {
      subtitleSource: 'thesubtitledb',
      ...readOptions,
    });
  } catch (error) {
    return error;
  }
  return null;
}

function findHeaderValues(headers, headerName) {
  return Object.entries(headers)
    .filter(([name]) => name.toLowerCase() === headerName)
    .map(([, headerValue]) => headerValue);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('subtitle source request limits', () => {
  it('stops a request after 15 seconds', () => {
    expect(SUBTITLE_SOURCE_REQUEST_TIMEOUT).toBe(15000);
  });

  it('caps a response body at 20 MiB', () => {
    expect(SUBTITLE_SOURCE_RESPONSE_BYTES_MAX).toBe(RESPONSE_BYTES_MAX);
  });

  it('waits a minute when a rate limit names no wait', () => {
    expect(SUBTITLE_SOURCE_RETRY_AFTER_DEFAULT).toBe(60000);
  });
});

describe('parseRetryAfterMs', () => {
  it('reads Retry-After in seconds and as an HTTP date', () => {
    expect(parseRetryAfterMs('120', 0)).toBe(120000);
    expect(
      parseRetryAfterMs(
        'Wed, 18 Nov 2026 10:00:30 GMT',
        Date.parse('2026-11-18T10:00:00Z'),
      ),
    ).toBe(30000);
    expect(parseRetryAfterMs('soon', 0)).toBeNull();
  });

  it('answers null when there is no header', () => {
    expect(parseRetryAfterMs(null, 0)).toBeNull();
    expect(parseRetryAfterMs('', 0)).toBeNull();
  });

  it('never answers below zero for a date already passed', () => {
    expect(
      parseRetryAfterMs(
        'Wed, 18 Nov 2026 10:00:00 GMT',
        Date.parse('2026-11-18T10:05:00Z'),
      ),
    ).toBe(0);
  });

  it('reads zero seconds as no wait', () => {
    expect(parseRetryAfterMs('0', 0)).toBe(0);
  });

  it('caps a wait at one day', () => {
    expect(SUBTITLE_SOURCE_RETRY_AFTER_MAX).toBe(RETRY_AFTER_MAX_MS);
  });

  it.each([
    ['a huge number of seconds', '99999999'],
    ['a number too large to hold', '9'.repeat(400)],
    ['a far-future date', 'Fri, 31 Dec 9999 23:59:59 GMT'],
  ])('clamps %s to the one-day cap', (_, headerValue) => {
    expect(parseRetryAfterMs(headerValue, 0)).toBe(RETRY_AFTER_MAX_MS);
  });

  it.each([
    ['Infinity', 'Infinity'],
    ['a negative number', '-5'],
    ['a fraction', '1.5'],
    ['a signed number', '+5'],
    ['a date that is not an HTTP date', '2026-11-18T10:00:30Z'],
  ])('reads %s as no usable wait', (_, headerValue) => {
    expect(parseRetryAfterMs(headerValue, 0)).toBeNull();
  });
});

describe('buildSubtitleSourceRequestOptions', () => {
  it('passes only options Maxios knows', () => {
    const requestOptions = buildSubtitleSourceRequestOptions({
      url: SOURCE_URL,
      method: 'POST',
      headers: {'X-Fixture': 'yes'},
      body: {query: 'fixture'},
      signal: new AbortController().signal,
    });
    expect(Object.keys(requestOptions ?? {nothing: true})).toSatisfy(
      optionKeys =>
        optionKeys.every(optionKey =>
          MAXIOS_REQUEST_OPTION_KEYS.includes(optionKey),
        ),
    );
  });

  it('sends the AIOSubtitles user agent and accepts any type', () => {
    expect(buildSubtitleSourceRequestOptions({url: SOURCE_URL})).toMatchObject({
      url: SOURCE_URL,
      method: 'GET',
      headers: {'User-Agent': 'AIOSubtitles v1.0.0', Accept: '*/*'},
    });
  });

  it('keeps a user agent and accept the caller sets, in any case, once', async () => {
    const builtRequest = await subtitleSourceClientStandIn.buildRequest(
      buildSubtitleSourceRequestOptions({
        url: SOURCE_URL,
        headers: {'user-agent': 'Fixture Agent', accept: 'application/json'},
      }),
    );
    expect(findHeaderValues(builtRequest.headers, 'user-agent')).toEqual([
      'Fixture Agent',
    ]);
    expect(findHeaderValues(builtRequest.headers, 'accept')).toEqual([
      'application/json',
    ]);
  });

  it('lets a client send the shared browser user agent instead of ours', async () => {
    expect(SUBTITLE_SOURCE_BROWSER_USER_AGENT).toEqual(expect.any(String));
    expect(SUBTITLE_SOURCE_BROWSER_USER_AGENT).not.toBe('');
    expect(SUBTITLE_SOURCE_BROWSER_USER_AGENT).not.toBe('AIOSubtitles v1.0.0');
    const builtRequest = await subtitleSourceClientStandIn.buildRequest(
      buildSubtitleSourceRequestOptions({
        url: SOURCE_URL,
        headers: {'User-Agent': SUBTITLE_SOURCE_BROWSER_USER_AGENT},
      }),
    );
    expect(findHeaderValues(builtRequest.headers, 'user-agent')).toEqual([
      SUBTITLE_SOURCE_BROWSER_USER_AGENT,
    ]);
    expect(findHeaderValues(builtRequest.headers, 'accept')).toEqual(['*/*']);
  });

  it('adds a client header without dropping the defaults', async () => {
    const builtRequest = await subtitleSourceClientStandIn.buildRequest(
      buildSubtitleSourceRequestOptions({
        url: SOURCE_URL,
        headers: {Referer: 'https://source.test/'},
      }),
    );
    expect(findHeaderValues(builtRequest.headers, 'referer')).toEqual([
      'https://source.test/',
    ]);
    expect(findHeaderValues(builtRequest.headers, 'accept')).toEqual(['*/*']);
    expect(findHeaderValues(builtRequest.headers, 'user-agent')).toEqual([
      'AIOSubtitles v1.0.0',
    ]);
  });

  it('builds a request Maxios accepts without sending it', async () => {
    const builtRequest = await subtitleSourceClientStandIn.buildRequest(
      buildSubtitleSourceRequestOptions({
        url: SOURCE_URL,
        method: 'POST',
        headers: {'X-Fixture': 'yes'},
        body: {query: 'fixture'},
      }),
    );
    expect(builtRequest).toMatchObject({url: SOURCE_URL, method: 'POST'});
    expect(findHeaderValues(builtRequest.headers, 'x-fixture')).toEqual([
      'yes',
    ]);
    expect(findHeaderValues(builtRequest.headers, 'user-agent')).toEqual([
      'AIOSubtitles v1.0.0',
    ]);
  });

  it('sends the caller body as the request data', () => {
    expect(
      buildSubtitleSourceRequestOptions({
        url: SOURCE_URL,
        method: 'POST',
        body: {query: 'fixture'},
      }),
    ).toMatchObject({data: {query: 'fixture'}});
  });

  it('reads every status and the raw bytes itself', () => {
    expect(
      buildSubtitleSourceRequestOptions({
        url: SOURCE_URL,
        responseType: 'json',
        acceptedStatuses: [406],
      }),
    ).toMatchObject({validateStatus: null, responseType: 'stream'});
  });

  it('leaves every redirect to the helper', () => {
    expect(buildSubtitleSourceRequestOptions({url: SOURCE_URL})).toMatchObject({
      maxRedirects: 0,
    });
  });

  it('gives Maxios the request timeout', () => {
    expect(buildSubtitleSourceRequestOptions({url: SOURCE_URL})).toMatchObject({
      timeout: 15000,
    });
  });

  it('bounds the whole request by a 15 second abort signal', () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    const requestOptions = buildSubtitleSourceRequestOptions({url: SOURCE_URL});
    expect(timeoutSpy).toHaveBeenCalledWith(15000);
    expect(requestOptions?.signal).toBeInstanceOf(AbortSignal);
  });

  it('times out a silent source', () => {
    const timeoutController = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeoutController.signal);
    const requestOptions = buildSubtitleSourceRequestOptions({
      url: SOURCE_URL,
      signal: new AbortController().signal,
    });
    expect(requestOptions?.signal?.aborted).toBe(false);
    timeoutController.abort(new DOMException('Timed out.', 'TimeoutError'));
    expect(requestOptions?.signal?.aborted).toBe(true);
  });

  it('stops when the caller aborts', () => {
    const callerController = new AbortController();
    const requestOptions = buildSubtitleSourceRequestOptions({
      url: SOURCE_URL,
      signal: callerController.signal,
    });
    expect(requestOptions?.signal?.aborted).toBe(false);
    callerController.abort();
    expect(requestOptions?.signal?.aborted).toBe(true);
  });

  it('starts aborted when the caller signal already is', () => {
    expect(
      buildSubtitleSourceRequestOptions({
        url: SOURCE_URL,
        signal: AbortSignal.abort(),
      })?.signal?.aborted,
    ).toBe(true);
  });
});

describe('readSubtitleSourceResponse', () => {
  it('parses a JSON answer', () => {
    const headers = {'content-type': 'application/json; charset=utf-8'};
    expect(
      readSubtitleSourceResponse(makeJsonResponse([{id: 1}], {headers}), {
        subtitleSource: 'thesubtitledb',
      }),
    ).toEqual({status: 200, headers, body: [{id: 1}]});
  });

  it('reads JSON by default', () => {
    expect(
      readSubtitleSourceResponse(makeJsonResponse({hits: []}), {
        subtitleSource: 'thesubtitledb',
      }),
    ).toMatchObject({status: 200, body: {hits: []}});
  });

  it('reads a text answer as a string', () => {
    expect(
      readSubtitleSourceResponse(
        makeMaxiosResponse({
          headers: {'content-type': 'text/html; charset=utf-8'},
          body: '<html>Türkçe</html>',
        }),
        {subtitleSource: 'altyazidb', responseType: 'text'},
      ),
    ).toMatchObject({status: 200, body: '<html>Türkçe</html>'});
  });

  it('decodes a text answer by its declared charset', () => {
    expect(
      readSubtitleSourceResponse(
        makeMaxiosResponse({
          headers: {'content-type': 'text/html; charset=windows-1254'},
          body: Buffer.from([
            0x54, 0xfc, 0x72, 0x6b, 0xe7, 0x65, 0x20, 0xfd, 0xf0, 0xfe,
          ]),
        }),
        {subtitleSource: 'altyazidb', responseType: 'text'},
      ),
    ).toMatchObject({body: 'Türkçe ığş'});
  });

  it('falls back to utf-8 for an unknown charset', () => {
    expect(
      readSubtitleSourceResponse(
        makeMaxiosResponse({
          headers: {'content-type': 'text/plain; charset=no-such-charset'},
          body: 'Türkçe',
        }),
        {subtitleSource: 'altyazidb', responseType: 'text'},
      ),
    ).toMatchObject({body: 'Türkçe'});
  });

  it('reads an empty JSON body as null', () => {
    expect(
      readSubtitleSourceResponse(makeMaxiosResponse({status: 406}), {
        subtitleSource: 'opensubtitles',
        acceptedStatuses: [406],
      }),
    ).toMatchObject({status: 406, body: null});
  });

  it('reads an empty 204 as null', () => {
    expect(
      readSubtitleSourceResponse(makeMaxiosResponse({status: 204}), {
        subtitleSource: 'thesubtitledb',
      }),
    ).toMatchObject({status: 204, body: null});
  });

  it('maps an empty JSON 200 to SourceUnavailableError', () => {
    expect(
      catchReadError(
        makeMaxiosResponse({headers: {'content-type': 'application/json'}}),
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });

  it('bounds the wait a 429 carries', () => {
    expect(
      catchReadError(
        makeMaxiosResponse({
          status: 429,
          headers: {'retry-after': '9'.repeat(400)},
        }),
      ),
    ).toMatchObject({retryAfterMs: RETRY_AFTER_MAX_MS});
    expect(
      catchReadError(
        makeMaxiosResponse({status: 429, headers: {'retry-after': '-5'}}),
      ),
    ).toMatchObject({retryAfterMs: RETRY_AFTER_DEFAULT_MS});
    expect(
      catchReadError(
        makeMaxiosResponse({status: 429, headers: {'retry-after': 'Infinity'}}),
      ),
    ).toMatchObject({retryAfterMs: RETRY_AFTER_DEFAULT_MS});
    expect(
      catchReadError(
        makeMaxiosResponse({
          status: 429,
          headers: {'ratelimit-reset': '1763460000'},
        }),
      ),
    ).toMatchObject({retryAfterMs: RETRY_AFTER_MAX_MS});
  });

  it('reads a byte answer as bytes', () => {
    const subtitleBytes = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    const subtitleSourceResponse = readSubtitleSourceResponse(
      makeMaxiosResponse({
        headers: {'content-type': 'application/zip'},
        body: subtitleBytes,
      }),
      {subtitleSource: 'subdl', responseType: 'bytes'},
    );
    expect(subtitleSourceResponse?.body).toBeInstanceOf(Uint8Array);
    expect([...(subtitleSourceResponse?.body ?? [])]).toEqual([
      0x50, 0x4b, 0x03, 0x04,
    ]);
  });

  it('answers a 404 with an empty body', () => {
    expect(
      readSubtitleSourceResponse(
        makeJsonResponse({message: 'Not found'}, {status: 404}),
        {subtitleSource: 'thesubtitledb'},
      ),
    ).toMatchObject({status: 404, body: null});
  });

  it('turns a 429 into a rate-limit error that carries the wait', () => {
    expect(
      catchReadError(
        makeMaxiosResponse({status: 429, headers: {'retry-after': '120'}}),
      ),
    ).toMatchObject({
      name: 'SourceRateLimitError',
      subtitleSource: 'thesubtitledb',
      retryAfterMs: 120000,
      credentialId: null,
    });
  });

  it('carries the credential on a keyed rate limit', () => {
    expect(
      catchReadError(
        makeMaxiosResponse({status: 429, headers: {'retry-after': '5'}}),
        {credentialId: 'c1'},
      ),
    ).toMatchObject({
      name: 'SourceRateLimitError',
      retryAfterMs: 5000,
      credentialId: 'c1',
    });
  });

  it('reads ratelimit-reset when Retry-After is missing', () => {
    expect(
      catchReadError(
        makeMaxiosResponse({status: 429, headers: {'ratelimit-reset': '30'}}),
      ),
    ).toMatchObject({name: 'SourceRateLimitError', retryAfterMs: 30000});
  });

  it('prefers Retry-After over ratelimit-reset', () => {
    expect(
      catchReadError(
        makeMaxiosResponse({
          status: 429,
          headers: {'retry-after': '10', 'ratelimit-reset': '30'},
        }),
      ),
    ).toMatchObject({retryAfterMs: 10000});
  });

  it('waits the default when a 429 names no wait', () => {
    expect(catchReadError(makeMaxiosResponse({status: 429}))).toMatchObject({
      name: 'SourceRateLimitError',
      retryAfterMs: 60000,
    });
  });

  it('reads a Retry-After date against the clock', () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-18T10:00:00Z'));
    expect(
      catchReadError(
        makeMaxiosResponse({
          status: 429,
          headers: {'retry-after': 'Wed, 18 Nov 2026 10:00:45 GMT'},
        }),
      ),
    ).toMatchObject({retryAfterMs: 45000});
  });

  it('turns a 503 with a wait header into a rate limit', () => {
    expect(
      catchReadError(
        makeMaxiosResponse({status: 503, headers: {'retry-after': '120'}}),
      ),
    ).toMatchObject({name: 'SourceRateLimitError', retryAfterMs: 120000});
  });

  it('turns a 503 without a wait header into SourceUnavailableError', () => {
    expect(catchReadError(makeMaxiosResponse({status: 503}))).toBeInstanceOf(
      SourceUnavailableError,
    );
  });

  it.each([401, 403])(
    'turns a %i on a keyed request into SourceCredentialError',
    status => {
      const error = catchReadError(makeMaxiosResponse({status}), {
        credentialId: 'c1',
      });
      expect(error).toBeInstanceOf(SourceCredentialError);
      expect(error).toMatchObject({
        subtitleSource: 'thesubtitledb',
        credentialId: 'c1',
      });
    },
  );

  it.each([401, 403])(
    'turns a %i on an unkeyed request into SourceUnavailableError',
    status => {
      expect(catchReadError(makeMaxiosResponse({status}))).toBeInstanceOf(
        SourceUnavailableError,
      );
    },
  );

  it.each([400, 500, 502, 301])(
    'turns any other status %i into SourceUnavailableError',
    status => {
      expect(catchReadError(makeMaxiosResponse({status}))).toBeInstanceOf(
        SourceUnavailableError,
      );
    },
  );

  it('maps an HTML 200 to SourceUnavailableError', () => {
    expect(
      catchReadError(
        makeMaxiosResponse({
          headers: {'content-type': 'text/html; charset=utf-8'},
          body: '<html>Just a moment</html>',
        }),
        {subtitleSource: 'subsource'},
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });

  it('maps unparsable JSON to SourceUnavailableError', () => {
    expect(
      catchReadError(
        makeMaxiosResponse({
          headers: {'content-type': 'application/json'},
          body: '{"hits": [',
        }),
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });

  it('returns a listed non-2xx status with its body', () => {
    expect(
      readSubtitleSourceResponse(
        makeJsonResponse({remaining: -1}, {status: 406}),
        {subtitleSource: 'opensubtitles', acceptedStatuses: [406]},
      ),
    ).toMatchObject({status: 406, body: {remaining: -1}});
    expect(
      catchReadError(makeJsonResponse({remaining: -1}, {status: 406}), {
        subtitleSource: 'opensubtitles',
      }),
    ).toBeInstanceOf(SourceUnavailableError);
  });

  it('lets a listed status take precedence over the shared mapping', () => {
    expect(
      readSubtitleSourceResponse(
        makeJsonResponse({error: 'quota'}, {status: 403}),
        {
          subtitleSource: 'wyzie',
          credentialId: 'c1',
          acceptedStatuses: [402, 403],
        },
      ),
    ).toMatchObject({status: 403, body: {error: 'quota'}});
  });

  it('accepts a body at the byte cap', () => {
    expect(
      readSubtitleSourceResponse(
        makeMaxiosResponse({body: Buffer.alloc(RESPONSE_BYTES_MAX)}),
        {subtitleSource: 'subdl', responseType: 'bytes'},
      )?.body?.byteLength,
    ).toBe(RESPONSE_BYTES_MAX);
  });

  it('rejects a body one byte over the cap', () => {
    expect(
      catchReadError(
        makeMaxiosResponse({body: Buffer.alloc(RESPONSE_BYTES_MAX + 1)}),
        {subtitleSource: 'subdl', responseType: 'bytes'},
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });

  it('holds a listed status under the byte cap too', () => {
    expect(
      catchReadError(
        makeMaxiosResponse({
          status: 406,
          body: Buffer.alloc(RESPONSE_BYTES_MAX + 1),
        }),
        {acceptedStatuses: [406], responseType: 'bytes'},
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });

  it('never puts the url of a failed answer into an error', () => {
    const error = catchReadError({
      ...makeMaxiosResponse({status: 500, body: `bad key ${SECRET}`}),
      finalUrl: `${SOURCE_URL}?api_key=${SECRET}`,
    });
    expect(error).toBeInstanceOf(SourceUnavailableError);
    expect(toErrorText(error)).not.toContain(SECRET);
  });
});

describe('readCappedBody', () => {
  function trackDestroy(readable) {
    const destroySpy = vi.spyOn(readable, 'destroy');
    return {readable, destroySpy};
  }

  it('joins every chunk and destroys the stream', async () => {
    const {readable, destroySpy} = trackDestroy(
      Readable.from([Buffer.from('ab'), Buffer.from('cd')]),
    );
    expect((await readCappedBody(readable, 8)).toString()).toBe('abcd');
    expect(destroySpy).toHaveBeenCalled();
  });

  it('accepts a body at the cap', async () => {
    expect(
      (await readCappedBody(Readable.from([Buffer.alloc(8)]), 8)).byteLength,
    ).toBe(8);
  });

  it('rejects a body over the cap and destroys the stream', async () => {
    const {readable, destroySpy} = trackDestroy(
      Readable.from([Buffer.alloc(4), Buffer.alloc(5)]),
    );
    await expect(readCappedBody(readable, 8)).rejects.toThrow();
    expect(destroySpy).toHaveBeenCalled();
  });

  it('stops an endless body at the cap', async () => {
    let chunkCount = 0;
    const endlessReadable = new Readable({
      read() {
        chunkCount += 1;
        this.push(Buffer.alloc(1024));
      },
    });
    await expect(readCappedBody(endlessReadable, 10 * 1024)).rejects.toThrow();
    expect(endlessReadable.destroyed).toBe(true);
    expect(chunkCount).toBeLessThan(64);
  });

  it('destroys the stream when the source breaks', async () => {
    const brokenReadable = new Readable({
      read() {
        this.destroy(new Error('socket hang up'));
      },
    });
    await expect(readCappedBody(brokenReadable, 8)).rejects.toThrow();
    expect(brokenReadable.destroyed).toBe(true);
  });

  it('caps at 20 MiB by default', async () => {
    await expect(
      readCappedBody(Readable.from([Buffer.alloc(RESPONSE_BYTES_MAX + 1)])),
    ).rejects.toThrow();
  });
});

describe('shouldReadSubtitleSourceBody', () => {
  it.each([
    [200, [], true],
    [204, [], true],
    [406, [406], true],
    [404, [], false],
    [429, [], false],
    [401, [], false],
    [406, [], false],
    [302, [], false],
  ])(
    'reads the body of %i with listed %j: %s',
    (status, acceptedStatuses, isRead) => {
      expect(shouldReadSubtitleSourceBody(status, acceptedStatuses)).toBe(
        isRead,
      );
    },
  );
});

describe('readSubtitleSourceBodyBytes', () => {
  it('reads the body of a status it needs', async () => {
    const readable = Readable.from([Buffer.from('[]')]);
    expect(
      (
        await readSubtitleSourceBodyBytes({status: 200, data: readable}, [])
      ).toString(),
    ).toBe('[]');
    expect(readable.destroyed).toBe(true);
  });

  it.each([404, 429, 500])('destroys the body of a %i unread', async status => {
    const readable = Readable.from([Buffer.from('ignored')]);
    const readSpy = vi.spyOn(readable, 'read');
    expect(
      (await readSubtitleSourceBodyBytes({status, data: readable}, []))
        .byteLength,
    ).toBe(0);
    expect(readable.destroyed).toBe(true);
    expect(readSpy).not.toHaveBeenCalled();
  });
});

describe('findRedirectLocation', () => {
  it.each([301, 302, 303, 307, 308])('finds the location of a %i', status => {
    expect(
      findRedirectLocation({status, headers: {location: '/next'}}, []),
    ).toBe('/next');
  });

  it('takes the first of repeated location headers', () => {
    expect(
      findRedirectLocation(
        {status: 302, headers: {location: ['/first', '/second']}},
        [],
      ),
    ).toBe('/first');
  });

  it('answers null for a redirect without a location', () => {
    expect(findRedirectLocation({status: 302, headers: {}}, [])).toBeNull();
  });

  it('answers null for a status that is not a redirect', () => {
    expect(
      findRedirectLocation({status: 200, headers: {location: '/next'}}, []),
    ).toBeNull();
  });

  it('answers null for a listed redirect status', () => {
    expect(
      findRedirectLocation({status: 302, headers: {location: '/next'}}, [302]),
    ).toBeNull();
  });
});

describe('buildRedirectRequest', () => {
  const previousRequest = {
    url: 'https://source.test/api/list?api_key=k1',
    method: 'GET',
    headers: {
      'User-Agent': 'AIOSubtitles v1.0.0',
      Accept: 'application/json',
      'accept-language': 'tr',
      Authorization: 'Bearer token',
      Cookie: 'session=1',
      'X-Api-Key': 'k1',
    },
    body: undefined,
  };

  it('keeps every header on a same-origin hop and resolves a relative location', () => {
    expect(buildRedirectRequest(previousRequest, '../v2/list', 302)).toEqual({
      ...previousRequest,
      url: 'https://source.test/v2/list',
    });
  });

  it('keeps only the user agent, accept and language on a cross-origin hop', () => {
    expect(
      buildRedirectRequest(
        previousRequest,
        'https://cdn.source.test/file',
        302,
      ),
    ).toEqual({
      url: 'https://cdn.source.test/file',
      method: 'GET',
      headers: {
        'User-Agent': 'AIOSubtitles v1.0.0',
        Accept: 'application/json',
        'accept-language': 'tr',
      },
      body: undefined,
    });
  });

  it('treats an upgrade to https as another origin', () => {
    expect(
      buildRedirectRequest(
        {...previousRequest, url: 'http://source.test/api/list'},
        'https://source.test/api/list',
        301,
      ).headers,
    ).not.toHaveProperty('Authorization');
  });

  it.each([301, 302, 303, 307, 308])(
    'refuses a downgrade from https to http on a %i',
    status => {
      expect(() =>
        buildRedirectRequest(
          previousRequest,
          'http://source.test/api/list',
          status,
        ),
      ).toThrow();
    },
  );

  it.each([
    ['a loopback address', 'http://127.0.0.1/file'],
    ['a loopback IPv6 address', 'https://[::1]/file'],
    ['an IPv4-mapped loopback address', 'https://[::ffff:127.0.0.1]/file'],
    ['a private address', 'https://10.0.0.5/file'],
    ['a link-local address', 'https://169.254.169.254/latest'],
    ['an unspecified address', 'https://0.0.0.0/file'],
    ['a shared address', 'https://100.64.1.2/file'],
    ['a single-label host', 'https://valkey/file'],
    ['localhost', 'https://localhost/file'],
  ])('refuses a redirect to %s', (_, locationHeader) => {
    expect(() =>
      buildRedirectRequest(previousRequest, locationHeader, 302),
    ).toThrow();
  });

  it('follows a redirect to a public address', () => {
    expect(
      buildRedirectRequest(previousRequest, 'https://93.184.215.14/file', 302)
        .url,
    ).toBe('https://93.184.215.14/file');
  });

  const postRequest = {
    url: 'https://source.test/login',
    method: 'POST',
    headers: {'Content-Type': 'application/json', Accept: '*/*'},
    body: {username: 'fixture'},
  };

  it.each([301, 302, 303])(
    'turns a POST into a GET without a body on a %i',
    status => {
      expect(buildRedirectRequest(postRequest, '/home', status)).toEqual({
        url: 'https://source.test/home',
        method: 'GET',
        headers: {Accept: '*/*'},
        body: undefined,
      });
    },
  );

  it.each([307, 308])('keeps the method and body on a %i', status => {
    expect(buildRedirectRequest(postRequest, '/again', status)).toEqual({
      ...postRequest,
      url: 'https://source.test/again',
    });
  });

  it('compares the method in any letter case', () => {
    expect(
      buildRedirectRequest({...postRequest, method: 'post'}, '/home', 302),
    ).toMatchObject({method: 'GET', body: undefined});
  });

  it.each([307, 308])(
    'refuses a %i that would carry the body to another origin',
    status => {
      expect(() =>
        buildRedirectRequest(postRequest, 'https://other.test/login', status),
      ).toThrow();
    },
  );

  it.each([307, 308])(
    'follows a %i without a body to another origin',
    status => {
      expect(
        buildRedirectRequest(
          previousRequest,
          'https://cdn.source.test/file',
          status,
        ),
      ).toMatchObject({url: 'https://cdn.source.test/file', method: 'GET'});
    },
  );

  it.each([301, 302, 303])(
    'turns a POST into a GET without a body on a cross-origin %i',
    status => {
      expect(
        buildRedirectRequest(postRequest, 'https://other.test/home', status),
      ).toEqual({
        url: 'https://other.test/home',
        method: 'GET',
        headers: {Accept: '*/*'},
        body: undefined,
      });
    },
  );

  it('refuses a location that is not http', () => {
    expect(() =>
      buildRedirectRequest(previousRequest, 'file:///etc/passwd', 302),
    ).toThrow();
  });
});

describe('isPrivateSubtitleSourceUrl', () => {
  it.each([
    'http://127.0.0.1/file.zip',
    'https://[::1]/file.zip',
    'https://10.1.2.3/file.zip',
    'https://172.16.0.1/file.zip',
    'https://192.168.0.1/file.zip',
    'https://169.254.169.254/latest',
    'https://100.64.0.1/file.zip',
    'https://100.127.255.254/file.zip',
    'https://255.255.255.255/file.zip',
    'https://224.0.0.1/file.zip',
    'https://240.0.0.1/file.zip',
    'https://[fd12::1]/file.zip',
    'https://[fe80::1]/file.zip',
    'https://[ff02::1]/file.zip',
    'https://[::ffff:10.0.0.5]/file.zip',
    'https://[::ffff:a9fe:a9fe]/latest',
    'https://2130706433/file.zip',
    'http://[64:ff9b::a9fe:a9fe]/latest',
    'http://[2002:a9fe:a9fe::]/latest',
    'http://[::ffff:0:7f00:1]/file.zip',
    'https://postgres:5432/',
    'https://localhost./file.zip',
  ])('marks %s as private', siteUrl => {
    expect(isPrivateSubtitleSourceUrl(siteUrl)).toBe(true);
  });

  it.each([
    'https://dl.subdl.test/7781.zip',
    'https://93.184.215.14/file.zip',
    'https://100.128.0.1/file.zip',
    'https://[2606:4700:4700::1111]/file.zip',
    'https://[::ffff:93.184.215.14]/file.zip',
  ])('lets %s through', siteUrl => {
    expect(isPrivateSubtitleSourceUrl(siteUrl)).toBe(false);
  });
});

describe('isSubtitleSourceFileUrl', () => {
  it.each(['https://dl.subdl.test/7781.srt', 'http://dl.subdl.test/7781.srt'])(
    'takes the public file url %s',
    siteFileUrl => {
      expect(isSubtitleSourceFileUrl(siteFileUrl)).toBe(true);
    },
  );

  it.each([
    null,
    undefined,
    '',
    'not a url',
    'ftp://dl.subdl.test/7781.srt',
    'http://127.0.0.1/file.srt',
    'http://localhost/file.srt',
  ])('refuses %s as a file url', siteFileUrl => {
    expect(isSubtitleSourceFileUrl(siteFileUrl)).toBe(false);
  });
});

describe('isSubtitleSourceJsonResponse', () => {
  it.each([
    'application/json',
    'application/json; charset=utf-8',
    'Application/Problem+JSON',
  ])('reads %s as a JSON answer', contentType => {
    expect(isSubtitleSourceJsonResponse({'content-type': contentType})).toBe(
      true,
    );
  });

  it.each(['application/x-subrip', 'text/html', 'application/octet-stream'])(
    'reads %s as no JSON answer',
    contentType => {
      expect(isSubtitleSourceJsonResponse({'content-type': contentType})).toBe(
        false,
      );
    },
  );

  it('reads an answer without a content type as no JSON answer', () => {
    expect(isSubtitleSourceJsonResponse({})).toBe(false);
  });
});

describe('readSubtitleSourceJson', () => {
  it('parses JSON body bytes in the charset the answer names', () => {
    expect(
      readSubtitleSourceJson(Buffer.from('{"filename":"Şimdi.srt"}'), {
        'content-type': 'application/json; charset=utf-8',
      }),
    ).toEqual({filename: 'Şimdi.srt'});
  });

  it('throws on bytes that are not JSON', () => {
    expect(() =>
      readSubtitleSourceJson(Buffer.from('1\n00:00:01,000'), {
        'content-type': 'application/json',
      }),
    ).toThrow(SyntaxError);
  });
});

describe('buildRedirectHop', () => {
  const keyedHop = {
    subtitleSourceRequest: {
      url: `https://source.test/download?api_key=${SECRET}`,
      method: 'GET',
      headers: {'X-Api-Key': SECRET},
      body: undefined,
    },
    readOptions: {
      subtitleSource: 'subdl',
      credentialId: 'c1',
      acceptedStatuses: [],
      responseType: 'bytes',
    },
  };

  function readAfterHop(subtitleSourceHop, status) {
    try {
      return readSubtitleSourceResponse(
        makeMaxiosResponse({status}),
        subtitleSourceHop.readOptions,
      );
    } catch (error) {
      return error;
    }
  }

  it('unties the answer from the credential after a cross-origin hop', () => {
    const redirectHop = buildRedirectHop(keyedHop, {
      status: 302,
      locationHeader: 'https://cdn.source.test/file.zip',
    });
    expect(redirectHop.subtitleSourceRequest.url).toBe(
      'https://cdn.source.test/file.zip',
    );
    expect(redirectHop.readOptions).toEqual({
      ...keyedHop.readOptions,
      credentialId: null,
    });
    expect(readAfterHop(redirectHop, 401)).toBeInstanceOf(
      SourceUnavailableError,
    );
    expect(readAfterHop(redirectHop, 403)).toBeInstanceOf(
      SourceUnavailableError,
    );
    expect(readAfterHop(redirectHop, 429)).toMatchObject({
      name: 'SourceRateLimitError',
      credentialId: null,
    });
  });

  it('keeps the credential on a same-origin hop', () => {
    const redirectHop = buildRedirectHop(keyedHop, {
      status: 302,
      locationHeader: '/v2/download',
    });
    expect(redirectHop.readOptions).toEqual(keyedHop.readOptions);
    expect(readAfterHop(redirectHop, 401)).toBeInstanceOf(
      SourceCredentialError,
    );
    expect(readAfterHop(redirectHop, 403)).toMatchObject({
      name: 'SourceCredentialError',
      credentialId: 'c1',
    });
    expect(readAfterHop(redirectHop, 429)).toMatchObject({
      name: 'SourceRateLimitError',
      credentialId: 'c1',
    });
  });

  it('stays untied after hopping back to the first origin', () => {
    const crossOriginHop = buildRedirectHop(keyedHop, {
      status: 302,
      locationHeader: 'https://cdn.source.test/file.zip',
    });
    expect(
      buildRedirectHop(crossOriginHop, {
        status: 302,
        locationHeader: 'https://source.test/file.zip',
      }).readOptions.credentialId,
    ).toBeNull();
  });

  it.each([
    ['a downgrade to http', 302, 'http://source.test/download'],
    ['a body sent to another origin', 307, 'https://other.test/upload'],
    ['a private address', 302, 'http://192.168.1.10/file'],
  ])('refuses %s with SourceUnavailableError', (_, status, locationHeader) => {
    const postHop = {
      ...keyedHop,
      subtitleSourceRequest: {
        ...keyedHop.subtitleSourceRequest,
        method: 'POST',
        body: {apiKey: SECRET},
      },
    };
    let error = null;
    try {
      buildRedirectHop(postHop, {status, locationHeader});
    } catch (caughtError) {
      error = caughtError;
    }
    expect(error).toBeInstanceOf(SourceUnavailableError);
    expect(error).toMatchObject({subtitleSource: 'subdl'});
    expect(toErrorText(error)).not.toContain(SECRET);
    expect(toErrorText(error)).not.toContain('source.test');
    expect(toErrorText(error)).not.toContain(locationHeader);
  });
});

describe('toSubtitleSourceError', () => {
  it('keeps only the error code as the cause', () => {
    const error = toSubtitleSourceError(
      new MaxiosRequestError('Request failed.', {code: 'ECONNREFUSED'}),
      {subtitleSource: 'thesubtitledb'},
    );
    expect(error.cause).toBeInstanceOf(Error);
    expect(error.cause.message).toBe('ECONNREFUSED');
  });

  it('names a raw stream abort by its name', () => {
    const error = toSubtitleSourceError(
      new DOMException('The operation timed out.', 'TimeoutError'),
      {subtitleSource: 'thesubtitledb'},
    );
    expect(error).toBeInstanceOf(SourceUnavailableError);
    expect(error.cause.message).toBe('TimeoutError');
  });

  it.each([
    ['an abort', 'AbortError'],
    ['a timeout', 'TimeoutError'],
    ['a headers timeout', 'UND_ERR_HEADERS_TIMEOUT'],
    ['a refused connection', 'ECONNREFUSED'],
    ['an unknown host', 'ENOTFOUND'],
  ])('turns %s into SourceUnavailableError', (_, code) => {
    const error = toSubtitleSourceError(
      new MaxiosRequestError('Request failed.', {code}),
      {subtitleSource: 'thesubtitledb'},
    );
    expect(error).toBeInstanceOf(SourceUnavailableError);
    expect(error).toMatchObject({subtitleSource: 'thesubtitledb'});
  });

  it('turns a broken answer into SourceUnavailableError', () => {
    expect(
      toSubtitleSourceError(
        new MaxiosResponseError('Socket closed.', {
          code: 'UND_ERR_SOCKET',
          response: makeMaxiosResponse(),
        }),
        {subtitleSource: 'thesubtitledb'},
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });

  it('turns an unexpected error into SourceUnavailableError', () => {
    expect(
      toSubtitleSourceError(new TypeError('Invalid URL.'), {
        subtitleSource: 'thesubtitledb',
      }),
    ).toBeInstanceOf(SourceUnavailableError);
  });

  it.each([
    [
      'rate limit',
      new SourceRateLimitError({
        subtitleSource: 'thesubtitledb',
        retryAfterMs: 1000,
      }),
    ],
    [
      'credential',
      new SourceCredentialError({
        subtitleSource: 'thesubtitledb',
        credentialId: 'c1',
      }),
    ],
    [
      'unavailable',
      new SourceUnavailableError({
        subtitleSource: 'thesubtitledb',
        cause: null,
      }),
    ],
  ])('keeps the %s error it is handed', (_, subtitleSourceError) => {
    expect(
      toSubtitleSourceError(subtitleSourceError, {
        subtitleSource: 'thesubtitledb',
      }),
    ).toBe(subtitleSourceError);
  });

  it('never puts a credential from the url into an error', () => {
    const secretUrl = `${SOURCE_URL}?api_key=${SECRET}`;
    const maxiosError = new MaxiosResponseError(
      `Request to ${secretUrl} failed.`,
      {
        code: 'ECONNRESET',
        cause: new Error(`connect ECONNRESET ${secretUrl}`),
        response: {...makeMaxiosResponse(), finalUrl: secretUrl},
      },
    );
    const error = toSubtitleSourceError(maxiosError, {subtitleSource: 'subdl'});
    expect(error).toBeInstanceOf(SourceUnavailableError);
    expect(toErrorText(error)).not.toContain(SECRET);
  });

  it('never puts a credential from a header into an error', () => {
    const maxiosError = new MaxiosRequestError(
      `Header Api-Key: ${SECRET} rejected.`,
      {code: 'ERR_INVALID_CHAR', cause: new Error(`Api-Key: ${SECRET}`)},
    );
    const error = toSubtitleSourceError(maxiosError, {
      subtitleSource: 'altyazidb',
    });
    expect(error).toBeInstanceOf(SourceUnavailableError);
    expect(toErrorText(error)).not.toContain(SECRET);
  });
});

describe('toSubtitleSourceStatusError', () => {
  it('reads a missing file as an unavailable source naming only the status', () => {
    const error = toSubtitleSourceStatusError(
      {status: 404, headers: {}},
      {subtitleSource: 'thesubtitledb', credentialId: 'c1'},
    );
    expect(error).toBeInstanceOf(SourceUnavailableError);
    expect(error.cause.message).toBe('Status 404.');
  });

  it('reads 429 as a rate limit on the named credential', () => {
    const error = toSubtitleSourceStatusError(
      {status: 429, headers: {'retry-after': '30'}},
      {subtitleSource: 'thesubtitledb', credentialId: 'c1'},
    );
    expect(error).toBeInstanceOf(SourceRateLimitError);
    expect(error).toMatchObject({retryAfterMs: 30000, credentialId: 'c1'});
  });

  it('blames a 401 on the credential only when one was sent', () => {
    expect(
      toSubtitleSourceStatusError(
        {status: 401, headers: {}},
        {subtitleSource: 'thesubtitledb', credentialId: 'c1'},
      ),
    ).toBeInstanceOf(SourceCredentialError);
    expect(
      toSubtitleSourceStatusError(
        {status: 401, headers: {}},
        {subtitleSource: 'thesubtitledb', credentialId: null},
      ),
    ).toBeInstanceOf(SourceUnavailableError);
  });
});

describe('readSubtitleSourceFileName', () => {
  it.each([
    [
      'a quoted file name',
      'attachment; filename="Show.S01E01.srt"',
      'Show.S01E01.srt',
    ],
    [
      'a bare file name',
      'attachment; filename=Show.S01E01.srt',
      'Show.S01E01.srt',
    ],
    [
      'an RFC 8187 file name over the plain one',
      `attachment; filename="Dizi.srt"; filename*=UTF-8''%C4%B0stanbul.srt`,
      'İstanbul.srt',
    ],
  ])('reads %s', (_, contentDisposition, fileName) => {
    expect(
      readSubtitleSourceFileName({'content-disposition': contentDisposition}),
    ).toBe(fileName);
  });

  it('reads the first of repeated headers', () => {
    expect(
      readSubtitleSourceFileName({
        'content-disposition': [
          'attachment; filename="First.srt"',
          'attachment; filename="Second.srt"',
        ],
      }),
    ).toBe('First.srt');
  });

  it.each([
    ['no header', {}],
    ['a disposition that names no file', {'content-disposition': 'attachment'}],
    ['a malformed disposition', {'content-disposition': ';;;'}],
  ])('gives no file name for %s', (_, headers) => {
    expect(readSubtitleSourceFileName(headers)).toBeNull();
  });
});

describe('readSubtitleSourceContentType', () => {
  it('reads the content type', () => {
    expect(
      readSubtitleSourceContentType({
        'content-type': 'application/json; charset=utf-8',
      }),
    ).toBe('application/json; charset=utf-8');
  });

  it('reads the first of repeated headers', () => {
    expect(
      readSubtitleSourceContentType({
        'content-type': ['application/x-subrip', 'application/json'],
      }),
    ).toBe('application/x-subrip');
  });

  it('gives no content type without the header', () => {
    expect(readSubtitleSourceContentType({})).toBeNull();
  });
});
