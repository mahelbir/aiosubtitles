import {createLogger} from '../logger.js';
import {RedisCache} from '../../redis/cache.js';

const logger = createLogger('video-catalog');

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
  const answerOrNull = async catalogRead => {
    try {
      return await catalogRead;
    } catch (error) {
      logger.warn({errorName: error.name, prefix}, 'Catalog lookup failed.');
      return null;
    }
  };
  return {
    readCatalogValue: catalogKey => answerOrNull(catalogCache.get(catalogKey)),
    reloadCatalogValue: catalogKey =>
      answerOrNull(catalogCache.reload(catalogKey)),
  };
}
