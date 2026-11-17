import {mean, round, sumBy} from 'es-toolkit';

export const SCORE_DECIMALS = 6;

export const normalizeScore = metricValue => round(metricValue, SCORE_DECIMALS);

export const countMatching = (members, predicate) =>
  sumBy(members, member => (predicate(member) ? 1 : 0));

export const divideOrNull = (numerator, denominator) =>
  denominator === 0 ? null : numerator / denominator;

export const summarizeDefinedMean = values => {
  const definedValues = values.filter(entry => entry !== null);
  return {
    value: definedValues.length === 0 ? null : mean(definedValues),
    definedVideoCount: definedValues.length,
    videoCount: values.length,
  };
};

export const summarizeVideoMeans = (videos, fieldNames) =>
  Object.fromEntries(
    fieldNames.map(fieldName => [
      fieldName,
      summarizeDefinedMean(videos.map(video => video[fieldName])),
    ]),
  );

export const listUnorderedPairs = members =>
  members.flatMap((first, firstIndex) =>
    members.slice(firstIndex + 1).map(second => [first, second]),
  );

export const listOrderedPairs = members =>
  members.flatMap((first, firstIndex) =>
    members
      .filter((_, secondIndex) => secondIndex !== firstIndex)
      .map(second => [first, second]),
  );
