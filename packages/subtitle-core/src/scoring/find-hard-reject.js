import {
  HardRejectReason,
  SignalState,
} from '../constants/subtitle-core-enums.js';
import {
  compareReleaseValues,
  findSeasonEpisodeConflict,
  readUsableVideoRelease,
} from './release-comparison.js';

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
