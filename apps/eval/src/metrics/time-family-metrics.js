import {orderBy, sumBy} from 'es-toolkit';
import {ExpectedClass} from '../constants/expected-class.js';
import {
  countMatching,
  divideOrNull,
  listOrderedPairs,
  normalizeScore,
  summarizeVideoMeans,
} from './metric-math.js';

const START_TOLERANCES_MS = [50, 100, 150, 200, 250, 300, 350];
const MATCHED_SHARE_MINIMUMS = [0.8, 0.85, 0.9, 0.95];

export const TIME_FAMILY_GRID = START_TOLERANCES_MS.flatMap(startToleranceMs =>
  MATCHED_SHARE_MINIMUMS.map(matchedShareMin => ({
    startToleranceMs,
    matchedShareMin,
  })),
);

const summarizeAgreement = outcomes => {
  const truePositiveCount = countMatching(
    outcomes,
    outcome => outcome.isActual && outcome.isPredicted,
  );
  const falsePositiveCount = countMatching(
    outcomes,
    outcome => !outcome.isActual && outcome.isPredicted,
  );
  const actualCount = countMatching(outcomes, outcome => outcome.isActual);
  const otherCount = outcomes.length - actualCount;
  const trueNegativeCount = otherCount - falsePositiveCount;
  const hasBothTruths = actualCount > 0 && otherCount > 0;
  const truePositiveRate = divideOrNull(truePositiveCount, actualCount);
  return {
    precision: hasBothTruths
      ? divideOrNull(truePositiveCount, truePositiveCount + falsePositiveCount)
      : null,
    recall: truePositiveRate,
    balancedAccuracy: hasBothTruths
      ? (truePositiveRate + trueNegativeCount / otherCount) / 2
      : null,
  };
};

const isSameFamilyTruth = (reference, candidate) =>
  reference.timeFamily !== null &&
  reference.timeFamily === candidate.timeFamily;

export const computeFamilyAgreement = ({videos, isSameTimeFamily}) => {
  const videoEntries = videos.map(({videoCode, groups}) => {
    const outcomes = listOrderedPairs(groups).map(([reference, candidate]) => ({
      isActual: isSameFamilyTruth(reference, candidate),
      isPredicted: isSameTimeFamily(reference, candidate),
      isCrossClass: reference.groupClass !== candidate.groupClass,
    }));
    return {
      videoCode,
      ...summarizeAgreement(outcomes),
      crossClassSameCount: countMatching(
        outcomes,
        outcome => outcome.isPredicted && outcome.isCrossClass,
      ),
    };
  });
  return {
    videos: videoEntries,
    macro: summarizeVideoMeans(videoEntries, [
      'precision',
      'recall',
      'balancedAccuracy',
    ]),
    crossClassSameCount: sumBy(
      videoEntries,
      video => video.crossClassSameCount,
    ),
  };
};

export const computeTruthReferenceAgreement = ({videos, isSameTimeFamily}) => {
  const videoEntries = videos.map(({videoCode, truth, groups}) => {
    const {precision, recall} = summarizeAgreement(
      groups.map(group => ({
        isActual: group.groupClass === ExpectedClass.FITS,
        isPredicted: isSameTimeFamily(truth, group),
      })),
    );
    return {videoCode, precision, recall};
  });
  return {
    videos: videoEntries,
    macro: summarizeVideoMeans(videoEntries, ['precision', 'recall']),
  };
};

const rankCriterion = criterion =>
  criterion === null ? -Infinity : normalizeScore(criterion);

const chooseSetting = ({grid, videos, scoreSetting}) =>
  orderBy(
    grid,
    [setting => setting.startToleranceMs, setting => setting.matchedShareMin],
    ['asc', 'desc'],
  ).reduce((best, setting) => {
    const criterion = scoreSetting({setting, videos});
    const isBetter =
      best === null || rankCriterion(criterion) > rankCriterion(best.criterion);
    return isBetter ? {setting, criterion} : best;
  }, null);

export const selectTimeFamilyParameters = ({grid, videos, scoreSetting}) => ({
  ...chooseSetting({grid, videos, scoreSetting}),
  heldOut: videos.map(heldOutVideo => {
    const {setting, criterion} = chooseSetting({
      grid,
      videos: videos.filter(video => video !== heldOutVideo),
      scoreSetting,
    });
    return {
      videoCode: heldOutVideo.videoCode,
      setting,
      trainingCriterion: criterion,
    };
  }),
});
