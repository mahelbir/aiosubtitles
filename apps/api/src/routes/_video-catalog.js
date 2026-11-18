import {readCatalogMeta} from '../lib/video-catalog/catalog-meta.js';
import {resolveKitsuVideo} from '../lib/video-catalog/kitsu-mapping.js';

const SHIPPED_VIDEO_CATALOG = {readCatalogMeta, resolveKitsuVideo};

export function getVideoCatalog({videoCatalog}) {
  return videoCatalog ?? SHIPPED_VIDEO_CATALOG;
}
