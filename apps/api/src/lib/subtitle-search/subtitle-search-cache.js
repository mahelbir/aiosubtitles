import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {config} from '../../config/index.js';
import {redis} from '../../redis/index.js';

export const SUBTITLE_SEARCH_LOCK_TTL = 60;

const SEARCH_CACHE_PREFIX = 'subtitle-search-cache:v1:';
const SEARCH_LOCK_PREFIX = 'subtitle-search-lock:v1:';
const SEARCH_LOCK_POLL_MS = 100;

redis.defineCommand('releaseSubtitleSearchLock', {
  numberOfKeys: 1,
  lua: `
    if redis.call('GET', KEYS[1]) == ARGV[1] then
      return redis.call('DEL', KEYS[1])
    end
    return 0
  `,
});

export function toSearchCacheParts({
  client,
  subtitleSource,
  videoId,
  languageCode,
  videoHash,
}) {
  const searchCacheParts = [subtitleSource, videoId, languageCode];
  if (client.isSearchHashSensitive && videoHash) {
    searchCacheParts.push(videoHash);
  }
  return searchCacheParts.join(':');
}

export async function readSearchCacheEntries(searchCachePartsList, nowMs) {
  const storedEntries = await redis.mget(
    searchCachePartsList.map(
      searchCacheParts => `${SEARCH_CACHE_PREFIX}${searchCacheParts}`,
    ),
  );
  return storedEntries.map(storedEntry => {
    if (storedEntry === null) {
      return null;
    }
    const searchCacheEntry = JSON.parse(storedEntry);
    const entryAgeMs = nowMs - searchCacheEntry.searchFetchedAt;
    if (entryAgeMs >= config.subtitleSearchCacheStaleTtl * 1000) {
      return null;
    }
    return {
      ...searchCacheEntry,
      isFresh: entryAgeMs < config.subtitleSearchCacheFreshTtl * 1000,
    };
  });
}

export async function writeSearchCacheEntries(searchCacheWrites, nowMs) {
  const pipeline = redis.pipeline();
  for (const {searchCacheParts, searchResults} of searchCacheWrites) {
    pipeline.set(
      `${SEARCH_CACHE_PREFIX}${searchCacheParts}`,
      JSON.stringify({searchFetchedAt: nowMs, searchResults}),
      'EX',
      config.subtitleSearchCacheStaleTtl,
    );
  }
  await pipeline.exec();
}

export async function acquireSearchLock(searchCacheParts) {
  const lockToken = randomUUID();
  const isAcquired = await redis.set(
    `${SEARCH_LOCK_PREFIX}${searchCacheParts}`,
    lockToken,
    'EX',
    SUBTITLE_SEARCH_LOCK_TTL,
    'NX',
  );
  return isAcquired ? lockToken : null;
}

export function releaseSearchLock(searchCacheParts, lockToken) {
  return redis.releaseSubtitleSearchLock(
    `${SEARCH_LOCK_PREFIX}${searchCacheParts}`,
    lockToken,
  );
}

export async function waitForSearchLocks(searchCachePartsList, signal) {
  const lockKeys = searchCachePartsList.map(
    searchCacheParts => `${SEARCH_LOCK_PREFIX}${searchCacheParts}`,
  );
  const waitEndsAt =
    Date.now() +
    (signal ? SUBTITLE_SEARCH_LOCK_TTL * 1000 : config.subtitleSearchDeadline);
  while (!signal?.aborted && Date.now() < waitEndsAt) {
    if ((await redis.exists(lockKeys)) === 0) {
      return;
    }
    try {
      await delay(SEARCH_LOCK_POLL_MS, undefined, {signal});
    } catch {
      return;
    }
  }
}
