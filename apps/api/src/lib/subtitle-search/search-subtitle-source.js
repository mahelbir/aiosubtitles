import {createLogger} from '../logger.js';
import {waitForAbort} from '../shutdown-deadline.js';
import {persistSearchHits} from '../subtitle-store/persist-search-hits.js';
import {recordSubtitleSourceFailure} from '../record-subtitle-source-failure.js';
import {toCandidateCredentials} from '../subtitle-source-credentials.js';
import {
  acquireSearchLock,
  readSearchCacheEntries,
  releaseSearchLock,
  toSearchCacheParts,
  waitForSearchLocks,
  writeSearchCacheEntries,
} from './subtitle-search-cache.js';
import {readSubtitleSourceBreaker} from './subtitle-source-breaker.js';

const logger = createLogger('subtitle-search');
const pendingSearches = new Set();

function trackPending(pendingPromise) {
  pendingSearches.add(pendingPromise);
  const forgetPending = () => pendingSearches.delete(pendingPromise);
  pendingPromise.then(forgetPending, forgetPending);
  return pendingPromise;
}

function logSearchFailure(subtitleSource, error, message) {
  logger.warn({subtitleSource, errorName: error?.name}, message);
}

export async function drainPendingSearches({signal} = {}) {
  const drainWindow = signal ? waitForAbort(signal) : null;
  while (pendingSearches.size > 0 && !signal?.aborted) {
    await Promise.race(
      [Promise.allSettled([...pendingSearches]), drainWindow].filter(Boolean),
    );
  }
}

export function searchSubtitleSource(searchOptions) {
  return trackPending(
    runSubtitleSourceSearch(searchOptions).catch(error => {
      logSearchFailure(
        searchOptions.client.subtitleSource,
        error,
        'Subtitle source search failed.',
      );
      return [];
    }),
  );
}

async function runSubtitleSourceSearch({
  client,
  searchQuery,
  credentials,
  hasConfiguredCredential,
  signal,
  nowMs = Date.now(),
}) {
  const {subtitleSource} = client;
  const startedAtMs = Date.now();
  const readNowMs = () => nowMs + Date.now() - startedAtMs;
  const languageSearches = searchQuery.languageCodes.map(languageCode => ({
    languageCode,
    searchCacheParts: toSearchCacheParts({
      client,
      subtitleSource,
      videoId: searchQuery.videoId,
      languageCode,
      videoHash: searchQuery.videoHash,
    }),
  }));
  const [searchCacheEntries, subtitleSourceBreaker] = await Promise.all([
    readSearchCacheEntries(
      languageSearches.map(({searchCacheParts}) => searchCacheParts),
      nowMs,
    ),
    readSubtitleSourceBreaker(subtitleSource, nowMs),
  ]);
  const cachedHits = searchCacheEntries.flatMap(
    searchCacheEntry => searchCacheEntry?.searchResults ?? [],
  );
  const candidateCredentials = toCandidateCredentials({
    credentials,
    hasConfiguredCredential,
    canUseWithoutCredential: client.canSearchWithoutCredential(),
  });
  const canSearch =
    !subtitleSourceBreaker.isOpen && candidateCredentials.length > 0;
  if (!canSearch) {
    return cachedHits;
  }
  const staleSearches = languageSearches.filter(
    (_, languageIndex) => searchCacheEntries[languageIndex]?.isFresh === false,
  );
  const missingSearches = languageSearches.filter(
    (_, languageIndex) => searchCacheEntries[languageIndex] === null,
  );
  const [staleLocks, missingLocks] = await Promise.all([
    acquireSearchLocks(staleSearches),
    acquireSearchLocks(missingSearches),
  ]);
  const [wonStaleLocks, wonMissingLocks] = await Promise.all([
    keepUnsettledLocks(staleLocks, nowMs),
    keepUnsettledLocks(missingLocks, nowMs),
  ]);
  const liveOptions = {
    client,
    searchQuery,
    candidateCredentials,
    nowMs,
    readNowMs,
  };
  if (wonStaleLocks.lockedSearches.length > 0) {
    void trackPending(
      runLiveSearch({
        ...liveOptions,
        lockedSearches: wonStaleLocks.lockedSearches,
      }),
    );
  }
  const [liveHits, waitedHits] = await Promise.all([
    runLiveSearch({
      ...liveOptions,
      lockedSearches: wonMissingLocks.lockedSearches,
    }),
    waitForLockedSearches(
      missingLocks.filter(({lockToken}) => !lockToken),
      {signal, nowMs},
    ),
  ]);
  return [
    ...cachedHits,
    ...wonMissingLocks.settledHits,
    ...liveHits,
    ...waitedHits,
  ];
}

function acquireSearchLocks(languageSearches) {
  return Promise.all(
    languageSearches.map(async languageSearch => ({
      ...languageSearch,
      lockToken: await acquireSearchLock(languageSearch.searchCacheParts),
    })),
  );
}

function releaseSearchLocks(lockedSearches) {
  return Promise.allSettled(
    lockedSearches.map(({searchCacheParts, lockToken}) =>
      releaseSearchLock(searchCacheParts, lockToken),
    ),
  );
}

async function keepUnsettledLocks(searchLocks, nowMs) {
  const wonSearches = searchLocks.filter(({lockToken}) => lockToken);
  if (wonSearches.length === 0) {
    return {lockedSearches: [], settledHits: []};
  }
  const searchCacheEntries = await readSearchCacheEntries(
    wonSearches.map(({searchCacheParts}) => searchCacheParts),
    nowMs,
  );
  const isSettled = languageIndex =>
    searchCacheEntries[languageIndex]?.isFresh === true;
  await releaseSearchLocks(
    wonSearches.filter((_, languageIndex) => isSettled(languageIndex)),
  );
  return {
    lockedSearches: wonSearches.filter(
      (_, languageIndex) => !isSettled(languageIndex),
    ),
    settledHits: searchCacheEntries.flatMap(
      (searchCacheEntry, languageIndex) =>
        isSettled(languageIndex) ? searchCacheEntry.searchResults : [],
    ),
  };
}

async function waitForLockedSearches(lockedSearches, {signal, nowMs}) {
  if (lockedSearches.length === 0) {
    return [];
  }
  const searchCachePartsList = lockedSearches.map(
    ({searchCacheParts}) => searchCacheParts,
  );
  await waitForSearchLocks(searchCachePartsList, signal);
  const searchCacheEntries = await readSearchCacheEntries(
    searchCachePartsList,
    nowMs,
  );
  return searchCacheEntries.flatMap(
    searchCacheEntry => searchCacheEntry?.searchResults ?? [],
  );
}

async function runLiveSearch({
  client,
  searchQuery,
  candidateCredentials,
  nowMs,
  readNowMs,
  lockedSearches,
}) {
  if (lockedSearches.length === 0) {
    return [];
  }
  const languageCodes = lockedSearches.map(({languageCode}) => languageCode);
  try {
    const searchHits = await searchWithCredentials({
      client,
      searchQuery: {...searchQuery, languageCodes},
      candidateCredentials,
      readNowMs,
    });
    if (searchHits === null) {
      return [];
    }
    const languageHits = searchHits.filter(searchHit =>
      languageCodes.includes(searchHit.languageCode),
    );
    await persistSearchHits({
      videoId: searchQuery.videoId,
      searchHits: languageHits,
    });
    await writeSearchCacheEntries(
      lockedSearches.map(({languageCode, searchCacheParts}) => ({
        searchCacheParts,
        searchResults: languageHits.filter(
          searchHit => searchHit.languageCode === languageCode,
        ),
      })),
      nowMs,
    );
    return languageHits;
  } catch (error) {
    logSearchFailure(client.subtitleSource, error, 'Live search failed.');
    return [];
  } finally {
    await releaseSearchLocks(lockedSearches);
  }
}

async function searchWithCredentials({
  client,
  searchQuery,
  candidateCredentials,
  readNowMs,
}) {
  for (const credential of candidateCredentials) {
    try {
      return await client.searchSubtitles(searchQuery, credential);
    } catch (error) {
      const isCredentialRejected = await recordSubtitleSourceFailure({
        client,
        error,
        nowMs: readNowMs(),
      });
      if (isCredentialRejected) {
        continue;
      }
      logSearchFailure(client.subtitleSource, error, 'Source search failed.');
      return null;
    }
  }
  return null;
}
