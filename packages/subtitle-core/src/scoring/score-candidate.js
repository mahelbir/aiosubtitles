import {mapValues, omit, sum} from 'es-toolkit';
import {
  ScoreTableMode,
  ScoringSignal,
  SignalState,
} from '../constants/subtitle-core-enums.js';
import {getConfidenceWord} from './confidence-word.js';
import {
  extractCandidateSignals,
  extractReleaseSignals,
} from './extract-signals.js';
import {
  findReleaseRejectReasons,
  pickHardRejectReason,
} from './find-hard-reject.js';

const readStatePoints = (
  signalState,
  {matchPoints, conflictPoints, strongConflictPoints},
) => {
  switch (signalState) {
    case SignalState.MATCH:
      return matchPoints;
    case SignalState.CONFLICT:
      return conflictPoints;
    case SignalState.STRONG_CONFLICT:
      return strongConflictPoints ?? conflictPoints;
    default:
      return 0;
  }
};

const scoreSignalReading = ({signalState, signalMagnitude}, signalPoints) => {
  const readingPoints =
    readStatePoints(signalState, signalPoints) * signalMagnitude;
  return signalPoints.maxPoints == null
    ? readingPoints
    : Math.min(readingPoints, signalPoints.maxPoints);
};

const readSubtitleSourcePoints = (subtitleSource, scoreTable) =>
  scoreTable.subtitleSourcePoints?.[subtitleSource] ?? 0;

const readTablePoints = (scoreTable, video) =>
  video.catalogEpisode == null || scoreTable.episodeSignalPoints == null
    ? scoreTable.signalPoints
    : {...scoreTable.signalPoints, ...scoreTable.episodeSignalPoints};

const readVectorOrder = scoreTable => {
  switch (scoreTable.tableMode) {
    case ScoreTableMode.STRICT_PRIORITY:
      return scoreTable.priorityOrder;
    case ScoreTableMode.TIERED:
      return scoreTable.tierOrder;
    default:
      return null;
  }
};

const readTierScore = (scoreTable, totalScore) => {
  if (scoreTable.tableMode !== ScoreTableMode.TIERED) {
    return null;
  }
  return scoreTable.scoreBucketSize == null
    ? totalScore
    : Math.floor(totalScore / scoreTable.scoreBucketSize);
};

const buildScoreBreakdown = ({
  signals,
  scoreTable,
  tablePoints,
  bestReleaseIndex,
  subtitleSourcePoints,
}) => {
  const signalPoints = mapValues(tablePoints, (signalEntry, scoringSignal) =>
    scoreSignalReading(signals[scoringSignal], signalEntry),
  );
  const vectorOrder = readVectorOrder(scoreTable);
  const summedPoints =
    scoreTable.tableMode === ScoreTableMode.TIERED
      ? omit(signalPoints, vectorOrder)
      : signalPoints;
  const totalScore = sum(Object.values(summedPoints)) + subtitleSourcePoints;
  return {
    totalScore,
    hardRejectReason: null,
    signalPoints,
    subtitleSourcePoints,
    bestReleaseIndex,
    confidenceWord: getConfidenceWord({
      signals,
      isHashValid:
        signals[ScoringSignal.HASH_MATCH].signalState === SignalState.MATCH,
    }),
    priorityVector:
      vectorOrder?.map(scoringSignal => signalPoints[scoringSignal] ?? 0) ??
      null,
    tierScore: readTierScore(scoreTable, totalScore),
  };
};

export const compareScoreBreakdowns = (breakdownA, breakdownB) => {
  const vectorA = breakdownA.priorityVector;
  const vectorB = breakdownB.priorityVector;
  if (vectorA == null || vectorB == null) {
    return breakdownB.totalScore - breakdownA.totalScore;
  }
  const differingIndex = vectorA.findIndex(
    (priorityPoints, priorityIndex) =>
      priorityPoints !== vectorB[priorityIndex],
  );
  if (differingIndex >= 0) {
    return vectorB[differingIndex] - vectorA[differingIndex];
  }
  return breakdownA.tierScore == null || breakdownB.tierScore == null
    ? 0
    : breakdownB.tierScore - breakdownA.tierScore;
};

export const scoreSubtitleCandidate = ({
  candidate,
  candidateReleases,
  video,
  scoreTable,
}) => {
  const releaseRejectReasons = findReleaseRejectReasons({
    candidate,
    candidateReleases,
    video,
  });
  const hardRejectReason = pickHardRejectReason({
    candidate,
    releaseRejectReasons,
  });
  if (hardRejectReason != null) {
    return {
      totalScore: 0,
      hardRejectReason,
      signalPoints: {},
      subtitleSourcePoints: 0,
      bestReleaseIndex: null,
      confidenceWord: null,
      priorityVector: null,
      tierScore: null,
    };
  }
  const candidateSignals = extractCandidateSignals({candidate, video});
  const subtitleSourcePoints = readSubtitleSourcePoints(
    candidate.subtitleSource,
    scoreTable,
  );
  const tablePoints = readTablePoints(scoreTable, video);
  const releaseChoices =
    candidateReleases.length === 0
      ? [{candidateRelease: null, releaseIndex: null}]
      : candidateReleases
          .map((candidateRelease, releaseIndex) => ({
            candidateRelease,
            releaseIndex,
          }))
          .filter(
            ({releaseIndex}) => releaseRejectReasons[releaseIndex] == null,
          );
  return releaseChoices
    .map(({candidateRelease, releaseIndex}) =>
      buildScoreBreakdown({
        signals: {
          ...candidateSignals,
          ...extractReleaseSignals({candidate, candidateRelease, video}),
        },
        scoreTable,
        tablePoints,
        bestReleaseIndex: releaseIndex,
        subtitleSourcePoints,
      }),
    )
    .reduce((bestBreakdown, releaseBreakdown) =>
      compareScoreBreakdowns(releaseBreakdown, bestBreakdown) < 0
        ? releaseBreakdown
        : bestBreakdown,
    );
};
