import {CredentialKind} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {SubtitleSourceBudgetScope} from '../subtitle-source-contract.js';
import {requestSubtitleSource} from '../subtitle-source-request.js';
import {altyazidbMapping} from './altyazidb-mapping.js';

const DOWNLOAD_WINDOW = 60000;
const DOWNLOAD_MAX = 10;

export const altyazidbClient = {
  subtitleSource: SubtitleSource.ALTYAZIDB,
  credentialKinds: [CredentialKind.API_KEY],
  isSearchHashSensitive: false,
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
  canSearchWithoutCredential: () => false,
  canDownloadWithoutCredential: () => false,
  async searchSubtitles(searchQuery, credential, {signal} = {}) {
    const {catalogSeason, catalogEpisode} = searchQuery;
    const settledResults = await Promise.allSettled(
      altyazidbMapping
        .buildSearchRequests(searchQuery, credential)
        .map(async ({searchRequest, isPackSearch}) =>
          altyazidbMapping.toSearchHits(
            await requestSubtitleSource({...searchRequest, signal}),
            {isPackSearch, catalogSeason, catalogEpisode},
          ),
        ),
    );
    return altyazidbMapping.mergeSearchHits(
      altyazidbMapping.readSettledHitLists(settledResults),
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
