import {isEqual} from 'es-toolkit';
import {
  HardRejectReason,
  SignalState,
} from '../constants/subtitle-core-enums.js';
import {tokenizeReleaseName} from '../release-name/name-tokens.js';
import {
  compareReleaseValues,
  findSeasonEpisodeConflict,
  readUsableVideoRelease,
} from './release-comparison.js';

const COMBINING_MARKS = /\p{M}/gu;
const APOSTROPHES = /['’ʼ]/gu;
const SINGLE_LETTER = /^\p{L}$/u;

const joinSingleLetterRuns = titleTokens =>
  titleTokens.reduce((joinedTokens, titleToken, tokenIndex) => {
    const isLetterRun =
      tokenIndex > 0 &&
      SINGLE_LETTER.test(titleToken) &&
      SINGLE_LETTER.test(titleTokens[tokenIndex - 1]);
    if (isLetterRun) {
      joinedTokens[joinedTokens.length - 1] += titleToken;
    } else {
      joinedTokens.push(titleToken);
    }
    return joinedTokens;
  }, []);

export const normalizeReleaseTitle = releaseTitle =>
  joinSingleLetterRuns(
    tokenizeReleaseName(
      releaseTitle
        .normalize('NFKD')
        .replaceAll(COMBINING_MARKS, '')
        .replaceAll(APOSTROPHES, '')
        .replaceAll('&', ' and '),
    ),
  );

const areSameTitles = (candidateTitle, videoTitle) =>
  isEqual(
    normalizeReleaseTitle(candidateTitle),
    normalizeReleaseTitle(videoTitle),
  );

const findReleaseRejectReason = ({candidateRelease, video, isSitePack}) => {
  if (candidateRelease.partNumber != null) {
    return HardRejectReason.CD_PART;
  }
  const seasonEpisodeReason = findSeasonEpisodeConflict({
    candidateRelease,
    video,
    isSitePack,
  });
  if (seasonEpisodeReason != null) {
    return seasonEpisodeReason;
  }
  const videoRelease = readUsableVideoRelease(video);
  if (videoRelease == null) {
    return null;
  }
  if (
    compareReleaseValues(
      candidateRelease.releaseTitle,
      videoRelease.releaseTitle,
      areSameTitles,
    ) === SignalState.CONFLICT
  ) {
    return HardRejectReason.WRONG_TITLE;
  }
  return compareReleaseValues(
    candidateRelease.releaseYear,
    videoRelease.releaseYear,
  ) === SignalState.CONFLICT
    ? HardRejectReason.WRONG_YEAR
    : null;
};

export const findReleaseRejectReasons = ({
  candidate,
  candidateReleases,
  video,
}) =>
  candidateReleases.map(candidateRelease =>
    findReleaseRejectReason({
      candidateRelease,
      video,
      isSitePack: candidate.isSitePack,
    }),
  );

export const pickHardRejectReason = ({candidate, releaseRejectReasons}) => {
  if (candidate.fileFacts?.isFileValid === false) {
    return HardRejectReason.INVALID_FILE;
  }
  return releaseRejectReasons.length > 0 &&
    releaseRejectReasons.every(rejectReason => rejectReason != null)
    ? releaseRejectReasons[0]
    : null;
};

export const findHardRejectReason = ({candidate, candidateReleases, video}) =>
  pickHardRejectReason({
    candidate,
    releaseRejectReasons: findReleaseRejectReasons({
      candidate,
      candidateReleases,
      video,
    }),
  });
