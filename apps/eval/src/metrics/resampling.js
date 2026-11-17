import {sortBy, zip} from 'es-toolkit';
import {normalizeScore} from './metric-math.js';
import {mulberry32} from './mulberry32.js';

export const RESAMPLE_SEED = 20261117;
export const RESAMPLE_DRAW_COUNT = 10_000;

const EXACT_RESAMPLE_LIMIT = 1_000_000;
const PERCENTILE_DENOMINATOR = 40;
const LOWER_PERCENTILE_FORTIETHS = 1;
const UPPER_PERCENTILE_FORTIETHS = 39;

const pickPercentile = (sortedStatistics, fortieths) =>
  sortedStatistics[
    Math.ceil((fortieths * sortedStatistics.length) / PERCENTILE_DENOMINATOR) -
      1
  ];

function* enumerateResamples(sortedUnits) {
  const unitCount = sortedUnits.length;
  const indexes = Array.from({length: unitCount}, () => 0);
  while (true) {
    yield indexes.map(index => sortedUnits[index]);
    let position = unitCount - 1;
    while (position >= 0 && indexes[position] === unitCount - 1) {
      indexes[position] = 0;
      position -= 1;
    }
    if (position < 0) {
      return;
    }
    indexes[position] += 1;
  }
}

function* drawResamples({sortedUnits, seed, drawCount}) {
  const random = mulberry32(seed);
  const unitCount = sortedUnits.length;
  for (let drawIndex = 0; drawIndex < drawCount; drawIndex += 1) {
    yield Array.from(
      {length: unitCount},
      () => sortedUnits[Math.floor(random() * unitCount)],
    );
  }
}

const requireFiniteStatistic = statisticValue => {
  if (!Number.isFinite(statisticValue)) {
    throw new RangeError('A resample statistic is not a finite number.');
  }
  return statisticValue;
};

const isExactEnumeration = unitCount =>
  unitCount ** unitCount <= EXACT_RESAMPLE_LIMIT;

export const resampleStatistic = ({
  units,
  sortKey,
  statistic,
  seed,
  drawCount,
}) => {
  const sortedUnits = sortBy(units, [sortKey]);
  const resamples = isExactEnumeration(sortedUnits.length)
    ? enumerateResamples(sortedUnits)
    : drawResamples({sortedUnits, seed, drawCount});
  const computeFiniteStatistic = resample =>
    requireFiniteStatistic(statistic(resample));
  const statistics = Float64Array.from(
    resamples,
    computeFiniteStatistic,
  ).sort();
  return {
    pointEstimate: computeFiniteStatistic(sortedUnits),
    lowerBound: pickPercentile(statistics, LOWER_PERCENTILE_FORTIETHS),
    upperBound: pickPercentile(statistics, UPPER_PERCENTILE_FORTIETHS),
    unitCount: sortedUnits.length,
  };
};

const pairUnits = ({unitsA, unitsB, sortKey}) => {
  if (unitsA.length !== unitsB.length) {
    throw new RangeError('Paired units differ in number.');
  }
  return zip(unitsA, unitsB).map(([unitA, unitB]) => {
    if (sortKey(unitA) !== sortKey(unitB)) {
      throw new RangeError('Paired units differ in sort key.');
    }
    return {unitA, unitB};
  });
};

export const comparePaired = ({
  unitsA,
  unitsB,
  sortKey,
  statistic,
  seed,
  drawCount,
  isLowerBetter = false,
}) => {
  const [leadingSide, trailingSide] = isLowerBetter
    ? ['unitB', 'unitA']
    : ['unitA', 'unitB'];
  const difference = resampleStatistic({
    units: pairUnits({unitsA, unitsB, sortKey}),
    sortKey: pairedUnit => sortKey(pairedUnit.unitA),
    statistic: resample =>
      requireFiniteStatistic(
        statistic(resample.map(pairedUnit => pairedUnit[leadingSide])),
      ) -
      requireFiniteStatistic(
        statistic(resample.map(pairedUnit => pairedUnit[trailingSide])),
      ),
    seed,
    drawCount,
  });
  return {difference, isAWinner: normalizeScore(difference.lowerBound) > 0};
};
