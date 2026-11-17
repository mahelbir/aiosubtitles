import {mapValues, sum} from 'es-toolkit';
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

const buildScoreBreakdown = ({signals, scoreTable, bestReleaseIndex}) => {
  const signalPoints = mapValues(
    scoreTable.signalPoints,
    (tablePoints, scoringSignal) =>
      scoreSignalReading(signals[scoringSignal], tablePoints),
  );
  return {
    totalScore: sum(Object.values(signalPoints)),
    hardRejectReason: null,
    signalPoints,
    bestReleaseIndex,
    confidenceWord: getConfidenceWord({
      signals,
      isHashValid:
        signals[ScoringSignal.HASH_MATCH].signalState === SignalState.MATCH,
    }),
    priorityVector:
      scoreTable.tableMode === ScoreTableMode.STRICT_PRIORITY
        ? scoreTable.priorityOrder.map(
            scoringSignal => signalPoints[scoringSignal] ?? 0,
          )
        : null,
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
  return differingIndex < 0
    ? 0
    : vectorB[differingIndex] - vectorA[differingIndex];
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
      bestReleaseIndex: null,
      confidenceWord: null,
      priorityVector: null,
    };
  }
  const candidateSignals = extractCandidateSignals({candidate, video});
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
        bestReleaseIndex: releaseIndex,
      }),
    )
    .reduce((bestBreakdown, releaseBreakdown) =>
      compareScoreBreakdowns(releaseBreakdown, bestBreakdown) < 0
        ? releaseBreakdown
        : bestBreakdown,
    );
};
