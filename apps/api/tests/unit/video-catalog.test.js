import {describe, expect, it} from 'vitest';
import {
  buildCatalogMetaRequest,
  parseCatalogRuntimeMs,
  toCatalogMeta,
} from '../../src/lib/video-catalog/catalog-meta.js';
import {
  buildKitsuMetaRequest,
  pickKitsuVideo,
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

  it('maps the runtime and the TVDB id', () => {
    expect(
      toCatalogMeta({
        meta: {id: 'tt0944947', runtime: '57 min', tvdb_id: 121361},
      }),
    ).toEqual({catalogDurationMs: 3420000, tvdbId: '121361'});
  });

  it('maps a meta without runtime or TVDB id to nulls', () => {
    expect(toCatalogMeta({meta: {id: 'tt0133093'}})).toEqual({
      catalogDurationMs: null,
      tvdbId: null,
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
