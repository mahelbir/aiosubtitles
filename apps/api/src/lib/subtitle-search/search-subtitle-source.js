import {isNil} from 'es-toolkit';
import {VideoType} from '@repo/shared/constants/video-type.js';
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
import {
  pickCallBreaker,
  readSubtitleSourceBreakers,
} from './subtitle-source-breaker.js';

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
  if (isVideoTypeMismatch(searchQuery)) {
    return [];
  }
  if (client.isSearchCredentialScoped) {
    return runUncachedSearch({
      client,
      searchQuery,
      credentials,
      hasConfiguredCredential,
      nowMs,
      readNowMs,
    });
  }
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
  const [searchCacheEntries, subtitleSourceBreakers, canUseWithoutCredential] =
    await Promise.all([
      readSearchCacheEntries(
        languageSearches.map(({searchCacheParts}) => searchCacheParts),
        nowMs,
      ),
      readSubtitleSourceBreakers(client, nowMs),
      client.canSearchWithoutCredential(),
    ]);
  const candidateCredentials = dropPausedCredentials(
    {client, subtitleSourceBreakers},
    toCandidateCredentials({
      credentials,
      hasConfiguredCredential,
      canUseWithoutCredential,
    }),
  );
  if (candidateCredentials.length === 0) {
    return [];
  }
  if (!isQueryResolved(searchQuery)) {
    return searchUnresolvedLanguages({
      client,
      searchQuery,
      candidateCredentials,
      readNowMs,
      unsettledSearches: languageSearches.filter(
        (_, languageIndex) =>
          searchCacheEntries[languageIndex]?.isFresh !== true,
      ),
    });
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
  const [liveHits] = await Promise.all([
    runLiveSearch({
      ...liveOptions,
      lockedSearches: wonMissingLocks.lockedSearches,
    }),
    waitForLockedSearches(
      missingLocks.filter(({lockToken}) => !lockToken),
      signal,
    ),
  ]);
  return liveHits;
}

function dropPausedCredentials(
  {client, subtitleSourceBreakers},
  candidateCredentials,
) {
  return candidateCredentials.filter(
    credential =>
      !pickCallBreaker(subtitleSourceBreakers, {
        isKeylessCall: credential === null || client.isSearchKeyless === true,
      }).isOpen,
  );
}

function isVideoTypeMismatch({videoType, catalogEpisode, kitsuEpisode}) {
  const hasEpisode = !isNil(catalogEpisode ?? kitsuEpisode);
  return (
    (videoType === VideoType.MOVIE && hasEpisode) ||
    (videoType === VideoType.SERIES && !hasEpisode)
  );
}

function isQueryResolved({isEpisodeResolved, isCatalogResolved}) {
  return isEpisodeResolved !== false && isCatalogResolved !== false;
}

async function searchUnresolvedLanguages({
  client,
  searchQuery,
  candidateCredentials,
  readNowMs,
  unsettledSearches,
}) {
  if (unsettledSearches.length === 0) {
    return [];
  }
  return (
    (await searchAndStore({
      client,
      searchQuery: {
        ...searchQuery,
        languageCodes: unsettledSearches.map(({languageCode}) => languageCode),
      },
      candidateCredentials,
      readNowMs,
    })) ?? []
  );
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
    return {lockedSearches: []};
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
  };
}

async function waitForLockedSearches(lockedSearches, signal) {
  if (lockedSearches.length === 0) {
    return;
  }
  await waitForSearchLocks(
    lockedSearches.map(({searchCacheParts}) => searchCacheParts),
    signal,
  );
}

async function runUncachedSearch({
  client,
  searchQuery,
  credentials,
  hasConfiguredCredential,
  nowMs,
  readNowMs,
}) {
  const [canUseWithoutCredential, subtitleSourceBreakers] = await Promise.all([
    client.canSearchWithoutCredential(),
    readSubtitleSourceBreakers(client, nowMs),
  ]);
  const candidateCredentials = dropPausedCredentials(
    {client, subtitleSourceBreakers},
    toCandidateCredentials({
      credentials,
      hasConfiguredCredential,
      canUseWithoutCredential,
    }),
  );
  if (candidateCredentials.length === 0) {
    return [];
  }
  try {
    return (
      (await searchAndStore({
        client,
        searchQuery,
        candidateCredentials,
        readNowMs,
      })) ?? []
    );
  } catch (error) {
    logSearchFailure(client.subtitleSource, error, 'Live search failed.');
    return [];
  }
}

async function searchAndStore({
  client,
  searchQuery,
  candidateCredentials,
  readNowMs,
}) {
  const searchHits = await searchWithCredentials({
    client,
    searchQuery,
    candidateCredentials,
    readNowMs,
  });
  if (searchHits === null) {
    return null;
  }
  const languageHits = searchHits.filter(searchHit =>
    searchQuery.languageCodes.includes(searchHit.languageCode),
  );
  await persistSearchHits({
    videoId: searchQuery.videoId,
    searchHits: languageHits,
    isCandidateLinked: !client.isSearchCredentialScoped,
  });
  return languageHits;
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
    const languageHits = await searchAndStore({
      client,
      searchQuery: {...searchQuery, languageCodes},
      candidateCredentials,
      readNowMs,
    });
    if (languageHits === null) {
      return [];
    }
    await writeSearchCacheEntries(
      lockedSearches.map(({searchCacheParts}) => searchCacheParts),
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
