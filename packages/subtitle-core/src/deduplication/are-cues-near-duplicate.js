import {distance} from 'fastest-levenshtein';

export const NEAR_DUPLICATE_TEXT_SIMILARITY_MIN = 0.9;

const EARLY_EXIT_EPSILON = 1e-9;

export const measureTextSimilarity = (textA, textB) => {
  const longerLength = Math.max(textA.length, textB.length);
  return longerLength === 0 ? 1 : 1 - distance(textA, textB) / longerLength;
};

const haveSameTimings = (cuesA, cuesB) =>
  cuesA.every(
    (cueA, cueIndex) =>
      cueA.startMs === cuesB[cueIndex].startMs &&
      cueA.endMs === cuesB[cueIndex].endMs,
  );

export const areCuesNearDuplicate = ({cuesA, cuesB, textSimilarityMin}) => {
  if (cuesA.length === 0 || cuesA.length !== cuesB.length) {
    return false;
  }
  if (!haveSameTimings(cuesA, cuesB)) {
    return false;
  }
  const textLossMax =
    (1 - textSimilarityMin) * cuesA.length + EARLY_EXIT_EPSILON;
  let textLossSum = 0;
  let textSimilaritySum = 0;
  for (const [cueIndex, cueA] of cuesA.entries()) {
    const textSimilarity = measureTextSimilarity(
      cueA.text,
      cuesB[cueIndex].text,
    );
    textSimilaritySum += textSimilarity;
    textLossSum += 1 - textSimilarity;
    if (textLossSum > textLossMax) {
      return false;
    }
  }
  return textSimilaritySum / cuesA.length >= textSimilarityMin;
};
