import {Enum} from 'enum-plus';

export const VideoIdKind = Enum({
  IMDB: {value: 'imdb'},
  KITSU: {value: 'kitsu'},
  OTHER: {value: 'other'},
});

const IMDB_ID_PATTERN = /^tt\d+$/;
const CATALOG_ID_PATTERN = /^\d+$/;
const KITSU_PREFIX = 'kitsu';

function toCatalogNumber(part) {
  return part !== undefined && CATALOG_ID_PATTERN.test(part)
    ? Number(part)
    : null;
}

export function parseStremioVideoId(videoId) {
  const [catalogId, ...catalogParts] = videoId.split(':');
  if (IMDB_ID_PATTERN.test(catalogId)) {
    return {
      videoIdKind: VideoIdKind.IMDB,
      imdbId: catalogId,
      kitsuId: null,
      catalogSeason: toCatalogNumber(catalogParts[0]),
      catalogEpisode: toCatalogNumber(catalogParts[1]),
      kitsuEpisode: null,
    };
  }
  if (
    catalogId === KITSU_PREFIX &&
    CATALOG_ID_PATTERN.test(catalogParts[0] ?? '')
  ) {
    const kitsuEpisode = toCatalogNumber(catalogParts[1]);
    return {
      videoIdKind: VideoIdKind.KITSU,
      imdbId: null,
      kitsuId: catalogParts[0],
      catalogSeason: null,
      catalogEpisode: kitsuEpisode,
      kitsuEpisode,
    };
  }
  return {
    videoIdKind: VideoIdKind.OTHER,
    imdbId: null,
    kitsuId: null,
    catalogSeason: null,
    catalogEpisode: null,
    kitsuEpisode: null,
  };
}
