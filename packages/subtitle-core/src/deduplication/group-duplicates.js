import {groupBy, orderBy} from 'es-toolkit';
import {DuplicateTier} from '../constants/subtitle-core-enums.js';
import {areCuesNearDuplicate} from './are-cues-near-duplicate.js';
import {hasValidFile, readSiteIdentityKey} from './duplicate-evidence.js';

const readTierNumber = duplicateTier =>
  DuplicateTier.raw(duplicateTier).tierNumber;

const IDENTITY_TIER = readTierNumber(DuplicateTier.IDENTITY);
const ALIAS_TIER = readTierNumber(DuplicateTier.ALIAS);
const CONTENT_KEY_TIER = readTierNumber(DuplicateTier.CONTENT_KEY);
const NEAR_DUPLICATE_TIER = readTierNumber(DuplicateTier.NEAR_DUPLICATE);

const REPRESENTATIVE_CRITERIA = [
  candidate => Date.parse(candidate.firstSeenAt),
  candidate => candidate.urlCode,
];

const createLinkForest = size => {
  const parentIndexes = Array.from({length: size}, (_, index) => index);
  const linkTiers = Array.from({length: size}, () => null);

  const findRoot = index => {
    let rootIndex = index;
    while (parentIndexes[rootIndex] !== rootIndex) {
      rootIndex = parentIndexes[rootIndex];
    }
    parentIndexes[index] = rootIndex;
    return rootIndex;
  };

  const isJoined = (indexA, indexB) => findRoot(indexA) === findRoot(indexB);

  const link = (indexA, indexB, duplicateTier) => {
    const rootA = findRoot(indexA);
    const rootB = findRoot(indexB);
    if (rootA === rootB) {
      return;
    }
    parentIndexes[rootB] = rootA;
    linkTiers[rootA] = Math.max(
      duplicateTier,
      linkTiers[rootA] ?? duplicateTier,
      linkTiers[rootB] ?? duplicateTier,
    );
  };

  return {
    findRoot,
    isJoined,
    link,
    readTier: rootIndex => linkTiers[rootIndex],
  };
};

const linkSharedKeys = ({linkForest, indexes, readKey, duplicateTier}) => {
  const indexesByKey = groupBy(indexes, readKey);
  for (const [firstIndex, ...otherIndexes] of Object.values(indexesByKey)) {
    for (const otherIndex of otherIndexes) {
      linkForest.link(firstIndex, otherIndex, duplicateTier);
    }
  }
};

const linkAliases = (linkForest, candidates, indexes) => {
  const indexByUrlCode = new Map(
    indexes.map(index => [candidates[index].urlCode, index]),
  );
  for (const aliasIndex of indexes) {
    const targetIndex = indexByUrlCode.get(
      candidates[aliasIndex].aliasOfUrlCode,
    );
    if (targetIndex !== undefined) {
      linkForest.link(aliasIndex, targetIndex, ALIAS_TIER);
    }
  }
};

const linkNearDuplicates = (
  linkForest,
  candidates,
  fileIndexes,
  textSimilarityMin,
) => {
  const cueIndexes = fileIndexes.filter(
    index => candidates[index].fileFacts.normalizedCues != null,
  );
  cueIndexes.forEach((indexA, positionA) => {
    for (
      let positionB = positionA + 1;
      positionB < cueIndexes.length;
      positionB++
    ) {
      const indexB = cueIndexes[positionB];
      if (
        !linkForest.isJoined(indexA, indexB) &&
        areCuesNearDuplicate({
          cuesA: candidates[indexA].fileFacts.normalizedCues,
          cuesB: candidates[indexB].fileFacts.normalizedCues,
          textSimilarityMin,
        })
      ) {
        linkForest.link(indexA, indexB, NEAR_DUPLICATE_TIER);
      }
    }
  });
};

const linkDuplicates = (candidates, textSimilarityMin) => {
  const linkForest = createLinkForest(candidates.length);
  const indexes = candidates.map((_, index) => index);
  const urlIndexes = indexes.filter(
    index => candidates[index].siteFileUrl != null,
  );
  const fileIndexes = indexes.filter(index => hasValidFile(candidates[index]));

  linkSharedKeys({
    linkForest,
    indexes,
    readKey: index => readSiteIdentityKey(candidates[index]),
    duplicateTier: IDENTITY_TIER,
  });
  linkSharedKeys({
    linkForest,
    indexes: urlIndexes,
    readKey: index => candidates[index].siteFileUrl,
    duplicateTier: IDENTITY_TIER,
  });
  linkAliases(linkForest, candidates, indexes);
  linkSharedKeys({
    linkForest,
    indexes: fileIndexes,
    readKey: index => candidates[index].fileFacts.contentKey,
    duplicateTier: CONTENT_KEY_TIER,
  });
  linkNearDuplicates(linkForest, candidates, fileIndexes, textSimilarityMin);
  return {linkForest, indexes};
};

export const groupDuplicates = ({candidates, textSimilarityMin}) => {
  const {linkForest, indexes} = linkDuplicates(candidates, textSimilarityMin);
  const indexesByRoot = groupBy(indexes, linkForest.findRoot);
  return Object.entries(indexesByRoot).map(([rootIndex, memberIndexes]) => {
    const members = memberIndexes.map(index => candidates[index]);
    return {
      representative: orderBy(members, REPRESENTATIVE_CRITERIA, [
        'asc',
        'asc',
      ])[0],
      members,
      duplicateTier: linkForest.readTier(Number(rootIndex)),
    };
  });
};
