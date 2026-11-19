import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {readKitsuAnidbId} from '../../video-catalog/kitsu-mapping.js';
import {SubtitleSourceBudgetScope} from '../subtitle-source-contract.js';
import {readSettledHitLists} from '../subtitle-source-hit-lists.js';
import {requestSubtitleSource} from '../subtitle-source-request.js';
import {animetoshoMapping} from './animetosho-mapping.js';

const DOWNLOAD_WINDOW = 60000;
const DOWNLOAD_MAX = 10;

export function createAnimetoshoClient({readAnidbId = readKitsuAnidbId} = {}) {
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
      const torrentIds = animetoshoMapping.pickTorrentIds(
        await requestSubtitleSource({
          ...animetoshoMapping.buildFeedRequest(anidbId),
          signal,
        }),
        {anidbId, kitsuEpisode: animeLookup.kitsuEpisode},
      );
      const settledResults = await Promise.allSettled(
        torrentIds.map(async torrentId =>
          animetoshoMapping.toSearchHits(
            await requestSubtitleSource({
              ...animetoshoMapping.buildTorrentRequest(torrentId),
              signal,
            }),
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
