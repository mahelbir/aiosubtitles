import {describe, expect, it, vi} from 'vitest';
import {
  buildCatalogMetaRequest,
  parseCatalogRuntimeMs,
  toCatalogMeta,
} from '../../src/lib/video-catalog/catalog-meta.js';
import {CatalogService} from '../../src/lib/video-catalog/catalog-service.js';
import {
  buildKitsuMappingsRequest,
  buildKitsuMetaRequest,
  loadKitsuSiteId,
  pickKitsuVideo,
  toAnilistId,
  toKitsuMapping,
} from '../../src/lib/video-catalog/kitsu-mapping.js';
import {parseStremioVideoId} from '../../src/lib/video-catalog/parse-video-id.js';

const kitsuMetaBody = {
  meta: {
    id: 'kitsu:12',
    type: 'series',
    imdb_id: 'tt0388629',
    videos: [
      {id: 'kitsu:12:1', episode: 1, imdbSeason: 1, imdbEpisode: 1},
      {id: 'kitsu:12:3', episode: 3, imdbSeason: 2, imdbEpisode: 1},
      {id: 'kitsu:12:4', episode: 4},
    ],
  },
};

describe('parseStremioVideoId', () => {
  it('reads an IMDb episode id', () => {
    expect(parseStremioVideoId('tt0944947:1:2')).toEqual({
      videoIdKind: 'imdb',
      imdbId: 'tt0944947',
      kitsuId: null,
      catalogSeason: 1,
      catalogEpisode: 2,
    });
  });

  it('reads an IMDb movie id', () => {
    expect(parseStremioVideoId('tt0133093')).toEqual({
      videoIdKind: 'imdb',
      imdbId: 'tt0133093',
      kitsuId: null,
      catalogSeason: null,
      catalogEpisode: null,
    });
  });

  it('reads a Kitsu episode id without a season', () => {
    expect(parseStremioVideoId('kitsu:7442:5')).toEqual({
      videoIdKind: 'kitsu',
      imdbId: null,
      kitsuId: '7442',
      catalogSeason: null,
      catalogEpisode: 5,
    });
  });

  it('reads a Kitsu id without an episode', () => {
    expect(parseStremioVideoId('kitsu:7442')).toEqual({
      videoIdKind: 'kitsu',
      imdbId: null,
      kitsuId: '7442',
      catalogSeason: null,
      catalogEpisode: null,
    });
  });

  it('reads any other catalog id as other', () => {
    expect(parseStremioVideoId('mal:1:1')).toEqual({
      videoIdKind: 'other',
      imdbId: null,
      kitsuId: null,
      catalogSeason: null,
      catalogEpisode: null,
    });
  });
});

describe('parseCatalogRuntimeMs', () => {
  it('reads minutes', () => {
    expect(parseCatalogRuntimeMs('142 min')).toBe(8520000);
  });

  it('reads hours and minutes', () => {
    expect(parseCatalogRuntimeMs('1h 2min')).toBe(3720000);
  });

  it('answers null without a runtime', () => {
    expect(parseCatalogRuntimeMs(null)).toBeNull();
  });
});

describe('the Cinemeta lookup', () => {
  it('requests the meta of the video type and IMDb id', () => {
    expect(
      buildCatalogMetaRequest({videoType: 'movie', imdbId: 'tt0133093'}),
    ).toMatchObject({
      url: 'https://v3-cinemeta.strem.io/meta/movie/tt0133093.json',
    });
  });

  it('maps the runtime, the TVDB id, the title and the first year', () => {
    expect(
      toCatalogMeta({
        meta: {
          id: 'tt0944947',
          name: 'Game of Thrones',
          runtime: '57 min',
          tvdb_id: 121361,
          year: '2011–2019',
        },
      }),
    ).toEqual({
      catalogDurationMs: 3420000,
      tvdbId: '121361',
      catalogTitle: 'Game of Thrones',
      catalogYear: 2011,
    });
  });

  it.each([
    ['1999', 1999],
    ['2016–', 2016],
    ['unknown', null],
    [1999, 1999],
    [19999, null],
  ])('reads the year %s as %s', (year, catalogYear) => {
    expect(toCatalogMeta({meta: {id: 'tt0133093', year}})?.catalogYear).toBe(
      catalogYear,
    );
  });

  it('falls back to the release info for the year', () => {
    expect(
      toCatalogMeta({meta: {id: 'tt0944947', releaseInfo: '2011–2019'}})
        ?.catalogYear,
    ).toBe(2011);
  });

  it('prefers the year over the release info', () => {
    expect(
      toCatalogMeta({
        meta: {id: 'tt0944947', year: '2011–2019', releaseInfo: '2012'},
      })?.catalogYear,
    ).toBe(2011);
  });

  it('maps a meta without runtime, TVDB id, title or year to nulls', () => {
    expect(toCatalogMeta({meta: {id: 'tt0133093'}})).toEqual({
      catalogDurationMs: null,
      tvdbId: null,
      catalogTitle: null,
      catalogYear: null,
    });
  });
});

describe('the Kitsu lookup', () => {
  it('requests the series meta of the Kitsu id', () => {
    expect(buildKitsuMetaRequest('7442')).toMatchObject({
      url: 'https://anime-kitsu.strem.fun/meta/series/kitsu:7442.json',
    });
  });

  it('maps a Kitsu episode to its IMDb season and episode', () => {
    expect(pickKitsuVideo(toKitsuMapping(kitsuMetaBody), 3)).toEqual({
      imdbId: 'tt0388629',
      catalogSeason: 2,
      catalogEpisode: 1,
    });
  });

  it('answers null for an episode without an IMDb mapping', () => {
    const kitsuMapping = toKitsuMapping(kitsuMetaBody);

    expect(pickKitsuVideo(kitsuMapping, 1)).toEqual({
      imdbId: 'tt0388629',
      catalogSeason: 1,
      catalogEpisode: 1,
    });
    expect(pickKitsuVideo(kitsuMapping, 4)).toBeNull();
    expect(pickKitsuVideo(kitsuMapping, 99)).toBeNull();
  });

  it('maps a Kitsu movie to its IMDb id alone', () => {
    const kitsuMapping = toKitsuMapping({
      meta: {id: 'kitsu:1555', type: 'movie', imdb_id: 'tt0245429'},
    });

    expect(pickKitsuVideo(kitsuMapping, null)).toEqual({
      imdbId: 'tt0245429',
      catalogSeason: null,
      catalogEpisode: null,
    });
  });
});

describe('the Kitsu mappings', () => {
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
  const fullPage = {
    data: Array.from({length: 20}, (unused, index) => ({
      id: String(6000 + index),
      type: 'mappings',
      attributes: {externalSite: 'myanimelist/anime', externalId: '52991'},
    })),
  };

  it('asks Kitsu for the mappings of the anime', () => {
    const mappingsRequest = buildKitsuMappingsRequest('46474');
    const mappingsUrl = new URL(mappingsRequest.url);

    expect(mappingsRequest.serviceName).toBe(CatalogService.KITSU);
    expect(mappingsUrl.origin).toBe('https://kitsu.app');
    expect(mappingsUrl.pathname).toBe('/api/edge/anime/46474/mappings');
    expect(mappingsUrl.searchParams.get('page[limit]')).toBe('20');
    expect(mappingsUrl.searchParams.get('page[offset]')).toBe('0');
  });

  it('reads the AniList anime id from the mappings', () => {
    expect(toAnilistId(kitsuMappingsBody)).toBe(154587);
  });

  it('answers null when no mapping names AniList', () => {
    expect(toAnilistId({data: [kitsuMappingsBody.data[0]]})).toBeNull();
    expect(toAnilistId({data: []})).toBeNull();
    expect(toAnilistId(null)).toBeNull();
  });

  it('answers null for an AniList mapping that is no number', () => {
    expect(
      toAnilistId({
        data: [
          {
            id: '5002',
            type: 'mappings',
            attributes: {externalSite: 'anilist/anime', externalId: 'abc'},
          },
        ],
      }),
    ).toBeNull();
  });

  it('follows the mapping pages until the AniList mapping turns up', async () => {
    const requestRemoteResource = vi
      .fn()
      .mockResolvedValueOnce({status: 200, headers: {}, body: fullPage})
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        body: kitsuMappingsBody,
      });

    await expect(
      loadKitsuSiteId('46474', {
        externalSite: 'anilist/anime',
        requestRemoteResource,
      }),
    ).resolves.toBe('154587');
    expect(requestRemoteResource).toHaveBeenCalledTimes(2);
    expect(
      new URL(requestRemoteResource.mock.calls[1][0].url).searchParams.get(
        'page[offset]',
      ),
    ).toBe('20');
  });

  it('stops after three full mapping pages without the mapping', async () => {
    const requestRemoteResource = vi.fn(async () => ({
      status: 200,
      headers: {},
      body: fullPage,
    }));

    await expect(
      loadKitsuSiteId('46474', {
        externalSite: 'anilist/anime',
        requestRemoteResource,
      }),
    ).resolves.toBeNull();
    expect(requestRemoteResource).toHaveBeenCalledTimes(3);
  });

  it('stops at the first short page', async () => {
    const requestRemoteResource = vi.fn(async () => ({
      status: 200,
      headers: {},
      body: {data: [kitsuMappingsBody.data[0]]},
    }));

    await expect(
      loadKitsuSiteId('46474', {
        externalSite: 'anilist/anime',
        requestRemoteResource,
      }),
    ).resolves.toBeNull();
    expect(requestRemoteResource).toHaveBeenCalledTimes(1);
  });
});
