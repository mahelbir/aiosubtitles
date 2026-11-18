import {isNil} from 'es-toolkit';
import {requestRemoteResource as sendRemoteResourceRequest} from '../subtitle-sources/subtitle-source-request.js';
import {createCatalogLookup} from './catalog-lookup.js';
import {CatalogService} from './catalog-service.js';

export const CATALOG_META_TTL = 604800;

const CINEMETA_META_URL = 'https://v3-cinemeta.strem.io/meta';
const RUNTIME_PATTERN = /^\s*(?:(\d+)\s*h)?\s*(?:(\d+)\s*min)?\s*$/i;
const HOUR_MS = 3600000;
const MINUTE_MS = 60000;
const CATALOG_KEY_SEPARATOR = ':';
const YEAR_PATTERN = /^\s*(\d{4})(?!\d)/;

export function buildCatalogMetaRequest({videoType, imdbId}) {
  return {
    serviceName: CatalogService.CINEMETA,
    url: `${CINEMETA_META_URL}/${videoType}/${imdbId}.json`,
  };
}

export function parseCatalogRuntimeMs(runtime) {
  const runtimeMatch =
    typeof runtime === 'string' && runtime.match(RUNTIME_PATTERN);
  if (!runtimeMatch || (!runtimeMatch[1] && !runtimeMatch[2])) {
    return null;
  }
  const [, hourText = '0', minuteText = '0'] = runtimeMatch;
  return Number(hourText) * HOUR_MS + Number(minuteText) * MINUTE_MS;
}

function parseCatalogYear(year) {
  const yearMatch =
    (typeof year === 'string' || typeof year === 'number') &&
    String(year).match(YEAR_PATTERN);
  return yearMatch ? Number(yearMatch[1]) : null;
}

export function toCatalogMeta(metaBody) {
  const meta = metaBody?.meta;
  if (!meta) {
    return null;
  }
  return {
    catalogDurationMs: parseCatalogRuntimeMs(meta.runtime),
    tvdbId: isNil(meta.tvdb_id) ? null : String(meta.tvdb_id),
    catalogTitle:
      typeof meta.name === 'string' && meta.name.trim() !== ''
        ? meta.name
        : null,
    catalogYear:
      parseCatalogYear(meta.year) ?? parseCatalogYear(meta.releaseInfo),
  };
}

function toCatalogMetaRequest(catalogKey) {
  const separatorIndex = catalogKey.indexOf(CATALOG_KEY_SEPARATOR);
  return buildCatalogMetaRequest({
    videoType: catalogKey.slice(0, separatorIndex),
    imdbId: catalogKey.slice(separatorIndex + 1),
  });
}

export function createCatalogMetaReader({
  requestRemoteResource = sendRemoteResourceRequest,
} = {}) {
  const {readCatalogValue} = createCatalogLookup({
    prefix: 'catalog-meta:v2:',
    ttl: CATALOG_META_TTL,
    requestRemoteResource,
    buildRequest: toCatalogMetaRequest,
    toCatalogValue: toCatalogMeta,
  });
  return ({videoType, imdbId}) =>
    readCatalogValue(`${videoType}${CATALOG_KEY_SEPARATOR}${imdbId}`);
}

export const readCatalogMeta = createCatalogMetaReader();
