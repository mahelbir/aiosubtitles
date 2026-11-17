import {orderBy, sumBy} from 'es-toolkit';
import {RankingLabel} from '../constants/ranking-label.js';
import {countMatching, normalizeScore} from './metric-math.js';

const TIED_PAIR_SHARE = 0.5;

const isPositive = group => group.isPositive;

const isNegative = group => group.isNegative;

const classifyGroups = ({rankedGroups, label}) => {
  const {positiveClasses, negativeClasses} = RankingLabel.item(label);
  return rankedGroups.map(group => ({
    score: normalizeScore(group.groupScore),
    isValid: group.isValid,
    isPositive: positiveClasses.includes(group.groupClass),
    isNegative: negativeClasses.includes(group.groupClass),
  }));
};

const listValidGroups = ranking =>
  classifyGroups(ranking).filter(group => group.isValid);

const buildTieBlocks = groups =>
  orderBy(groups, [group => group.score], ['desc']).reduce((blocks, group) => {
    const lastBlock = blocks.at(-1);
    if (lastBlock?.[0].score === group.score) {
      lastBlock.push(group);
    } else {
      blocks.push([group]);
    }
    return blocks;
  }, []);

const compareScores = (first, second) => {
  if (first > second) {
    return 1;
  }
  return first === second ? TIED_PAIR_SHARE : 0;
};

const locateFirstPositiveBlock = groups => {
  const blocks = buildTieBlocks(groups);
  const blockIndex = blocks.findIndex(block => block.some(isPositive));
  if (blockIndex === -1) {
    return null;
  }
  const block = blocks[blockIndex];
  return {
    groupsAbove: blocks.slice(0, blockIndex).flat(),
    blockSize: block.length,
    positiveCount: countMatching(block, isPositive),
    negativeCount: countMatching(block, isNegative),
  };
};

const computeTopShare = (ranking, predicate) => {
  const [topBlock] = buildTieBlocks(listValidGroups(ranking));
  return topBlock ? countMatching(topBlock, predicate) / topBlock.length : null;
};

export const computePairOrder = ranking => {
  const groups = listValidGroups(ranking);
  const positives = groups.filter(isPositive);
  const negatives = groups.filter(isNegative);
  if (positives.length === 0 || negatives.length === 0) {
    return null;
  }
  const pairCredit = sumBy(positives, positive =>
    sumBy(negatives, negative => compareScores(positive.score, negative.score)),
  );
  return pairCredit / (positives.length * negatives.length);
};

export const computeTopOne = ranking => computeTopShare(ranking, isPositive);

export const computeFirstPositiveRank = ranking => {
  const firstBlock = locateFirstPositiveBlock(listValidGroups(ranking));
  if (!firstBlock) {
    return null;
  }
  const {groupsAbove, blockSize, positiveCount, negativeCount} = firstBlock;
  return {
    firstPositiveRank:
      groupsAbove.length + (blockSize + 1) / (positiveCount + 1),
    negativesAbove:
      countMatching(groupsAbove, isNegative) +
      negativeCount / (positiveCount + 1),
  };
};

export const computeReciprocalRank = ranking => {
  const firstBlock = locateFirstPositiveBlock(listValidGroups(ranking));
  if (!firstBlock) {
    return null;
  }
  const {groupsAbove, blockSize, positiveCount} = firstBlock;
  let missProbability = 1;
  let reciprocalRank = 0;
  for (
    let position = 1;
    position <= blockSize - positiveCount + 1;
    position += 1
  ) {
    const remainingCount = blockSize - position + 1;
    const hitProbability = (missProbability * positiveCount) / remainingCount;
    reciprocalRank += hitProbability / (groupsAbove.length + position);
    missProbability *= (remainingCount - positiveCount) / remainingCount;
  }
  return reciprocalRank;
};

export const computeWorstError = ranking =>
  computeTopShare(ranking, isNegative);

export const countInvalidAbovePositive = ranking => {
  const groups = classifyGroups(ranking);
  const [bestPositive] = buildTieBlocks(
    groups.filter(group => group.isValid && group.isPositive),
  );
  if (!bestPositive) {
    return null;
  }
  const bestScore = bestPositive[0].score;
  return sumBy(
    groups.filter(group => !group.isValid),
    group => compareScores(group.score, bestScore),
  );
};

export const isInformativeVideo = ranking => {
  const groups = listValidGroups(ranking);
  return groups.some(isPositive) && !groups.every(isPositive);
};
