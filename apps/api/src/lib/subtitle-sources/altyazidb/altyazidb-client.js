import {CredentialKind} from '@repo/shared/constants/credential.js';
import {SubtitleLanguage} from '@repo/shared/constants/subtitle-language.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {
  SubtitleSourceBudgetScope,
  SubtitleSourceVideoType,
} from '../subtitle-source-contract.js';
import {readSettledHitLists} from '../subtitle-source-hit-lists.js';
import {requestSubtitleSource} from '../subtitle-source-request.js';
import {altyazidbMapping} from './altyazidb-mapping.js';

const DOWNLOAD_WINDOW = 60000;
const DOWNLOAD_MAX = 10;

export const altyazidbClient = {
  subtitleSource: SubtitleSource.ALTYAZIDB,
  credentialKinds: [CredentialKind.API_KEY],
  isSearchHashSensitive: false,
  servedLanguageCodes: [SubtitleLanguage.TUR],
  servedVideoTypes: [
    SubtitleSourceVideoType.MOVIE,
    SubtitleSourceVideoType.SERIES,
  ],
  downloadBudgets: [
    {
      budgetScope: SubtitleSourceBudgetScope.SUBTITLE_SOURCE,
      windowMs: DOWNLOAD_WINDOW,
      requestMax: DOWNLOAD_MAX,
    },
    {
      budgetScope: SubtitleSourceBudgetScope.CREDENTIAL,
      windowMs: DOWNLOAD_WINDOW,
      requestMax: DOWNLOAD_MAX,
    },
  ],
  isAvailable: () => true,
  canSearchWithoutCredential: () => false,
  canDownloadWithoutCredential: () => false,
  async searchSubtitles(searchQuery, credential, {signal} = {}) {
    const {catalogSeason, catalogEpisode} = searchQuery;
    const searchRequests = altyazidbMapping.buildSearchRequests(
      searchQuery,
      credential,
    );
    if (searchRequests.length === 0) {
      return null;
    }
    const settledResults = await Promise.allSettled(
      searchRequests.map(async ({searchRequest, isPackSearch}) =>
        altyazidbMapping.toSearchHits(
          await requestSubtitleSource({...searchRequest, signal}),
          {isPackSearch, catalogSeason, catalogEpisode},
        ),
      ),
    );
    return altyazidbMapping.mergeSearchHits(
      readSettledHitLists(settledResults),
    );
  },
  async downloadSubtitle(subtitleRef, credential, {signal} = {}) {
    return altyazidbMapping.toDownload(
      await requestSubtitleSource({
        ...altyazidbMapping.buildDownloadRequest(subtitleRef, credential),
        signal,
      }),
      subtitleRef,
    );
  },
  async checkCredential(credential, {signal} = {}) {
    return altyazidbMapping.toCredentialCheck(
      await requestSubtitleSource({
        ...altyazidbMapping.buildCredentialCheckRequest(credential),
        signal,
      }),
    );
  },
};
