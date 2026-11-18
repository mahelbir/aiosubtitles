import {isNil, memoize} from 'es-toolkit';
import {CredentialKind} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {listArchiveEntriesForVideo} from '@repo/subtitle-core/archive/pick-archive-entry.js';
import {SubtitleNotice} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {
  readSearchCredentials,
  readUsableCredentials,
  toCandidateCredentials,
} from '../../../lib/subtitle-source-credentials.js';
import {findPackRejectReason} from '../../../lib/subtitle-store/pack-binding.js';

export function collectVideoCandidates({
  cachedUserConfig,
  videoContext,
  candidates,
  subtitleSourceRegistry,
}) {
  const {languageCodes, subtitleSourceSwitchStates} = cachedUserConfig;
  const canListUnstoredRows = memoize(subtitleSource =>
    canSourceListUnstoredRows({
      cachedUserConfig,
      client: subtitleSourceRegistry.getSubtitleSourceClient(subtitleSource),
    }),
  );
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

export function hasFreeDownloadPath({fileFacts, hasOpensubtitlesV3Alias}) {
  return fileFacts !== null || hasOpensubtitlesV3Alias;
}

function canSourceListUnstoredRows({cachedUserConfig, client}) {
  if (!client) {
    return false;
  }
  if (client.subtitleSource === SubtitleSource.OPENSUBTITLES) {
    return true;
  }
  return (
    toCandidateCredentials({
      ...readSearchCredentials({cachedUserConfig, client}),
      canUseWithoutCredential: client.canSearchWithoutCredential(),
    }).length > 0
  );
}

function isPackRowVisible(
  {packInnerEntryPaths, isPackInner, isPackBound, archiveEntryPath},
  {catalogSeason, catalogEpisode},
) {
  if (packInnerEntryPaths) {
    return (
      findPackRejectReason({
        innerEntryPaths: packInnerEntryPaths,
        catalogSeason,
        catalogEpisode,
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
      }).length > 0
    );
  }
  return true;
}
