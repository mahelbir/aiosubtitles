import {CredentialKind} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {
  ANY_SUBTITLE_LANGUAGE,
  SubtitleSourceBudgetScope,
  SubtitleSourceVideoType,
} from '../subtitle-source-contract.js';
import {readSettledHitLists} from '../subtitle-source-hit-lists.js';
import {requestSubtitleSource} from '../subtitle-source-request.js';
import {subsourceMapping} from './subsource-mapping.js';

const CREDENTIAL_DOWNLOAD_WINDOW = 60000;
const CREDENTIAL_DOWNLOAD_MAX = 60;

export const subsourceClient = {
  subtitleSource: SubtitleSource.SUBSOURCE,
  credentialKinds: [CredentialKind.API_KEY],
  isSearchHashSensitive: false,
  servedLanguageCodes: ANY_SUBTITLE_LANGUAGE,
  servedVideoTypes: [
    SubtitleSourceVideoType.MOVIE,
    SubtitleSourceVideoType.SERIES,
  ],
  downloadBudgets: [
    {
      budgetScope: SubtitleSourceBudgetScope.CREDENTIAL,
      windowMs: CREDENTIAL_DOWNLOAD_WINDOW,
      requestMax: CREDENTIAL_DOWNLOAD_MAX,
    },
  ],
  isAvailable: () => true,
  canSearchWithoutCredential: () => false,
  canDownloadWithoutCredential: () => false,
  async searchSubtitles(searchQuery, credential, {signal} = {}) {
    const movieSearchRequest = subsourceMapping.buildMovieSearchRequest(
      searchQuery,
      credential,
    );
    if (movieSearchRequest === null) {
      return null;
    }
    const movieId = subsourceMapping.findMovieId(
      await requestSubtitleSource({...movieSearchRequest, signal}),
      searchQuery,
    );
    if (movieId === null) {
      return [];
    }
    const settledResults = await Promise.allSettled(
      subsourceMapping
        .buildSubtitlesRequests(movieId, searchQuery, credential)
        .map(async subtitlesRequest =>
          subsourceMapping.toSearchHits(
            await requestSubtitleSource({...subtitlesRequest, signal}),
          ),
        ),
    );
    return readSettledHitLists(settledResults).flat();
  },
  async downloadSubtitle(subtitleRef, credential, {signal} = {}) {
    return subsourceMapping.toDownload(
      await requestSubtitleSource({
        ...subsourceMapping.buildDownloadRequest(subtitleRef, credential),
        signal,
      }),
    );
  },
  async checkCredential(credential, {signal} = {}) {
    return subsourceMapping.toCredentialCheck(
      await requestSubtitleSource({
        ...subsourceMapping.buildCredentialCheckRequest(credential),
        signal,
      }),
    );
  },
};
