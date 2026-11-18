import {parseReleaseName} from '@repo/subtitle-core/release-name/parse-release-name.js';
import {
  compareScoreBreakdowns,
  scoreSubtitleCandidate,
} from '@repo/subtitle-core/scoring/score-candidate.js';
import {getContentGroups} from '../corpus/content-groups.js';
import {normalizeScore} from '../metrics/metric-math.js';
import {buildEvalVideoContext} from './build-eval-candidates.js';

export const DROPPED_GROUP_SCORE = -Infinity;

export const toListTimeCandidate = candidate => ({
  ...candidate,
  fileFacts: null,
  referenceComparison: null,
});

const buildMember = ({poolRow, candidate, video, toRankingCandidate}) => {
  const rankingCandidate = toRankingCandidate(candidate);
  return {
    servedIndex: poolRow.servedIndex,
    candidate: rankingCandidate,
    candidateReleases: rankingCandidate.releaseNames.map(releaseName =>
      parseReleaseName(releaseName),
    ),
    video,
  };
};

export const buildRankingGroups = ({
  evalCase,
  candidates,
  video = buildEvalVideoContext(evalCase),
  toRankingCandidate = toListTimeCandidate,
}) => {
  const namedPoolRows = evalCase.poolRows.filter(
    poolRow => poolRow.candidateId !== null,
  );
  const memberByServedIndex = new Map(
    namedPoolRows.map((poolRow, candidateIndex) => [
      poolRow.servedIndex,
      buildMember({
        poolRow,
        candidate: candidates[candidateIndex],
        video,
        toRankingCandidate,
      }),
    ]),
  );
  const toMembers = poolRows =>
    poolRows.map(poolRow => memberByServedIndex.get(poolRow.servedIndex));
  const validCandidateIds = new Set(
    evalCase.candidates
      .filter(candidate => candidate.isValid === true)
      .map(candidate => candidate.candidateId),
  );
  return [
    ...getContentGroups(evalCase).map(({groupClass, poolRows}) => ({
      groupClass,
      isValid: true,
      members: toMembers(poolRows),
    })),
    ...namedPoolRows
      .filter(poolRow => !validCandidateIds.has(poolRow.candidateId))
      .map(poolRow => ({
        groupClass: null,
        isValid: false,
        members: toMembers([poolRow]),
      })),
  ];
};

const normalizeBreakdown = scoreBreakdown => ({
  ...scoreBreakdown,
  totalScore: normalizeScore(scoreBreakdown.totalScore),
  priorityVector:
    scoreBreakdown.priorityVector?.map(priorityPoints =>
      normalizeScore(priorityPoints),
    ) ?? null,
  tierScore:
    scoreBreakdown.tierScore == null
      ? null
      : normalizeScore(scoreBreakdown.tierScore),
});

const pickBestBreakdown = ({members, scoreTable}) =>
  members
    .map(({candidate, candidateReleases, video}) =>
      scoreSubtitleCandidate({
        candidate,
        candidateReleases,
        video,
        scoreTable,
      }),
    )
    .filter(scoreBreakdown => scoreBreakdown.hardRejectReason == null)
    .map(normalizeBreakdown)
    .reduce(
      (bestBreakdown, scoreBreakdown) =>
        bestBreakdown === null ||
        compareScoreBreakdowns(scoreBreakdown, bestBreakdown) < 0
          ? scoreBreakdown
          : bestBreakdown,
      null,
    );

const assignDenseRanks = keptEntries => {
  const rankByEntry = new Map();
  let denseRank = 0;
  keptEntries
    .toSorted((first, second) =>
      compareScoreBreakdowns(second.bestBreakdown, first.bestBreakdown),
    )
    .forEach((entry, entryIndex, worstFirst) => {
      if (
        entryIndex > 0 &&
        compareScoreBreakdowns(
          worstFirst[entryIndex - 1].bestBreakdown,
          entry.bestBreakdown,
        ) !== 0
      ) {
        denseRank += 1;
      }
      rankByEntry.set(entry, denseRank);
    });
  return rankByEntry;
};

export const rankGroupsForTable = ({groups, scoreTable}) => {
  const entries = groups.map(group => ({
    group,
    bestBreakdown: pickBestBreakdown({members: group.members, scoreTable}),
  }));
  const rankByEntry = assignDenseRanks(
    entries.filter(entry => entry.bestBreakdown !== null),
  );
  return entries.map(entry => ({
    groupClass: entry.group.groupClass,
    groupScore: rankByEntry.get(entry) ?? DROPPED_GROUP_SCORE,
    isValid: entry.group.isValid,
  }));
};

export const rankGroupsByServedOrder = ({groups}) =>
  groups.map(({groupClass, isValid, members}) => ({
    groupClass,
    groupScore: -(Math.min(...members.map(member => member.servedIndex)) + 1),
    isValid,
  }));
