import {describe, expect, it, vi} from 'vitest';
import {SourceUnavailableError} from '../../src/lib/subtitle-sources/subtitle-source-errors.js';
import {CatalogService} from '../../src/lib/video-catalog/catalog-service.js';
import {
  KITSU_MAPPING_REFRESH_TTL,
  createAnilistIdReader,
} from '../../src/lib/video-catalog/kitsu-mapping.js';
import {redis} from '../../src/redis/index.js';

const ANILIST_CACHE_KEY = 'kitsu-anilist:v1:46474';

const kitsuMappingsBody = {
  data: [
    {
      id: '5001',
      type: 'mappings',
      attributes: {externalSite: 'myanimelist/anime', externalId: '52991'},
    },
    {
      id: '5002',
      type: 'mappings',
      attributes: {externalSite: 'anilist/anime', externalId: '154587'},
    },
  ],
};

function answerWith(body) {
  return vi.fn(async () => ({status: 200, headers: {}, body}));
}

describe('the Kitsu AniList id', () => {
  it('resolves the AniList id of kitsu:46474 from the Kitsu mappings', async () => {
    const requestRemoteResource = answerWith(kitsuMappingsBody);
    const readAnilistId = createAnilistIdReader({requestRemoteResource});

    await expect(readAnilistId('46474')).resolves.toBe(154587);
    expect(requestRemoteResource).toHaveBeenCalledWith(
      expect.objectContaining({serviceName: CatalogService.KITSU}),
    );
  });

  it('resolves the AniList id once and caches it in Valkey', async () => {
    const requestRemoteResource = answerWith(kitsuMappingsBody);
    const readAnilistId = createAnilistIdReader({requestRemoteResource});

    await readAnilistId('46474');
    const cachedAnilistId = await readAnilistId('46474');

    expect(cachedAnilistId).toBe(154587);
    expect(requestRemoteResource).toHaveBeenCalledTimes(1);
    await expect(redis.ttl(ANILIST_CACHE_KEY)).resolves.toBeGreaterThan(
      KITSU_MAPPING_REFRESH_TTL,
    );
  });

  it('answers null for an anime Kitsu does not map to AniList', async () => {
    const requestRemoteResource = answerWith({
      data: [kitsuMappingsBody.data[0]],
    });
    const readAnilistId = createAnilistIdReader({requestRemoteResource});

    await expect(readAnilistId('46475')).resolves.toBeNull();
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
    const readAnilistId = createAnilistIdReader({requestRemoteResource});

    await expect(readAnilistId('46476')).rejects.toBeInstanceOf(
      SourceUnavailableError,
    );
    await expect(readAnilistId('46476')).resolves.toBe(154587);
    expect(requestRemoteResource).toHaveBeenCalledTimes(2);
  });
});
