import {isNil, uniq} from 'es-toolkit';
import {CredentialKind} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {listArchiveEntriesForVideo} from '@repo/subtitle-core/archive/pick-archive-entry.js';
import {SubtitleNotice} from '../../../lib/stremio-row/stremio-row-enums.js';
import {
  readSearchCredentials,
  readUsableCredentials,
  toCandidateCredentials,
} from '../../../lib/subtitle-source-credentials.js';
import {findPackRejectReason} from '../../../lib/subtitle-store/pack-binding.js';
import {hasFreeDownloadPath} from '../../../lib/subtitle-store/read-video-candidates.js';

export async function collectVideoCandidates({
  cachedUserConfig,
  videoContext,
  candidates,
  subtitleSourceRegistry,
}) {
  const {languageCodes, subtitleSourceSwitchStates} = cachedUserConfig;
  const candidateSources = uniq(
    candidates.map(({subtitleSource}) => subtitleSource),
  );
  const canSourcesListUnstoredRows = await Promise.all(
    candidateSources.map(subtitleSource =>
      canSourceListUnstoredRows({
        cachedUserConfig,
        client: subtitleSourceRegistry.getSubtitleSourceClient(subtitleSource),
      }),
    ),
  );
  const listingSources = new Set(
    candidateSources.filter(
      (_, sourceIndex) => canSourcesListUnstoredRows[sourceIndex],
    ),
  );
  const canListUnstoredRows = subtitleSource =>
    listingSources.has(subtitleSource);
  const hasOpensubtitlesAccount =
    readUsableCredentials({
      cachedUserConfig,
      subtitleSource: SubtitleSource.OPENSUBTITLES,
      credentialKinds: [CredentialKind.ACCOUNT],
    }).length > 0;
  return candidates
    .filter(
      candidate =>
        languageCodes.includes(candidate.languageCode) &&
        subtitleSourceSwitchStates[candidate.subtitleSource] !== false &&
        (candidate.fileFacts !== null ||
          canListUnstoredRows(candidate.subtitleSource)) &&
        isPackRowVisible(candidate, videoContext),
    )
    .map(candidate => ({
      ...candidate,
      isAccountHidden:
        !hasOpensubtitlesAccount &&
        candidate.subtitleSource === SubtitleSource.OPENSUBTITLES &&
        !hasFreeDownloadPath(candidate),
    }));
}

export function readOpensubtitlesNotice({credentials}) {
  const opensubtitlesKinds = credentials
    .filter(
      ({subtitleSource}) => subtitleSource === SubtitleSource.OPENSUBTITLES,
    )
    .map(({credentialKind}) => credentialKind);
  return opensubtitlesKinds.includes(CredentialKind.ACCOUNT) &&
    !opensubtitlesKinds.includes(CredentialKind.API_KEY)
    ? SubtitleNotice.OPENSUBTITLES_ACCOUNT_FIX
    : SubtitleNotice.OPENSUBTITLES_ACCOUNT;
}

async function canSourceListUnstoredRows({cachedUserConfig, client}) {
  if (!client || !(await client.isAvailable())) {
    return false;
  }
  if (client.subtitleSource === SubtitleSource.OPENSUBTITLES) {
    return true;
  }
  return (
    toCandidateCredentials({
      ...readSearchCredentials({cachedUserConfig, client}),
      canUseWithoutCredential: await client.canSearchWithoutCredential(),
    }).length > 0
  );
}

function isPackRowVisible(
  {packInnerEntryPaths, isPackInner, isPackBound, archiveEntryPath},
  {catalogSeason, catalogEpisode, kitsuEpisode = null},
) {
  if (packInnerEntryPaths) {
    return (
      findPackRejectReason({
        innerEntryPaths: packInnerEntryPaths,
        catalogSeason,
        catalogEpisode,
        kitsuEpisode,
      }) === null
    );
  }
  if (isPackInner) {
    return (
      !isNil(catalogEpisode) &&
      !isPackBound &&
      listArchiveEntriesForVideo({
        entryPaths: [archiveEntryPath],
        seasonNumber: catalogSeason,
        episodeNumber: catalogEpisode,
        alternateEpisodeNumber: kitsuEpisode,
      }).length > 0
    );
  }
  return true;
}
