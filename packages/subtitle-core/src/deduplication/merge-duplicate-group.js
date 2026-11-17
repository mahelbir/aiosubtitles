import {groupBy, maxBy, sum, uniq} from 'es-toolkit';
import {
  measureNameOverlap,
  tokenizeReleaseName,
} from '../release-name/name-tokens.js';
import {hasValidFile, readSiteIdentityKey} from './duplicate-evidence.js';

export const pickClosestReleaseName = ({releaseNames, videoRelease}) => {
  if (releaseNames.length === 0) {
    return null;
  }
  if (videoRelease == null || videoRelease.isMeaningless) {
    return releaseNames[0];
  }
  return maxBy(releaseNames, releaseName =>
    measureNameOverlap(
      tokenizeReleaseName(releaseName),
      videoRelease.nameTokens,
    ),
  );
};

const dropAliasMembers = members => {
  const memberUrlCodes = new Set(members.map(member => member.urlCode));
  return members.filter(member => !memberUrlCodes.has(member.aliasOfUrlCode));
};

const sumDownloadCounts = copyMembers => {
  const identityDownloadCounts = Object.values(
    groupBy(copyMembers, readSiteIdentityKey),
  )
    .map(identityMembers =>
      identityMembers
        .map(member => member.siteDownloadCount)
        .filter(downloadCount => downloadCount != null),
    )
    .filter(downloadCounts => downloadCounts.length > 0)
    .map(downloadCounts => Math.max(...downloadCounts));
  return identityDownloadCounts.length === 0
    ? null
    : sum(identityDownloadCounts);
};

const countIndependentCopies = copyMembers =>
  Math.max(
    uniq(copyMembers.map(member => member.subtitleSource)).length - 1,
    0,
  );

export const mergeDuplicateGroup = ({group, videoRelease}) => {
  const {representative} = group;
  const orderedMembers = [
    representative,
    ...group.members.filter(member => member !== representative),
  ];
  const releaseNames = uniq(
    orderedMembers.flatMap(member => member.releaseNames),
  );
  const copyMembers = dropAliasMembers(orderedMembers);
  const fileMember = orderedMembers.find(hasValidFile) ?? representative;
  return {
    ...representative,
    fileFacts: fileMember.fileFacts,
    referenceComparison: fileMember.referenceComparison,
    releaseNames,
    hashMatchVideoHashes: uniq(
      orderedMembers.flatMap(member => member.hashMatchVideoHashes),
    ),
    siteDownloadCount: sumDownloadCounts(copyMembers),
    independentCopyCount: countIndependentCopies(copyMembers),
    subtitleFileName: pickClosestReleaseName({releaseNames, videoRelease}),
  };
};
