import {setTimeout as delay} from 'node:timers/promises';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {readKitsuAnidbId} from '../../video-catalog/kitsu-mapping.js';
import {SubtitleSourceBudgetScope} from '../subtitle-source-contract.js';
import {SourceUnavailableError} from '../subtitle-source-errors.js';
import {readSettledHitLists} from '../subtitle-source-hit-lists.js';
import {reserveSubtitleSourcePace} from '../subtitle-source-pace.js';
import {
  requestSubtitleSource,
  toSubtitleSourceError,
} from '../subtitle-source-request.js';
import {
  ANIMETOSHO_TORRENT_OPEN_MAX,
  animetoshoMapping,
} from './animetosho-mapping.js';

const DOWNLOAD_WINDOW = 60000;
const DOWNLOAD_MAX = 10;
const SEARCH_FEED_CALL_MAX = 1 + ANIMETOSHO_TORRENT_OPEN_MAX;
const FEED_PACE = Object.freeze({
  subtitleSource: SubtitleSource.ANIMETOSHO,
  intervalMs: 2500,
  burstMax: SEARCH_FEED_CALL_MAX,
  waitMaxMs: 10000,
});

export function createAnimetoshoClient({
  readAnidbId = readKitsuAnidbId,
  reservePace = reserveSubtitleSourcePace,
} = {}) {
  async function reserveFeedTurns(callCount, plannedCallCount = callCount) {
    const turnWaits = await reservePace({
      ...FEED_PACE,
      callCount,
      plannedCallCount,
    });
    if (turnWaits === null) {
      throw new SourceUnavailableError({
        subtitleSource: SubtitleSource.ANIMETOSHO,
        cause: new Error('Feed pace is full.'),
      });
    }
    return turnWaits;
  }

  async function requestFeedOnTurn(feedRequest, turnWait, signal) {
    try {
      await delay(turnWait, undefined, {signal});
    } catch (error) {
      throw toSubtitleSourceError(error, {
        subtitleSource: SubtitleSource.ANIMETOSHO,
      });
    }
    return requestSubtitleSource({...feedRequest, signal});
  }

  return {
    subtitleSource: SubtitleSource.ANIMETOSHO,
    credentialKinds: [],
    isSearchHashSensitive: false,
    downloadBudgets: [
      {
        budgetScope: SubtitleSourceBudgetScope.SUBTITLE_SOURCE,
        windowMs: DOWNLOAD_WINDOW,
        requestMax: DOWNLOAD_MAX,
      },
    ],
    isAvailable: () => true,
    canSearchWithoutCredential: () => true,
    canDownloadWithoutCredential: () => true,
    async searchSubtitles(searchQuery, credential, {signal} = {}) {
      const animeLookup = animetoshoMapping.toAnimeLookup(searchQuery);
      if (animeLookup === null) {
        return null;
      }
      const anidbId = await readAnidbId(animeLookup.kitsuId);
      if (anidbId === null) {
        return [];
      }
      const [feedWait] = await reserveFeedTurns(1, SEARCH_FEED_CALL_MAX);
      const torrentIds = animetoshoMapping.pickTorrentIds(
        await requestFeedOnTurn(
          animetoshoMapping.buildFeedRequest(anidbId),
          feedWait,
          signal,
        ),
        {anidbId, kitsuEpisode: animeLookup.kitsuEpisode},
      );
      if (torrentIds.length === 0) {
        return [];
      }
      const torrentWaits = await reserveFeedTurns(torrentIds.length);
      const settledResults = await Promise.allSettled(
        torrentIds.map(async (torrentId, torrentIndex) =>
          animetoshoMapping.toSearchHits(
            await requestFeedOnTurn(
              animetoshoMapping.buildTorrentRequest(torrentId),
              torrentWaits[torrentIndex],
              signal,
            ),
            {
              kitsuEpisode: animeLookup.kitsuEpisode,
              languageCodes: searchQuery.languageCodes,
            },
          ),
        ),
      );
      return readSettledHitLists(settledResults, {isPartialKept: true}).flat();
    },
    async downloadSubtitle(subtitleRef, credential, {signal} = {}) {
      return animetoshoMapping.toDownload(
        await requestSubtitleSource({
          ...animetoshoMapping.buildDownloadRequest(subtitleRef),
          signal,
        }),
        {siteFileUrl: subtitleRef.siteFileUrl},
      );
    },
  };
}

export const animetoshoClient = createAnimetoshoClient();
