import {describe, expect, it, vi} from 'vitest';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {SourceUnavailableError} from '../../src/lib/subtitle-sources/subtitle-source-errors.js';
import {createCatalogMetaReader} from '../../src/lib/video-catalog/catalog-meta.js';
import {CatalogService} from '../../src/lib/video-catalog/catalog-service.js';
import {
  KITSU_MAPPING_REFRESH_TTL,
  createKitsuVideoResolver,
} from '../../src/lib/video-catalog/kitsu-mapping.js';
import {redis} from '../../src/redis/index.js';

const KITSU_META_URL =
  'https://anime-kitsu.strem.fun/meta/series/kitsu:7442.json';

const kitsuMetaBody = {
  meta: {
    id: 'kitsu:7442',
    type: 'series',
    imdb_id: 'tt2560140',
    videos: [
      {id: 'kitsu:7442:4', episode: 4, imdbSeason: 1, imdbEpisode: 4},
      {id: 'kitsu:7442:5', episode: 5, imdbSeason: 1, imdbEpisode: 5},
    ],
  },
};

function withSixthEpisode(metaBody) {
  return {
    meta: {
      ...metaBody.meta,
      videos: [
        ...metaBody.meta.videos,
        {id: 'kitsu:7442:6', episode: 6, imdbSeason: 1, imdbEpisode: 6},
      ],
    },
  };
}

function answerWith(body) {
  return vi.fn(async () => ({status: 200, headers: {}, body}));
}

describe('the Kitsu mapping', () => {
  it('maps kitsu:7442:5 to its IMDb season and episode', async () => {
    const requestRemoteResource = answerWith(kitsuMetaBody);
    const resolveKitsuVideo = createKitsuVideoResolver({requestRemoteResource});

    await expect(
      resolveKitsuVideo({kitsuId: '7442', kitsuEpisode: 5}),
    ).resolves.toEqual({
      imdbId: 'tt2560140',
      catalogSeason: 1,
      catalogEpisode: 5,
    });
    expect(requestRemoteResource).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceName: CatalogService.KITSU,
        url: KITSU_META_URL,
      }),
    );
  });

  it('re-resolves an episode the cached mapping lacks and caches the result', async () => {
    const requestRemoteResource = vi
      .fn()
      .mockResolvedValueOnce({status: 200, headers: {}, body: kitsuMetaBody})
      .mockResolvedValue({
        status: 200,
        headers: {},
        body: withSixthEpisode(kitsuMetaBody),
      });
    const resolveKitsuVideo = createKitsuVideoResolver({requestRemoteResource});

    await resolveKitsuVideo({kitsuId: '7442', kitsuEpisode: 5});
    const newEpisode = await resolveKitsuVideo({
      kitsuId: '7442',
      kitsuEpisode: 6,
    });
    const cachedNewEpisode = await resolveKitsuVideo({
      kitsuId: '7442',
      kitsuEpisode: 6,
    });

    expect(newEpisode).toEqual({
      imdbId: 'tt2560140',
      catalogSeason: 1,
      catalogEpisode: 6,
    });
    expect(cachedNewEpisode).toEqual(newEpisode);
    expect(requestRemoteResource).toHaveBeenCalledTimes(2);
    await expect(redis.ttl('kitsu-mapping:v1:7442')).resolves.toBeGreaterThan(
      KITSU_MAPPING_REFRESH_TTL,
    );
  });

  it('re-resolves a still missing episode once per refresh window', async () => {
    const requestRemoteResource = answerWith(kitsuMetaBody);
    const resolveKitsuVideo = createKitsuVideoResolver({requestRemoteResource});

    await resolveKitsuVideo({kitsuId: '7442', kitsuEpisode: 5});
    const missingEpisodes = [
      await resolveKitsuVideo({kitsuId: '7442', kitsuEpisode: 99}),
      await resolveKitsuVideo({kitsuId: '7442', kitsuEpisode: 99}),
    ];

    expect(missingEpisodes).toEqual([null, null]);
    expect(requestRemoteResource).toHaveBeenCalledTimes(2);
    await expect(
      resolveKitsuVideo({kitsuId: '7442', kitsuEpisode: 4}),
    ).resolves.toMatchObject({catalogEpisode: 4});
    expect(requestRemoteResource).toHaveBeenCalledTimes(2);
  });

  it('caches the mapping', async () => {
    const requestRemoteResource = answerWith(kitsuMetaBody);
    const resolveKitsuVideo = createKitsuVideoResolver({requestRemoteResource});

    await resolveKitsuVideo({kitsuId: '7442', kitsuEpisode: 5});
    const secondVideo = await resolveKitsuVideo({
      kitsuId: '7442',
      kitsuEpisode: 4,
    });

    expect(secondVideo).toEqual({
      imdbId: 'tt2560140',
      catalogSeason: 1,
      catalogEpisode: 4,
    });
    expect(requestRemoteResource).toHaveBeenCalledTimes(1);
  });

  it('fails the lookup, rather than answering no mapping, when the Kitsu addon fails', async () => {
    const requestRemoteResource = vi.fn(async () => {
      throw new SourceUnavailableError({
        subtitleSource: SubtitleSource.OPENSUBTITLES_V3,
        cause: new Error('ECONNRESET'),
      });
    });
    const resolveKitsuVideo = createKitsuVideoResolver({requestRemoteResource});

    await expect(
      resolveKitsuVideo({kitsuId: '7442', kitsuEpisode: 5}),
    ).rejects.toBeInstanceOf(SourceUnavailableError);
    expect(requestRemoteResource).toHaveBeenCalledTimes(1);
  });
});

describe('the catalog meta', () => {
  it('reads the duration, TVDB id and title once per video', async () => {
    const requestRemoteResource = answerWith({
      meta: {
        id: 'tt0944947',
        name: 'Game of Thrones',
        runtime: '57 min',
        tvdb_id: 121361,
        year: '2011–2019',
      },
    });
    const readCatalogMeta = createCatalogMetaReader({requestRemoteResource});

    await readCatalogMeta({videoType: 'series', imdbId: 'tt0944947'});
    const catalogMeta = await readCatalogMeta({
      videoType: 'series',
      imdbId: 'tt0944947',
    });

    expect(catalogMeta).toEqual({
      catalogDurationMs: 3420000,
      tvdbId: '121361',
      catalogTitle: 'Game of Thrones',
      catalogYear: 2011,
    });
    await expect(
      redis.exists('catalog-meta:v2:series:tt0944947'),
    ).resolves.toBe(1);
    expect(requestRemoteResource).toHaveBeenCalledTimes(1);
    expect(requestRemoteResource).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceName: CatalogService.CINEMETA,
        url: 'https://v3-cinemeta.strem.io/meta/series/tt0944947.json',
      }),
    );
  });
});
