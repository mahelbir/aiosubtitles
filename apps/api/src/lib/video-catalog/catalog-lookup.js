import {RedisCache} from '../../redis/cache.js';

export function createCatalogLookup({
  prefix,
  ttl,
  requestRemoteResource,
  buildRequest,
  toCatalogValue,
}) {
  const catalogCache = new RedisCache({
    prefix,
    ttl: () => ttl,
    load: async catalogKey => {
      const {body} = await requestRemoteResource(buildRequest(catalogKey));
      return toCatalogValue(body);
    },
  });
  return {
    readCatalogValue: catalogKey => catalogCache.get(catalogKey),
    reloadCatalogValue: catalogKey => catalogCache.reload(catalogKey),
  };
}
