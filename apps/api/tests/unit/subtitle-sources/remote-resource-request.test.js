import {Readable} from 'node:stream';
import {gzipSync} from 'node:zlib';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {
  getRemoteResourceClient,
  setRemoteResourceTransport,
} from '../../../src/lib/subtitle-sources/remote-resource-client.js';
import {createGuardedLookup} from '../../../src/lib/subtitle-sources/source-address-guard.js';
import {SourceUnavailableError} from '../../../src/lib/subtitle-sources/subtitle-source-errors.js';
import {
  requestRemoteResource,
  requestSubtitleSource,
} from '../../../src/lib/subtitle-sources/subtitle-source-request.js';
import {toErrorText} from '../../helpers/caught-error.js';
import {
  installNetworkDispatcher,
  networkDispatcher,
} from '../../helpers/network.js';

const REMOTE_URL = 'https://catalog.test/meta/movie/tt0133093.json';
const REMOTE_ORIGIN = 'https://catalog.test';
const FILE_PATH = '/files/subtitle.srt';
const RESPONSE_BYTES_MAX = 20971520;

function answerFile(fileBytes, {status = 200, headers = {}} = {}) {
  networkDispatcher
    .get(REMOTE_ORIGIN)
    .intercept({path: FILE_PATH})
    .reply(status, fileBytes, {headers});
}

function requestFile(requestOptions = {}) {
  return requestRemoteResource({
    serviceName: 'kitsu',
    url: `${REMOTE_ORIGIN}${FILE_PATH}`,
    responseType: 'bytes',
    ...requestOptions,
  }).catch(caught => caught);
}

function answerOnce({status = 200, payload}) {
  return vi.spyOn(getRemoteResourceClient(), 'request').mockResolvedValueOnce({
    status,
    headers: {'content-type': 'application/json'},
    data: Readable.from([Buffer.from(JSON.stringify(payload))]),
  });
}

function refuseEverySend() {
  return vi
    .spyOn(getRemoteResourceClient(), 'request')
    .mockRejectedValue(new Error('A request was sent.'));
}

afterEach(() => {
  vi.restoreAllMocks();
  installNetworkDispatcher();
});

describe('requestRemoteResource', () => {
  it('reads a JSON answer of a service that is not a subtitle source', async () => {
    const requestSpy = answerOnce({payload: {meta: {id: 'tt0133093'}}});

    await expect(
      requestRemoteResource({serviceName: 'cinemeta', url: REMOTE_URL}),
    ).resolves.toMatchObject({status: 200, body: {meta: {id: 'tt0133093'}}});
    expect(requestSpy).toHaveBeenCalledWith(
      expect.objectContaining({url: REMOTE_URL, method: 'GET'}),
    );
  });

  it('names the service in a typed error', async () => {
    answerOnce({status: 500, payload: {}});

    const error = await requestRemoteResource({
      serviceName: 'cinemeta',
      url: REMOTE_URL,
    }).catch(caught => caught);

    expect(error).toBeInstanceOf(SourceUnavailableError);
    expect(error.serviceName).toBe('cinemeta');
    expect(error.subtitleSource).toBeNull();
    expect(error.message).toBe('Cinemeta is unavailable.');
  });

  it('refuses a private host before sending', async () => {
    const requestSpy = vi
      .spyOn(getRemoteResourceClient(), 'request')
      .mockResolvedValueOnce({
        status: 302,
        headers: {location: 'http://127.0.0.1/meta.json'},
        data: Readable.from([]),
      });

    await expect(
      requestRemoteResource({serviceName: 'kitsu', url: REMOTE_URL}),
    ).rejects.toBeInstanceOf(SourceUnavailableError);
    expect(requestSpy).toHaveBeenCalledTimes(1);
  });

  it.each([
    'http://127.0.0.1/meta.json',
    'https://[::ffff:7f00:1]/meta.json',
    'https://169.254.169.254/latest/meta-data',
    'https://[fd00::1]/meta.json',
    'https://valkey:6379/',
  ])('refuses the private first url %s without sending', async url => {
    const requestSpy = refuseEverySend();

    const error = await requestRemoteResource({
      serviceName: 'kitsu',
      url,
    }).catch(caught => caught);

    expect(error).toBeInstanceOf(SourceUnavailableError);
    expect(error.serviceName).toBe('kitsu');
    expect(toErrorText(error)).not.toContain(new URL(url).hostname);
    expect(requestSpy).not.toHaveBeenCalled();
  });

  it('refuses a private first url with the code the address guard uses', async () => {
    const requestSpy = refuseEverySend();
    const {error: lookupError} = await new Promise(resolve => {
      createGuardedLookup((hostname, options, callback) =>
        callback(null, [{address: '10.0.0.5', family: 4}]),
      )('inside.catalog.test', {all: true}, error => resolve({error}));
    });

    const error = await requestRemoteResource({
      serviceName: 'kitsu',
      url: 'https://10.0.0.5/meta.json',
    }).catch(caught => caught);

    expect(error.cause.message).toBe(lookupError.code);
    expect(requestSpy).not.toHaveBeenCalled();
  });

  it('refuses a host that resolves to a private address, through the lookup, with the error of the address guard', async () => {
    const resolve = vi.fn((hostname, options, callback) =>
      callback(null, [{address: '10.0.0.5', family: 4}]),
    );
    setRemoteResourceTransport({lookup: createGuardedLookup(resolve)});
    const textCheckError = await requestRemoteResource({
      serviceName: 'kitsu',
      url: 'https://10.0.0.5/meta.json',
    }).catch(caught => caught);

    const error = await requestRemoteResource({
      serviceName: 'kitsu',
      url: 'https://inside.catalog.test/meta.json',
    }).catch(caught => caught);

    expect(resolve).toHaveBeenCalledWith(
      'inside.catalog.test',
      expect.anything(),
      expect.any(Function),
    );
    expect(error).toBeInstanceOf(SourceUnavailableError);
    expect(error.constructor).toBe(textCheckError.constructor);
    expect(error.message).toBe(textCheckError.message);
    expect(error.cause.message).toBe('ERR_PRIVATE_HOST');
    expect(error.cause.message).toBe(textCheckError.cause.message);
    expect(toErrorText(error)).not.toContain('inside.catalog.test');
  });
});

describe('requestRemoteResource response cap', () => {
  it('reads a body at the 20 MiB cap', async () => {
    answerFile(Buffer.alloc(RESPONSE_BYTES_MAX));

    const response = await requestFile();

    expect(response.body.byteLength).toBe(RESPONSE_BYTES_MAX);
  });

  it('refuses a body one byte over the cap while it streams', async () => {
    answerFile(Buffer.alloc(RESPONSE_BYTES_MAX + 1));

    const error = await requestFile();

    expect(error).toBeInstanceOf(SourceUnavailableError);
    expect(error.cause.message).toBe('max_content_length');
  });

  it('refuses a compressed body that inflates over the cap', async () => {
    const compressedBytes = gzipSync(Buffer.alloc(RESPONSE_BYTES_MAX + 1));
    answerFile(compressedBytes, {headers: {'content-encoding': 'gzip'}});

    const error = await requestFile();

    expect(compressedBytes.byteLength).toBeLessThan(RESPONSE_BYTES_MAX);
    expect(error).toBeInstanceOf(SourceUnavailableError);
    expect(error.cause.message).toBe('max_content_length');
  });

  it('holds a listed status under the cap too', async () => {
    answerFile(Buffer.alloc(RESPONSE_BYTES_MAX + 1), {status: 406});

    const error = await requestFile({acceptedStatuses: [406]});

    expect(error).toBeInstanceOf(SourceUnavailableError);
    expect(error.cause.message).toBe('max_content_length');
  });
});

describe('requestSubtitleSource', () => {
  it('refuses a private first url without sending', async () => {
    const requestSpy = refuseEverySend();

    const error = await requestSubtitleSource({
      subtitleSource: SubtitleSource.THESUBTITLEDB,
      url: 'http://192.168.1.10/file.zip',
    }).catch(caught => caught);

    expect(error).toBeInstanceOf(SourceUnavailableError);
    expect(error.subtitleSource).toBe(SubtitleSource.THESUBTITLEDB);
    expect(requestSpy).not.toHaveBeenCalled();
  });

  it('passes the subtitle source as the service name', async () => {
    answerOnce({status: 500, payload: {}});

    const error = await requestSubtitleSource({
      subtitleSource: SubtitleSource.THESUBTITLEDB,
      url: REMOTE_URL,
    }).catch(caught => caught);

    expect(error).toBeInstanceOf(SourceUnavailableError);
    expect(error.subtitleSource).toBe(SubtitleSource.THESUBTITLEDB);
    expect(error.serviceName).toBe(SubtitleSource.THESUBTITLEDB);
    expect(error.message).toBe('TheSubtitleDB is unavailable.');
  });

  it('marks a 429 on a call sent without a credential as keyless', async () => {
    answerFile('', {status: 429, headers: {'retry-after': '30'}});

    await expect(requestFile()).resolves.toMatchObject({
      name: 'SourceRateLimitError',
      retryAfterMs: 30000,
      credentialId: null,
      isKeylessCall: true,
    });
  });

  it('never marks a 429 on a keyed call as keyless', async () => {
    answerFile('', {status: 429, headers: {'retry-after': '30'}});

    await expect(requestFile({credentialId: 'c1'})).resolves.toMatchObject({
      name: 'SourceRateLimitError',
      credentialId: 'c1',
      isKeylessCall: false,
    });
  });
});
