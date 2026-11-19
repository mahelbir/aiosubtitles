import {describe, expect, it, vi} from 'vitest';
import {SourceUnavailableError} from '../../src/lib/subtitle-sources/subtitle-source-errors.js';
import {CatalogService} from '../../src/lib/video-catalog/catalog-service.js';
import {
  KITSU_MAPPING_REFRESH_TTL,
  createAnidbIdReader,
} from '../../src/lib/video-catalog/kitsu-mapping.js';
import {redis} from '../../src/redis/index.js';

const ANIDB_CACHE_KEY = 'kitsu-anidb:v1:7442';

const kitsuMappingsBody = {
  data: [
    {
      id: '5001',
      type: 'mappings',
      attributes: {externalSite: 'myanimelist/anime', externalId: '16498'},
    },
    {
      id: '5002',
      type: 'mappings',
      attributes: {externalSite: 'anidb', externalId: '9541'},
    },
  ],
};

const fullPage = {
  data: Array.from({length: 20}, (unused, index) => ({
    id: String(6000 + index),
    type: 'mappings',
    attributes: {externalSite: 'myanimelist/anime', externalId: '16498'},
  })),
};

function answerWith(body) {
  return vi.fn(async () => ({status: 200, headers: {}, body}));
}

function readRequestedUrl(requestRemoteResource) {
  return new URL(
    requestRemoteResource.mock.calls[0]?.[0]?.url ?? 'about:blank',
  );
}

describe('the Kitsu AniDB id', () => {
  it('resolves the AniDB id of kitsu:7442 from the Kitsu mappings', async () => {
    const requestRemoteResource = answerWith(kitsuMappingsBody);
    const readAnidbId = createAnidbIdReader({requestRemoteResource});

    await expect(readAnidbId('7442')).resolves.toBe('9541');
    expect(requestRemoteResource).toHaveBeenCalledWith(
      expect.objectContaining({serviceName: CatalogService.KITSU}),
    );
    expect(readRequestedUrl(requestRemoteResource).pathname).toBe(
      '/api/edge/anime/7442/mappings',
    );
  });

  it('resolves the AniDB id once and caches it in Valkey', async () => {
    const requestRemoteResource = answerWith(kitsuMappingsBody);
    const readAnidbId = createAnidbIdReader({requestRemoteResource});

    await readAnidbId('7442');
    const cachedAnidbId = await readAnidbId('7442');

    expect(cachedAnidbId).toBe('9541');
    expect(requestRemoteResource).toHaveBeenCalledTimes(1);
    await expect(redis.ttl(ANIDB_CACHE_KEY)).resolves.toBeGreaterThan(
      KITSU_MAPPING_REFRESH_TTL,
    );
  });

  it('answers null for an anime Kitsu does not map to AniDB', async () => {
    const requestRemoteResource = answerWith({
      data: [kitsuMappingsBody.data[0]],
    });
    const readAnidbId = createAnidbIdReader({requestRemoteResource});

    await expect(readAnidbId('7442')).resolves.toBeNull();
  });

  it('answers null when no well-formed mapping page names AniDB', async () => {
    const requestRemoteResource = vi
      .fn()
      .mockResolvedValueOnce({status: 200, headers: {}, body: fullPage})
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        body: {data: [kitsuMappingsBody.data[0]]},
      });
    const readAnidbId = createAnidbIdReader({requestRemoteResource});

    await expect(readAnidbId('7445')).resolves.toBeNull();
    expect(requestRemoteResource).toHaveBeenCalledTimes(2);
  });

  it('fails the lookup on a Kitsu body of another shape, and asks again next time', async () => {
    const requestRemoteResource = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        body: {errors: [{title: 'Changed'}]},
      })
      .mockResolvedValue({status: 200, headers: {}, body: kitsuMappingsBody});
    const readAnidbId = createAnidbIdReader({requestRemoteResource});

    await expect(readAnidbId('7446')).rejects.toBeInstanceOf(
      SourceUnavailableError,
    );
    await expect(readAnidbId('7446')).resolves.toBe('9541');
    expect(requestRemoteResource).toHaveBeenCalledTimes(2);
  });

  it('fails the lookup when Kitsu fails, and asks again next time', async () => {
    const requestRemoteResource = vi
      .fn()
      .mockRejectedValueOnce(
        new SourceUnavailableError({
          subtitleSource: CatalogService.KITSU,
          cause: new Error('ECONNRESET'),
        }),
      )
      .mockResolvedValue({status: 200, headers: {}, body: kitsuMappingsBody});
    const readAnidbId = createAnidbIdReader({requestRemoteResource});

    await expect(readAnidbId('7442')).rejects.toBeInstanceOf(
      SourceUnavailableError,
    );
    await expect(readAnidbId('7442')).resolves.toBe('9541');
    expect(requestRemoteResource).toHaveBeenCalledTimes(2);
  });
});
