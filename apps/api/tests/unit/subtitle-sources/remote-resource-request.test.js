import {Readable} from 'node:stream';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {Maxios} from '@mepkg/maxios';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {createGuardedLookup} from '../../../src/lib/subtitle-sources/source-address-guard.js';
import {SourceUnavailableError} from '../../../src/lib/subtitle-sources/subtitle-source-errors.js';
import {
  requestRemoteResource,
  requestSubtitleSource,
} from '../../../src/lib/subtitle-sources/subtitle-source-request.js';
import {toErrorText} from '../../helpers/caught-error.js';

const REMOTE_URL = 'https://catalog.test/meta/movie/tt0133093.json';

function answerOnce({status = 200, payload}) {
  return vi.spyOn(Maxios.prototype, 'request').mockResolvedValueOnce({
    status,
    headers: {'content-type': 'application/json'},
    data: Readable.from([Buffer.from(JSON.stringify(payload))]),
  });
}

function refuseEverySend() {
  return vi
    .spyOn(Maxios.prototype, 'request')
    .mockRejectedValue(new Error('A request was sent.'));
}

afterEach(() => {
  vi.restoreAllMocks();
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
      .spyOn(Maxios.prototype, 'request')
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
});
