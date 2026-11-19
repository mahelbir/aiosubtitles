import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {
  ANY_SUBTITLE_LANGUAGE,
  SubtitleSourceBudgetScope,
  SubtitleSourceVideoType,
} from '../subtitle-source-contract.js';
import {readSettledHitLists} from '../subtitle-source-hit-lists.js';
import {requestSubtitleSource} from '../subtitle-source-request.js';
import {gestdownMapping} from './gestdown-mapping.js';

const DOWNLOAD_WINDOW = 60000;
const DOWNLOAD_MAX = 10;

export const gestdownClient = {
  subtitleSource: SubtitleSource.GESTDOWN,
  credentialKinds: [],
  isSearchHashSensitive: false,
  servedLanguageCodes: ANY_SUBTITLE_LANGUAGE,
  servedVideoTypes: [SubtitleSourceVideoType.SERIES],
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
    const showRequest = gestdownMapping.buildShowRequest(searchQuery);
    if (showRequest === null) {
      return null;
    }
    const showId = gestdownMapping.findShowId(
      await requestSubtitleSource({...showRequest, signal}),
      searchQuery,
    );
    if (showId === null) {
      return [];
    }
    const settledResults = await Promise.allSettled(
      searchQuery.languageCodes
        .flatMap(languageCode =>
          gestdownMapping
            .buildSubtitlesRequests(showId, searchQuery, languageCode)
            .map(subtitlesRequest => ({languageCode, subtitlesRequest})),
        )
        .map(async ({languageCode, subtitlesRequest}) =>
          gestdownMapping.toSearchHits(
            await requestSubtitleSource({...subtitlesRequest, signal}),
            languageCode,
          ),
        ),
    );
    return readSettledHitLists(settledResults).flat();
  },
  async downloadSubtitle(subtitleRef, credential, {signal} = {}) {
    return gestdownMapping.toDownload(
      await requestSubtitleSource({
        ...gestdownMapping.buildDownloadRequest(subtitleRef),
        signal,
      }),
    );
  },
};
