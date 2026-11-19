import {identity, isNil} from 'es-toolkit';
import {RedisCache} from '../../redis/cache.js';
import {redis} from '../../redis/index.js';
import {
  SourceRateLimitError,
  SourceUnavailableError,
} from '../subtitle-sources/subtitle-source-errors.js';
import {requestRemoteResource as sendRemoteResourceRequest} from '../subtitle-sources/subtitle-source-request.js';
import {createCatalogLookup} from './catalog-lookup.js';
import {CatalogService} from './catalog-service.js';
import {parseStremioVideoId} from './parse-video-id.js';

export const KITSU_MAPPING_TTL = 2592000;

export const KITSU_MAPPING_REFRESH_TTL = 3600;

const KITSU_MAPPING_REFRESH_PREFIX = 'kitsu-mapping-refresh:v1:';

const KITSU_META_URL = 'https://anime-kitsu.strem.fun/meta/series';

const KITSU_API_URL = 'https://kitsu.app/api/edge';

const KITSU_ANILIST_PREFIX = 'kitsu-anilist:v1:';

const KITSU_ANIDB_PREFIX = 'kitsu-anidb:v1:';

const KITSU_MAPPINGS_PAGE_LIMIT = 20;

const KITSU_MAPPINGS_PAGES_MAX = 3;

const ANILIST_SITE = 'anilist/anime';

const ANIDB_SITE = 'anidb';

const KITSU_SITE_ID_PATTERN = /^\d+$/;

export function buildKitsuMetaRequest(kitsuId) {
  return {
    serviceName: CatalogService.KITSU,
    url: `${KITSU_META_URL}/kitsu:${kitsuId}.json`,
  };
}

function readKitsuEpisode(kitsuVideo) {
  return Number.isInteger(kitsuVideo.episode)
    ? kitsuVideo.episode
    : parseStremioVideoId(String(kitsuVideo.id ?? '')).catalogEpisode;
}

export function toKitsuMapping(metaBody) {
  const meta = metaBody?.meta;
  if (!meta) {
    return null;
  }
  const kitsuVideos = (meta.videos ?? [])
    .filter(
      kitsuVideo =>
        Number.isInteger(kitsuVideo.imdbSeason) &&
        Number.isInteger(kitsuVideo.imdbEpisode),
    )
    .map(kitsuVideo => ({
      kitsuEpisode: readKitsuEpisode(kitsuVideo),
      imdbId: kitsuVideo.imdb_id ?? meta.imdb_id ?? null,
      catalogSeason: kitsuVideo.imdbSeason,
      catalogEpisode: kitsuVideo.imdbEpisode,
    }))
    .filter(
      kitsuVideo => kitsuVideo.kitsuEpisode !== null && kitsuVideo.imdbId,
    );
  return {imdbId: meta.imdb_id ?? null, kitsuVideos};
}

export function pickKitsuVideo(kitsuMapping, kitsuEpisode) {
  if (!kitsuMapping) {
    return null;
  }
  if (isNil(kitsuEpisode)) {
    return kitsuMapping.imdbId
      ? {imdbId: kitsuMapping.imdbId, catalogSeason: null, catalogEpisode: null}
      : null;
  }
  const kitsuVideo = kitsuMapping.kitsuVideos.find(
    mappedVideo => mappedVideo.kitsuEpisode === kitsuEpisode,
  );
  return kitsuVideo
    ? {
        imdbId: kitsuVideo.imdbId,
        catalogSeason: kitsuVideo.catalogSeason,
        catalogEpisode: kitsuVideo.catalogEpisode,
      }
    : null;
}

async function claimKitsuMappingRefresh(kitsuId) {
  try {
    const isClaimed = await redis.set(
      `${KITSU_MAPPING_REFRESH_PREFIX}${kitsuId}`,
      '1',
      'EX',
      KITSU_MAPPING_REFRESH_TTL,
      'NX',
    );
    return Boolean(isClaimed);
  } catch {
    return false;
  }
}

export function createKitsuVideoResolver({
  requestRemoteResource = sendRemoteResourceRequest,
} = {}) {
  const {readCatalogValue, refreshCatalogValue} = createCatalogLookup({
    prefix: 'kitsu-mapping:v1:',
    ttl: KITSU_MAPPING_TTL,
    requestRemoteResource,
    buildRequest: buildKitsuMetaRequest,
    toCatalogValue: toKitsuMapping,
  });
  return async ({kitsuId, kitsuEpisode}) => {
    const kitsuMapping = await readCatalogValue(kitsuId);
    const kitsuVideo = pickKitsuVideo(kitsuMapping, kitsuEpisode);
    if (
      kitsuVideo ||
      !kitsuMapping ||
      isNil(kitsuEpisode) ||
      !(await claimKitsuMappingRefresh(kitsuId))
    ) {
      return kitsuVideo;
    }
    return pickKitsuVideo(await refreshCatalogValue(kitsuId), kitsuEpisode);
  };
}

export const resolveKitsuVideo = createKitsuVideoResolver();

export function buildKitsuMappingsRequest(kitsuId, pageOffset = 0) {
  const searchParams = new URLSearchParams({
    'page[limit]': String(KITSU_MAPPINGS_PAGE_LIMIT),
    'page[offset]': String(pageOffset),
  });
  return {
    serviceName: CatalogService.KITSU,
    url: `${KITSU_API_URL}/anime/${encodeURIComponent(kitsuId)}/mappings?${searchParams}`,
  };
}

function toKitsuUnavailableError(reason) {
  return new SourceUnavailableError({
    subtitleSource: CatalogService.KITSU,
    cause: new Error(reason),
  });
}

function listKitsuMappings(mappingsBody) {
  if (mappingsBody === null) {
    return [];
  }
  if (!Array.isArray(mappingsBody?.data)) {
    throw toKitsuUnavailableError('Kitsu mappings are not a list.');
  }
  return mappingsBody.data;
}

async function requestKitsuMappings(
  kitsuId,
  pageOffset,
  requestRemoteResource,
) {
  try {
    return await requestRemoteResource(
      buildKitsuMappingsRequest(kitsuId, pageOffset),
    );
  } catch (error) {
    if (error instanceof SourceRateLimitError) {
      throw toKitsuUnavailableError('Kitsu rate limit.');
    }
    throw error;
  }
}

function findKitsuSiteId(kitsuMappings, externalSite) {
  const siteMapping = kitsuMappings.find(
    kitsuMapping => kitsuMapping?.attributes?.externalSite === externalSite,
  );
  const siteId = String(siteMapping?.attributes?.externalId ?? '').trim();
  return KITSU_SITE_ID_PATTERN.test(siteId) ? siteId : null;
}

function toAnilistNumber(anilistId) {
  return anilistId === null ? null : Number(anilistId);
}

export async function loadKitsuSiteId(
  kitsuId,
  {externalSite, requestRemoteResource},
) {
  for (
    let pageOffset = 0;
    pageOffset < KITSU_MAPPINGS_PAGE_LIMIT * KITSU_MAPPINGS_PAGES_MAX;
    pageOffset += KITSU_MAPPINGS_PAGE_LIMIT
  ) {
    const {body} = await requestKitsuMappings(
      kitsuId,
      pageOffset,
      requestRemoteResource,
    );
    const kitsuMappings = listKitsuMappings(body);
    const siteId = findKitsuSiteId(kitsuMappings, externalSite);
    if (siteId !== null || kitsuMappings.length < KITSU_MAPPINGS_PAGE_LIMIT) {
      return siteId;
    }
  }
  return null;
}

function createKitsuSiteIdReader({
  prefix,
  externalSite,
  toSiteValue,
  requestRemoteResource,
}) {
  const siteIdCache = new RedisCache({
    prefix,
    ttl: () => KITSU_MAPPING_TTL,
    load: async kitsuId =>
      toSiteValue(
        await loadKitsuSiteId(kitsuId, {externalSite, requestRemoteResource}),
      ),
  });
  return kitsuId => siteIdCache.get(kitsuId);
}

export function createAnilistIdReader({
  requestRemoteResource = sendRemoteResourceRequest,
} = {}) {
  return createKitsuSiteIdReader({
    prefix: KITSU_ANILIST_PREFIX,
    externalSite: ANILIST_SITE,
    toSiteValue: toAnilistNumber,
    requestRemoteResource,
  });
}

export function createAnidbIdReader({
  requestRemoteResource = sendRemoteResourceRequest,
} = {}) {
  return createKitsuSiteIdReader({
    prefix: KITSU_ANIDB_PREFIX,
    externalSite: ANIDB_SITE,
    toSiteValue: identity,
    requestRemoteResource,
  });
}

export const readKitsuAnilistId = createAnilistIdReader();

export const readKitsuAnidbId = createAnidbIdReader();
