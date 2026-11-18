import {uniqBy} from 'es-toolkit';
import {CredentialKind} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {readKitsuAnilistId} from '../../video-catalog/kitsu-mapping.js';
import {SubtitleSourceBudgetScope} from '../subtitle-source-contract.js';
import {SourceUnavailableError} from '../subtitle-source-errors.js';
import {requestSubtitleSource} from '../subtitle-source-request.js';
import {jimakuMapping} from './jimaku-mapping.js';

const DOWNLOAD_WINDOW = 60000;
const DOWNLOAD_MAX = 25;

async function readEntryAnilistId(readAnilistId, kitsuId) {
  try {
    return await readAnilistId(kitsuId);
  } catch {
    throw new SourceUnavailableError({
      subtitleSource: SubtitleSource.JIMAKU,
      cause: new Error('Kitsu lookup failed.'),
    });
  }
}

async function listEntryHits({entryId, searchTarget, credential, signal}) {
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

export function createJimakuClient({readAnilistId = readKitsuAnilistId} = {}) {
  return {
    subtitleSource: SubtitleSource.JIMAKU,
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
      const searchTarget = jimakuMapping.toSearchTarget(
        searchQuery,
        credential,
      );
      if (searchTarget === null) {
        return [];
      }
      const anilistId = await readEntryAnilistId(
        readAnilistId,
        searchTarget.kitsuId,
      );
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
          listEntryHits({entryId, searchTarget, credential, signal}),
        ),
      );
      return uniqBy(entryHits.flat(), hit => hit.siteFileId);
    },
    async downloadSubtitle(subtitleRef, credential, {signal} = {}) {
      return jimakuMapping.toDownload(
        await requestSubtitleSource({
          ...jimakuMapping.buildDownloadRequest(subtitleRef, credential),
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
