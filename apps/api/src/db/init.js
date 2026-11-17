import {applyAssociations, applyScopes} from './models/index.js';
import {applyCacheHooks} from './hooks/cache.js';

export function initializeDatabase({cacheHooks = true} = {}) {
  applyAssociations();
  applyScopes();
  if (cacheHooks) {
    applyCacheHooks();
  }
}
