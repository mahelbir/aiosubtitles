import {Readable} from 'node:stream';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {Maxios} from '@mepkg/maxios';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {SourceUnavailableError} from '../../../src/lib/subtitle-sources/subtitle-source-errors.js';
import {
  requestRemoteResource,
  requestSubtitleSource,
} from '../../../src/lib/subtitle-sources/subtitle-source-request.js';

const REMOTE_URL = 'https://catalog.test/meta/movie/tt0133093.json';

function answerOnce({status = 200, payload}) {
  return vi.spyOn(Maxios.prototype, 'request').mockResolvedValueOnce({
    status,
    headers: {'content-type': 'application/json'},
    data: Readable.from([Buffer.from(JSON.stringify(payload))]),
  });
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
});

describe('requestSubtitleSource', () => {
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
