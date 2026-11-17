import {meanBy, median, round, uniqBy} from 'es-toolkit';
import {sortedIndex} from 'es-toolkit/compat';

export const COMPARISON_METHOD_VERSION = 1;

export const DEFAULT_TIMING_SETTINGS = {
  cueStartToleranceMs: 300,
  matchedCueShareMin: 0.8,
  offsetNearZeroMs: 150,
  fpsRatioNearOneDelta: 0.0005,
};

const FRAME_RATES = [23.976, 24, 25, 29.97, 30];
const FPS_RATIO_DECIMALS = 6;
const FPS_RATIO_HYPOTHESES = uniqBy(
  [
    1,
    ...FRAME_RATES.flatMap(candidateFps =>
      FRAME_RATES.map(referenceFps => candidateFps / referenceFps),
    ),
  ],
  fpsRatio => round(fpsRatio, FPS_RATIO_DECIMALS),
);
const OFFSET_SEARCH_RANGE_MS = 180_000;
const MIN_OFFSET_BIN_MS = 1;
const MIN_FIT_PAIR_COUNT = 2;

const NO_COMPARISON = {
  timingOffsetMs: 0,
  timingFpsRatio: 1,
  matchedCueShare: 0,
  isSameTimeFamily: false,
};

const UNMEASURED_ALIGNMENT = {fpsRatio: 1, offsetMs: 0, cuePairs: []};

const getSortedStarts = cues =>
  (Array.isArray(cues) ? cues : [])
    .map(cue => cue?.startMs)
    .filter(Number.isFinite)
    .toSorted((leftMs, rightMs) => leftMs - rightMs);

const pairCueStarts = ({
  candidateStarts,
  referenceStarts,
  fpsRatio,
  offsetMs,
  toleranceMs,
}) => {
  const cuePairs = [];
  let candidateIndex = 0;
  let referenceIndex = 0;
  while (
    candidateIndex < candidateStarts.length &&
    referenceIndex < referenceStarts.length
  ) {
    const candidateMs = candidateStarts[candidateIndex];
    const referenceMs = referenceStarts[referenceIndex];
    const deltaMs = candidateMs - (referenceMs * fpsRatio + offsetMs);
    if (Math.abs(deltaMs) <= toleranceMs) {
      cuePairs.push({candidateMs, referenceMs});
      candidateIndex += 1;
      referenceIndex += 1;
    } else if (deltaMs < 0) {
      candidateIndex += 1;
    } else {
      referenceIndex += 1;
    }
  }
  return cuePairs;
};

const findPeakOffset = ({
  candidateStarts,
  referenceStarts,
  fpsRatio,
  toleranceMs,
}) => {
  const binMs = Math.max(toleranceMs, MIN_OFFSET_BIN_MS);
  const binTallies = new Int32Array(
    Math.floor((2 * OFFSET_SEARCH_RANGE_MS) / binMs) + 2,
  );
  for (const candidateMs of candidateStarts) {
    const firstIndex = sortedIndex(
      referenceStarts,
      (candidateMs - OFFSET_SEARCH_RANGE_MS) / fpsRatio,
    );
    for (
      let referenceIndex = firstIndex;
      referenceIndex < referenceStarts.length &&
      referenceStarts[referenceIndex] * fpsRatio <=
        candidateMs + OFFSET_SEARCH_RANGE_MS;
      referenceIndex += 1
    ) {
      const shiftedMs =
        candidateMs -
        referenceStarts[referenceIndex] * fpsRatio +
        OFFSET_SEARCH_RANGE_MS;
      binTallies[Math.floor(shiftedMs / binMs)] += 1;
    }
  }
  let peakBin = 0;
  let peakTally = -1;
  for (let binIndex = 0; binIndex < binTallies.length - 1; binIndex += 1) {
    const windowTally = binTallies[binIndex] + binTallies[binIndex + 1];
    if (windowTally > peakTally) {
      peakBin = binIndex;
      peakTally = windowTally;
    }
  }
  return (peakBin + 1) * binMs - OFFSET_SEARCH_RANGE_MS;
};

const alignForRatio = ({
  candidateStarts,
  referenceStarts,
  fpsRatio,
  toleranceMs,
}) => {
  const trackStarts = {candidateStarts, referenceStarts, fpsRatio, toleranceMs};
  const peakOffsetMs = findPeakOffset(trackStarts);
  const peakPairs = pairCueStarts({...trackStarts, offsetMs: peakOffsetMs});
  if (peakPairs.length === 0) {
    return {...UNMEASURED_ALIGNMENT};
  }
  const offsetMs = median(
    peakPairs.map(
      ({candidateMs, referenceMs}) => candidateMs - referenceMs * fpsRatio,
    ),
  );
  return {
    fpsRatio,
    offsetMs,
    cuePairs: pairCueStarts({...trackStarts, offsetMs}),
  };
};

const fitTimingLine = ({fpsRatio, offsetMs, cuePairs}) => {
  if (cuePairs.length < MIN_FIT_PAIR_COUNT) {
    return {fpsRatio, offsetMs};
  }
  const residualPoints = cuePairs.map(({candidateMs, referenceMs}) => ({
    referenceMs,
    residualMs: candidateMs - (referenceMs * fpsRatio + offsetMs),
  }));
  const referenceMeanMs = meanBy(residualPoints, point => point.referenceMs);
  const residualMeanMs = meanBy(residualPoints, point => point.residualMs);
  let spreadSquares = 0;
  let spreadProducts = 0;
  for (const {referenceMs, residualMs} of residualPoints) {
    spreadSquares += (referenceMs - referenceMeanMs) ** 2;
    spreadProducts +=
      (referenceMs - referenceMeanMs) * (residualMs - residualMeanMs);
  }
  const slope = spreadSquares > 0 ? spreadProducts / spreadSquares : 0;
  return {
    fpsRatio: fpsRatio + slope,
    offsetMs: offsetMs + residualMeanMs - slope * referenceMeanMs,
  };
};

export const compareCueTimings = ({
  candidateCues,
  referenceCues,
  timingSettings,
} = {}) => {
  const {
    cueStartToleranceMs,
    matchedCueShareMin,
    offsetNearZeroMs,
    fpsRatioNearOneDelta,
  } = {
    ...DEFAULT_TIMING_SETTINGS,
    ...timingSettings,
  };
  const candidateStarts = getSortedStarts(candidateCues);
  const referenceStarts = getSortedStarts(referenceCues);
  if (candidateStarts.length === 0 || referenceStarts.length === 0) {
    return {...NO_COMPARISON};
  }
  const trackStarts = {
    candidateStarts,
    referenceStarts,
    toleranceMs: cueStartToleranceMs,
  };
  const bestAlignment = FPS_RATIO_HYPOTHESES.map(fpsRatio =>
    alignForRatio({...trackStarts, fpsRatio}),
  ).reduce((leader, alignment) =>
    alignment.cuePairs.length > leader.cuePairs.length ? alignment : leader,
  );
  const fittedLine = fitTimingLine(bestAlignment);
  const timingOffsetMs = Math.round(fittedLine.offsetMs) || 0;
  const timingFpsRatio = round(fittedLine.fpsRatio, FPS_RATIO_DECIMALS);
  const matchedCueShare =
    pairCueStarts({...trackStarts, fpsRatio: 1, offsetMs: 0}).length /
    Math.max(candidateStarts.length, referenceStarts.length);
  return {
    timingOffsetMs,
    timingFpsRatio,
    matchedCueShare,
    isSameTimeFamily:
      matchedCueShare >= matchedCueShareMin &&
      Math.abs(timingOffsetMs) <= offsetNearZeroMs &&
      Math.abs(timingFpsRatio - 1) <= fpsRatioNearOneDelta,
  };
};
