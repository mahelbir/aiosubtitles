import {meanBy, sumBy} from 'es-toolkit';
import {
  RESAMPLE_DRAW_COUNT,
  RESAMPLE_SEED,
  comparePaired,
  resampleStatistic,
} from '../metrics/resampling.js';

const readVideoCode = videoValue => videoValue.videoCode;

const readMetricValue = videoValue => videoValue.metricValue;

const meanValues = videoValues => meanBy(videoValues, readMetricValue);

const sumValues = videoValues => sumBy(videoValues, readMetricValue);

const listDefinedValues = videoValues =>
  videoValues.filter(videoValue => videoValue.metricValue !== null);

export const resampleVideoValues = ({videoValues, isSum = false}) => {
  const units = listDefinedValues(videoValues);
  return units.length === 0
    ? null
    : resampleStatistic({
        units,
        sortKey: readVideoCode,
        statistic: isSum ? sumValues : meanValues,
        seed: RESAMPLE_SEED,
        drawCount: RESAMPLE_DRAW_COUNT,
      });
};

export const isPairedWinner = ({videoValuesA, videoValuesB}) => {
  const definedCodesB = new Set(
    listDefinedValues(videoValuesB).map(readVideoCode),
  );
  const unitsA = listDefinedValues(videoValuesA).filter(videoValue =>
    definedCodesB.has(videoValue.videoCode),
  );
  const pairedCodes = new Set(unitsA.map(readVideoCode));
  const unitsB = videoValuesB.filter(videoValue =>
    pairedCodes.has(videoValue.videoCode),
  );
  return (
    unitsA.length > 0 &&
    comparePaired({
      unitsA,
      unitsB,
      sortKey: readVideoCode,
      statistic: meanValues,
      seed: RESAMPLE_SEED,
      drawCount: RESAMPLE_DRAW_COUNT,
    }).isAWinner
  );
};
