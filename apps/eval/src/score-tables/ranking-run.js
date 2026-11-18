import {sumBy} from 'es-toolkit';
import {DROPPED_GROUP_SCORE} from '../commands/rank-groups.js';
import {ComparisonOutcome} from '../constants/comparison-outcome.js';
import {RankingLabel} from '../constants/ranking-label.js';
import {
  computeFirstPositiveRank,
  computePairOrder,
  computeReciprocalRank,
  computeTopOne,
  computeWorstError,
  countInvalidAbovePositive,
  isInformativeVideo,
} from '../metrics/ranking-metrics.js';
import {isPairedWinner, resampleVideoValues} from './video-spread.js';

export const PAIR_ORDER_METRIC = 'pairOrder';

const RANKING_METRICS = [
  {
    metricName: PAIR_ORDER_METRIC,
    metricTitle: 'Pair order',
    readValue: computePairOrder,
  },
  {metricName: 'topOne', metricTitle: 'Top-1', readValue: computeTopOne},
  {
    metricName: 'firstPositiveRank',
    metricTitle: 'First-positive rank',
    readValue: ranking =>
      computeFirstPositiveRank(ranking)?.firstPositiveRank ?? null,
  },
  {
    metricName: 'negativesAbove',
    metricTitle: 'Negatives above',
    readValue: ranking =>
      computeFirstPositiveRank(ranking)?.negativesAbove ?? null,
  },
  {
    metricName: 'reciprocalRank',
    metricTitle: 'MRR',
    readValue: computeReciprocalRank,
  },
  {
    metricName: 'worstError',
    metricTitle: 'Worst error (sum)',
    readValue: computeWorstError,
    isSum: true,
  },
];

export const RANKING_METRIC_TITLES = RANKING_METRICS.map(
  ({metricTitle}) => metricTitle,
);

const readInformativeValues = ({videoRankings, label, readValue}) =>
  videoRankings
    .filter(({rankedGroups}) => isInformativeVideo({rankedGroups, label}))
    .map(({videoCode, rankedGroups}) => ({
      videoCode,
      metricValue: readValue({rankedGroups, label}),
    }));

const isAboveZero = metricValue => metricValue > 0;

const listCodesAboveZero = videoValues =>
  videoValues
    .filter(({metricValue}) => metricValue !== null && isAboveZero(metricValue))
    .map(({videoCode}) => videoCode);

const countDroppedPositives = ({videoRankings, label}) => {
  const {positiveClasses} = RankingLabel.item(label);
  const droppedCounts = videoRankings.map(({videoCode, rankedGroups}) => ({
    videoCode,
    metricValue: rankedGroups.filter(
      rankedGroup =>
        rankedGroup.isValid &&
        positiveClasses.includes(rankedGroup.groupClass) &&
        rankedGroup.groupScore === DROPPED_GROUP_SCORE,
    ).length,
  }));
  return {
    droppedCount: sumBy(droppedCounts, ({metricValue}) => metricValue),
    videoCodes: listCodesAboveZero(droppedCounts),
  };
};

const countInvalidAbove = ({videoRankings, label}) => {
  const invalidCounts = videoRankings.map(({videoCode, rankedGroups}) => ({
    videoCode,
    metricValue: countInvalidAbovePositive({rankedGroups, label}),
  }));
  return {
    invalidAboveCount: sumBy(
      invalidCounts,
      ({metricValue}) => metricValue ?? 0,
    ),
    videoCodes: listCodesAboveZero(invalidCounts),
  };
};

const summarizeLabel = ({videoRankings, auditPassedCodes, label}) => {
  const metrics = RANKING_METRICS.map(
    ({metricName, metricTitle, readValue, isSum}) => {
      const videoValues = readInformativeValues({
        videoRankings,
        label,
        readValue,
      });
      const auditPassedValues = videoValues.filter(({videoCode}) =>
        auditPassedCodes.has(videoCode),
      );
      return {
        metricName,
        metricTitle,
        videoValues,
        videoCount: videoValues.length,
        spread: resampleVideoValues({videoValues, isSum}),
        auditPassedVideoCount: auditPassedValues.length,
        auditPassedSpread: resampleVideoValues({
          videoValues: auditPassedValues,
          isSum,
        }),
      };
    },
  );
  return {
    label,
    metrics,
    worstErrorVideoCodes: listCodesAboveZero(
      metrics.find(metric => metric.metricName === 'worstError').videoValues,
    ),
    droppedPositives: countDroppedPositives({videoRankings, label}),
    invalidAbove: countInvalidAbove({videoRankings, label}),
  };
};

export const summarizeRankingRow = ({
  rowName,
  videoRankings,
  auditPassedCodes,
}) => ({
  rowName,
  labelSummaries: RankingLabel.values.map(label =>
    summarizeLabel({videoRankings, auditPassedCodes, label}),
  ),
});

const readPairOrderValues = (rowSummary, label) =>
  rowSummary.labelSummaries
    .find(labelSummary => labelSummary.label === label)
    .metrics.find(metric => metric.metricName === PAIR_ORDER_METRIC)
    .videoValues;

const readOutcome = ({winnerRows, rowIndex, otherIndex}) => {
  if (winnerRows[rowIndex][otherIndex]) {
    return ComparisonOutcome.WIN;
  }
  return winnerRows[otherIndex][rowIndex]
    ? ComparisonOutcome.LOSS
    : ComparisonOutcome.TIE;
};

export const compareRankingRows = ({rowSummaries, label}) => {
  const winnerRows = rowSummaries.map(rowA =>
    rowSummaries.map(
      rowB =>
        rowA !== rowB &&
        isPairedWinner({
          videoValuesA: readPairOrderValues(rowA, label),
          videoValuesB: readPairOrderValues(rowB, label),
        }),
    ),
  );
  const outcomeRows = rowSummaries.map((_, rowIndex) =>
    rowSummaries.map((__, otherIndex) =>
      rowIndex === otherIndex
        ? null
        : readOutcome({winnerRows, rowIndex, otherIndex}),
    ),
  );
  return {
    label,
    outcomeRows,
    notBeatenRowNames: rowSummaries
      .filter(
        (_, rowIndex) =>
          !outcomeRows[rowIndex].includes(ComparisonOutcome.LOSS),
      )
      .map(({rowName}) => rowName),
  };
};
