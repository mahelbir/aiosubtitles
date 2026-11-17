import {groupBy, sortBy, sumBy, uniq} from 'es-toolkit';
import {
  countMatching,
  divideOrNull,
  listUnorderedPairs,
  normalizeScore,
  summarizeVideoMeans,
} from './metric-math.js';

const NEAR_DUPLICATE_THRESHOLD_BASE = 0.9;
const CROSS_CLASS_THRESHOLD_STEP = 0.01;

const groupByVideoCode = members =>
  sortBy(Object.entries(groupBy(members, member => member.videoCode)), [
    ([videoCode]) => videoCode,
  ]);

const listVideoPairs = (rows, describePair) =>
  groupByVideoCode(rows).flatMap(([videoCode, videoRows]) =>
    listUnorderedPairs(videoRows).map(([first, second]) => ({
      videoCode,
      ...describePair(first, second),
    })),
  );

const hasEqualKey = (first, second) => first !== null && first === second;

const summarizeRecall = pairs => {
  const mergedPairCount = countMatching(pairs, pair => pair.isMerged);
  return {
    pairCount: pairs.length,
    mergedPairCount,
    recall: divideOrNull(mergedPairCount, pairs.length),
  };
};

const countDistinctPerVideo = (rows, toDistinctKeys) =>
  sumBy(
    groupByVideoCode(rows),
    ([, videoRows]) => toDistinctKeys(videoRows).length,
  );

const listTierOneClusters = videoRows => [
  ...uniq(
    videoRows
      .map(row => row.tierOneKey)
      .filter(tierOneKey => tierOneKey !== null),
  ),
  ...videoRows.filter(row => row.tierOneKey === null),
];

export const computeTierOneTwoRecall = ({rows}) => {
  const pairs = listVideoPairs(rows, (first, second) => ({
    isSameContent: first.candidateKey === second.candidateKey,
    isSameSite: first.subtitleSource === second.subtitleSource,
    isMerged: hasEqualKey(first.tierOneKey, second.tierOneKey),
  }));
  const sameContentPairs = pairs.filter(pair => pair.isSameContent);
  const falseMergePairs = pairs.filter(
    pair => pair.isMerged && !pair.isSameContent,
  );
  const clusterCount = countDistinctPerVideo(rows, listTierOneClusters);
  const groupCount = countDistinctPerVideo(rows, videoRows =>
    uniq(videoRows.map(row => row.candidateKey)),
  );
  return {
    pairRecall: {
      total: summarizeRecall(sameContentPairs),
      sameSite: summarizeRecall(
        sameContentPairs.filter(pair => pair.isSameSite),
      ),
      crossSite: summarizeRecall(
        sameContentPairs.filter(pair => !pair.isSameSite),
      ),
    },
    rowReduction: divideOrNull(
      rows.length - clusterCount,
      rows.length - groupCount,
    ),
    falseMerges: {
      pairCount: falseMergePairs.length,
      videoCodes: uniq(falseMergePairs.map(pair => pair.videoCode)),
    },
  };
};

const summarizeContentKeyPairs = pairs => {
  const equalContentKeyPairCount = countMatching(
    pairs,
    pair => pair.isEqualContentKey,
  );
  const sharedCandidateKeyPairCount = countMatching(
    pairs,
    pair => pair.isSharedCandidateKey,
  );
  const agreedPairCount = countMatching(
    pairs,
    pair => pair.isEqualContentKey && pair.isSharedCandidateKey,
  );
  return {
    equalContentKeyPairCount,
    sharedCandidateKeyPairCount,
    agreedPairCount,
    precision: divideOrNull(agreedPairCount, equalContentKeyPairCount),
    recall: divideOrNull(agreedPairCount, sharedCandidateKeyPairCount),
    crossClassPairCount: countMatching(
      pairs,
      pair => pair.isEqualContentKey && pair.isCrossClass,
    ),
    byteIdenticalSplitPairCount: countMatching(
      pairs,
      pair => pair.isByteIdentical && !pair.isEqualContentKey,
    ),
  };
};

export const computeContentKeyAgreement = ({rows}) => {
  const pairs = listVideoPairs(rows, (first, second) => ({
    isEqualContentKey: hasEqualKey(first.contentKey, second.contentKey),
    isSharedCandidateKey: first.candidateKey === second.candidateKey,
    isCrossClass: first.groupClass !== second.groupClass,
    isByteIdentical: first.rawSha256 === second.rawSha256,
  }));
  const pairsByVideo = groupBy(pairs, pair => pair.videoCode);
  const videos = groupByVideoCode(rows).map(([videoCode]) => ({
    videoCode,
    ...summarizeContentKeyPairs(pairsByVideo[videoCode] ?? []),
  }));
  return {
    total: summarizeContentKeyPairs(pairs),
    macro: summarizeVideoMeans(videos, ['precision', 'recall']),
    videos,
  };
};

const isCrossClassPair = pair => pair.groupClasses[0] !== pair.groupClasses[1];

const findSimilarityMax = pairs =>
  pairs.length === 0 ? null : Math.max(...pairs.map(pair => pair.similarity));

export const deriveNearDuplicateThreshold = ({timeEqualPairs}) => {
  const crossClassSimilarityMax = findSimilarityMax(
    timeEqualPairs.filter(isCrossClassPair),
  );
  return {
    threshold:
      crossClassSimilarityMax === null
        ? NEAR_DUPLICATE_THRESHOLD_BASE
        : normalizeScore(
            Math.max(
              NEAR_DUPLICATE_THRESHOLD_BASE,
              crossClassSimilarityMax + CROSS_CLASS_THRESHOLD_STEP,
            ),
          ),
    crossClassSimilarityMax,
  };
};

const summarizeThresholdCheck = ({pairs, threshold}) => {
  const crossClassPairs = pairs.filter(isCrossClassPair);
  const roundedThreshold = normalizeScore(threshold);
  const isMerged = pair => normalizeScore(pair.similarity) >= roundedThreshold;
  const crossClassMergeCount = countMatching(crossClassPairs, isMerged);
  const crossClassSimilarityMax = findSimilarityMax(crossClassPairs);
  return {
    isPassing: crossClassMergeCount === 0,
    pairCount: pairs.length,
    crossClassPairCount: crossClassPairs.length,
    crossClassSimilarityMax,
    crossClassMergeCount,
    sameClassMergeCount: countMatching(
      pairs,
      pair => !isCrossClassPair(pair) && isMerged(pair),
    ),
    margin:
      crossClassSimilarityMax === null
        ? null
        : normalizeScore(
            roundedThreshold - normalizeScore(crossClassSimilarityMax),
          ),
  };
};

export const checkNearDuplicateThreshold = ({pairs, threshold}) => ({
  ...summarizeThresholdCheck({pairs, threshold}),
  videos: groupByVideoCode(pairs).map(([videoCode, videoPairs]) => ({
    videoCode,
    ...summarizeThresholdCheck({pairs: videoPairs, threshold}),
  })),
});
