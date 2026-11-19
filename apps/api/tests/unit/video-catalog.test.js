import {describe, expect, it, vi} from 'vitest';
import {
  SourceRateLimitError,
  SourceUnavailableError,
} from '../../src/lib/subtitle-sources/subtitle-source-errors.js';
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
  toKitsuMapping,
} from '../../src/lib/video-catalog/kitsu-mapping.js';
import {parseStremioVideoId} from '../../src/lib/video-catalog/parse-video-id.js';
import {resolveVideoEpisode} from '../../src/lib/video-catalog/resolve-video-episode.js';

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
      kitsuEpisode: null,
    });
  });

  it('reads an IMDb movie id', () => {
    expect(parseStremioVideoId('tt0133093')).toEqual({
      videoIdKind: 'imdb',
      imdbId: 'tt0133093',
      kitsuId: null,
      catalogSeason: null,
      catalogEpisode: null,
      kitsuEpisode: null,
    });
  });

  it('reads a Kitsu episode id without a season', () => {
    expect(parseStremioVideoId('kitsu:7442:5')).toEqual({
      videoIdKind: 'kitsu',
      imdbId: null,
      kitsuId: '7442',
      catalogSeason: null,
      catalogEpisode: 5,
      kitsuEpisode: 5,
    });
  });

  it('reads a Kitsu id without an episode', () => {
    expect(parseStremioVideoId('kitsu:7442')).toEqual({
      videoIdKind: 'kitsu',
      imdbId: null,
      kitsuId: '7442',
      catalogSeason: null,
      catalogEpisode: null,
      kitsuEpisode: null,
    });
  });

  it('reads any other catalog id as other', () => {
    expect(parseStremioVideoId('mal:1:1')).toEqual({
      videoIdKind: 'other',
      imdbId: null,
      kitsuId: null,
      catalogSeason: null,
      catalogEpisode: null,
      kitsuEpisode: null,
    });
  });
});

describe('resolveVideoEpisode', () => {
  it('carries the anime episode beside the IMDb pair of a Kitsu video', async () => {
    expect(
      await resolveVideoEpisode({
        videoId: 'kitsu:7442:5',
        resolveKitsuVideo: async () => ({
          imdbId: 'tt2560140',
          catalogSeason: 1,
          catalogEpisode: 17,
        }),
      }),
    ).toEqual({
      imdbId: 'tt2560140',
      catalogSeason: 1,
      catalogEpisode: 17,
      kitsuEpisode: 5,
      isEpisodeResolved: true,
    });
  });

  it('resolves a Kitsu video with no IMDb mapping to its anime episode alone', async () => {
    expect(
      await resolveVideoEpisode({
        videoId: 'kitsu:7442:5',
        resolveKitsuVideo: async () => null,
      }),
    ).toEqual({
      imdbId: null,
      catalogSeason: null,
      catalogEpisode: null,
      kitsuEpisode: 5,
      isEpisodeResolved: true,
    });
  });

  it('leaves the episode unresolved when the Kitsu lookup fails', async () => {
    expect(
      await resolveVideoEpisode({
        videoId: 'kitsu:7442:5',
        resolveKitsuVideo: async () => {
          throw new Error('The Kitsu lookup broke.');
        },
      }),
    ).toEqual({
      imdbId: null,
      catalogSeason: null,
      catalogEpisode: null,
      kitsuEpisode: 5,
      isEpisodeResolved: false,
    });
  });

  it('gives an IMDb video no anime episode', async () => {
    expect(
      await resolveVideoEpisode({
        videoId: 'tt0944947:1:2',
        resolveKitsuVideo: vi.fn(),
      }),
    ).toMatchObject({catalogSeason: 1, catalogEpisode: 2, kitsuEpisode: null});
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

  function loadSiteIdOf(body, externalSite) {
    return loadKitsuSiteId('46474', {
      externalSite,
      requestRemoteResource: async () => ({status: 200, headers: {}, body}),
    });
  }

  it('reads the AniList anime id from the mappings', async () => {
    await expect(
      loadSiteIdOf(kitsuMappingsBody, 'anilist/anime'),
    ).resolves.toBe('154587');
  });

  it('answers null when no mapping names AniList', async () => {
    for (const body of [
      {data: [kitsuMappingsBody.data[0]]},
      {data: []},
      null,
    ]) {
      await expect(loadSiteIdOf(body, 'anilist/anime')).resolves.toBeNull();
    }
  });

  it('answers null for an AniList mapping that is no number', async () => {
    await expect(
      loadSiteIdOf(
        {
          data: [
            {
              id: '5002',
              type: 'mappings',
              attributes: {externalSite: 'anilist/anime', externalId: 'abc'},
            },
          ],
        },
        'anilist/anime',
      ),
    ).resolves.toBeNull();
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

  it('reads the AniDB anime id from the mappings', async () => {
    await expect(
      loadSiteIdOf(
        {
          data: [
            kitsuMappingsBody.data[0],
            {
              id: '5003',
              type: 'mappings',
              attributes: {externalSite: 'anidb', externalId: '9541'},
            },
          ],
        },
        'anidb',
      ),
    ).resolves.toBe('9541');
    await expect(loadSiteIdOf(kitsuMappingsBody, 'anidb')).resolves.toBeNull();
    await expect(loadSiteIdOf(null, 'anidb')).resolves.toBeNull();
  });

  it('treats a body that is not a mapping list as an unavailable Kitsu', async () => {
    await expect(
      loadSiteIdOf({errors: [{title: 'Changed'}]}, 'anilist/anime'),
    ).rejects.toBeInstanceOf(SourceUnavailableError);
    await expect(
      loadSiteIdOf({data: {id: '5002'}}, 'anidb'),
    ).rejects.toBeInstanceOf(SourceUnavailableError);
  });

  it('fails the lookup on a Kitsu body of another shape', async () => {
    const requestRemoteResource = vi.fn(async () => ({
      status: 200,
      headers: {},
      body: {errors: [{title: 'Changed'}]},
    }));

    await expect(
      loadKitsuSiteId('46474', {
        externalSite: 'anilist/anime',
        requestRemoteResource,
      }),
    ).rejects.toBeInstanceOf(SourceUnavailableError);
  });

  it('answers no mapping for an anime Kitsu does not know', async () => {
    const requestRemoteResource = vi.fn(async () => ({
      status: 404,
      headers: {},
      body: null,
    }));

    await expect(
      loadKitsuSiteId('46474', {
        externalSite: 'anidb',
        requestRemoteResource,
      }),
    ).resolves.toBeNull();
    expect(requestRemoteResource).toHaveBeenCalledTimes(1);
  });

  it("turns Kitsu's own rate limit into an unavailable lookup", async () => {
    const requestRemoteResource = vi.fn(async () => {
      throw new SourceRateLimitError({
        subtitleSource: CatalogService.KITSU,
        retryAfterMs: 60000,
      });
    });

    const lookup = loadKitsuSiteId('46474', {
      externalSite: 'anidb',
      requestRemoteResource,
    });

    await expect(lookup).rejects.toBeInstanceOf(SourceUnavailableError);
    await expect(lookup).rejects.not.toBeInstanceOf(SourceRateLimitError);
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
