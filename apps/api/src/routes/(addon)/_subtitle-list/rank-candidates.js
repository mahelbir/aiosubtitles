import {countBy, groupBy, memoize, uniq} from 'es-toolkit';
import {SubtitleFileFormat} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {NEAR_DUPLICATE_TEXT_SIMILARITY_MIN} from '@repo/subtitle-core/deduplication/are-cues-near-duplicate.js';
import {hasValidFile} from '@repo/subtitle-core/deduplication/duplicate-evidence.js';
import {
  groupDuplicates,
  pickGroupRepresentative,
} from '@repo/subtitle-core/deduplication/group-duplicates.js';
import {mergeDuplicateGroup} from '@repo/subtitle-core/deduplication/merge-duplicate-group.js';
import {parseReleaseName} from '@repo/subtitle-core/release-name/parse-release-name.js';
import {orderSubtitleRows} from '../../../lib/stremio-row/order-subtitle-rows.js';
import {hasFreeDownloadPath} from '../../../lib/subtitle-store/read-video-candidates.js';
import {scoreVideoCandidate} from '../../../lib/subtitle-store/score-video-candidate.js';

export const NEAR_DUPLICATE_CANDIDATE_MAX = 200;

export function listNearDuplicateCandidates(candidates) {
  const fileCandidates = candidates.filter(hasValidFile);
  const fileCounts = countBy(fileCandidates, ({languageCode}) => languageCode);
  const shapeGroups = groupBy(
    fileCandidates.filter(
      ({languageCode}) =>
        fileCounts[languageCode] <= NEAR_DUPLICATE_CANDIDATE_MAX,
    ),
    ({languageCode, fileFacts}) => `${languageCode}\n${fileFacts.cueCount}`,
  );
  return Object.values(shapeGroups).flatMap(shapeGroup =>
    shapeGroup.filter(candidate =>
      shapeGroup.some(otherCandidate =>
        canBeNearDuplicates(candidate, otherCandidate),
      ),
    ),
  );
}

function canBeNearDuplicates(candidate, otherCandidate) {
  return (
    candidate.fileFacts.contentKey !== otherCandidate.fileFacts.contentKey &&
    (isFrameBased(candidate) ||
      isFrameBased(otherCandidate) ||
      candidate.fileFacts.lastCueEndMs ===
        otherCandidate.fileFacts.lastCueEndMs)
  );
}

function isFrameBased({fileFormat}) {
  return fileFormat === SubtitleFileFormat.MICRODVD;
}

export function rankVideoCandidates({
  candidates,
  videoContext,
  languageCodes,
  subtitleLanguageLimit,
  cuesByFileSubtitleId = new Map(),
}) {
  const readCandidateRelease = memoize(
    ({releaseName, isSitePack}) => parseReleaseName(releaseName, {isSitePack}),
    {
      getCacheKey: ({releaseName, isSitePack}) =>
        `${isSitePack}\n${releaseName}`,
    },
  );
  const languageRankings = uniq(languageCodes).map(languageCode =>
    rankLanguage({
      languageCandidates: candidates
        .filter(candidate => candidate.languageCode === languageCode)
        .map(candidate => attachCues(candidate, cuesByFileSubtitleId)),
      videoContext,
      readCandidateRelease,
    }),
  );
  return {
    rankedRows: orderSubtitleRows({
      rankedRows: languageRankings.flatMap(({rankedRows}) => rankedRows),
      languageCodes,
      subtitleLanguageLimit,
    }),
    hiddenSubtitleCount: languageRankings.reduce(
      (hiddenCount, languageRanking) =>
        hiddenCount + languageRanking.hiddenSubtitleCount,
      0,
    ),
  };
}

function rankLanguage({
  languageCandidates,
  videoContext,
  readCandidateRelease,
}) {
  const validFileCount = languageCandidates.filter(hasValidFile).length;
  const groups = groupDuplicates({
    candidates: languageCandidates,
    textSimilarityMin:
      validFileCount <= NEAR_DUPLICATE_CANDIDATE_MAX
        ? NEAR_DUPLICATE_TEXT_SIMILARITY_MIN
        : Infinity,
  });
  const rankedRows = [];
  let hiddenSubtitleCount = 0;
  for (const group of groups) {
    const visibleMembers = group.members.filter(
      ({isAccountHidden}) => !isAccountHidden,
    );
    const isHidden = visibleMembers.length === 0;
    const rankedRow = scoreGroup({
      group: isHidden ? group : toVisibleGroup(group, visibleMembers),
      videoContext,
      readCandidateRelease,
    });
    if (rankedRow === null) {
      continue;
    }
    if (isHidden) {
      hiddenSubtitleCount += 1;
    } else {
      rankedRows.push(rankedRow);
    }
  }
  return {rankedRows, hiddenSubtitleCount};
}

function scoreGroup({group, videoContext, readCandidateRelease}) {
  const mergedCandidate = mergeDuplicateGroup({
    group,
    videoRelease: videoContext.videoRelease,
  });
  const candidate = {
    ...mergedCandidate,
    isQuotaCostly:
      mergedCandidate.isQuotaCostly && group.members.some(hasFreeDownloadPath)
        ? false
        : mergedCandidate.isQuotaCostly,
  };
  const {totalScore, hardRejectReason, confidenceWord} = scoreVideoCandidate({
    candidate,
    videoContext,
    readCandidateRelease,
  });
  return hardRejectReason === null
    ? {...candidate, totalScore, confidenceWord}
    : null;
}

function toVisibleGroup(group, visibleMembers) {
  return {
    ...group,
    representative: visibleMembers.includes(group.representative)
      ? group.representative
      : pickGroupRepresentative(visibleMembers),
    members: visibleMembers,
  };
}

function attachCues(candidate, cuesByFileSubtitleId) {
  const normalizedCues = cuesByFileSubtitleId.get(candidate.fileSubtitleId);
  return normalizedCues && candidate.fileFacts
    ? {...candidate, fileFacts: {...candidate.fileFacts, normalizedCues}}
    : candidate;
}
