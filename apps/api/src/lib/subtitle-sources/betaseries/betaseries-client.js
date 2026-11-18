import {CredentialKind} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {SubtitleSourceBudgetScope} from '../subtitle-source-contract.js';
import {requestSubtitleSource} from '../subtitle-source-request.js';
import {betaseriesMapping} from './betaseries-mapping.js';

const DOWNLOAD_WINDOW = 60000;
const DOWNLOAD_MAX = 10;

export const betaseriesClient = {
  subtitleSource: SubtitleSource.BETASERIES,
  credentialKinds: [CredentialKind.API_KEY],
  isSearchHashSensitive: false,
  downloadBudgets: [
    {
      budgetScope: SubtitleSourceBudgetScope.SUBTITLE_SOURCE,
      windowMs: DOWNLOAD_WINDOW,
      requestMax: DOWNLOAD_MAX,
    },
  ],
  canSearchWithoutCredential: () => false,
  canDownloadWithoutCredential: () => false,
  async searchSubtitles(searchQuery, credential, {signal} = {}) {
    const showRequest = betaseriesMapping.buildShowRequest(
      searchQuery,
      credential,
    );
    if (showRequest === null) {
      return [];
    }
    const showId = betaseriesMapping.findShowId(
      await requestSubtitleSource({...showRequest, signal}),
      credential,
    );
    if (showId === null) {
      return [];
    }
    const episodeId = betaseriesMapping.findEpisodeId(
      await requestSubtitleSource({
        ...betaseriesMapping.buildEpisodeRequest(
          showId,
          searchQuery,
          credential,
        ),
        signal,
      }),
      searchQuery,
      credential,
    );
    if (episodeId === null) {
      return [];
    }
    return betaseriesMapping.toSearchHits(
      await requestSubtitleSource({
        ...betaseriesMapping.buildSubtitlesRequest(
          episodeId,
          searchQuery,
          credential,
        ),
        signal,
      }),
      credential,
    );
  },
  async downloadSubtitle(subtitleRef, credential, {signal} = {}) {
    return betaseriesMapping.toDownload(
      await requestSubtitleSource({
        ...betaseriesMapping.buildDownloadRequest(subtitleRef),
        signal,
      }),
    );
  },
  async checkCredential(credential, {signal} = {}) {
    return betaseriesMapping.toCredentialCheck(
      await requestSubtitleSource({
        ...betaseriesMapping.buildCredentialCheckRequest(credential),
        signal,
      }),
      credential,
    );
  },
};
