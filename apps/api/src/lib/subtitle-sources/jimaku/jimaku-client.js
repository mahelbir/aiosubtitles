import {uniqBy} from 'es-toolkit';
import {CredentialKind} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {readKitsuAnilistId} from '../../video-catalog/kitsu-mapping.js';
import {sharedCredentialPool as defaultSharedCredentialPool} from '../shared-credential-pool.js';
import {SubtitleSourceBudgetScope} from '../subtitle-source-contract.js';
import {requestSubtitleSource as requestSite} from '../subtitle-source-request.js';
import {jimakuMapping} from './jimaku-mapping.js';

const DOWNLOAD_WINDOW = 60000;
const DOWNLOAD_MAX = 25;

async function listEntryHits({
  entryId,
  searchTarget,
  credential,
  signal,
  requestSubtitleSource,
}) {
  return jimakuMapping.toSearchHits(
    await requestSubtitleSource({
      ...jimakuMapping.buildFileListRequest(
        entryId,
        searchTarget.kitsuEpisode,
        credential,
      ),
      signal,
    }),
    searchTarget.kitsuEpisode,
  );
}

export function createJimakuClient({
  readAnilistId = readKitsuAnilistId,
  requestSubtitleSource = requestSite,
  sharedCredentialPool = defaultSharedCredentialPool,
} = {}) {
  const subtitleSource = SubtitleSource.JIMAKU;

  async function searchWithCredential(searchQuery, credential, signal) {
    const searchTarget = jimakuMapping.toSearchTarget(searchQuery, credential);
    if (searchTarget === null) {
      return null;
    }
    const anilistId = await readAnilistId(searchTarget.kitsuId);
    if (anilistId === null) {
      return [];
    }
    const entryIds = jimakuMapping.toEntryIds(
      await requestSubtitleSource({
        ...jimakuMapping.buildEntrySearchRequest(anilistId, credential),
        signal,
      }),
    );
    const entryHits = await Promise.all(
      entryIds.map(entryId =>
        listEntryHits({
          entryId,
          searchTarget,
          credential,
          signal,
          requestSubtitleSource,
        }),
      ),
    );
    return uniqBy(entryHits.flat(), hit => hit.siteFileId);
  }

  return {
    subtitleSource,
    credentialKinds: [CredentialKind.API_KEY],
    isSearchHashSensitive: false,
    canUseSharedCredential: true,
    isDownloadKeyless: true,
    downloadBudgets: [
      {
        budgetScope: SubtitleSourceBudgetScope.SUBTITLE_SOURCE,
        windowMs: DOWNLOAD_WINDOW,
        requestMax: DOWNLOAD_MAX,
      },
    ],
    isAvailable: () => true,
    canSearchWithoutCredential: () =>
      sharedCredentialPool.hasUsableCredential(subtitleSource),
    canDownloadWithoutCredential: () => true,
    searchSubtitles(searchQuery, credential, {signal} = {}) {
      return sharedCredentialPool.callWithCredential({
        subtitleSource,
        credential,
        isBreakerOnEveryLimit: true,
        runCall: activeCredential =>
          searchWithCredential(searchQuery, activeCredential, signal),
      });
    },
    async downloadSubtitle(subtitleRef, credential, {signal} = {}) {
      return jimakuMapping.toDownload(
        await requestSubtitleSource({
          ...jimakuMapping.buildDownloadRequest(subtitleRef),
          signal,
        }),
        subtitleRef,
      );
    },
    async checkCredential(credential, {signal} = {}) {
      return jimakuMapping.toCredentialCheck(
        await requestSubtitleSource({
          ...jimakuMapping.buildCredentialCheckRequest(credential),
          signal,
        }),
      );
    },
  };
}

export const jimakuClient = createJimakuClient();
