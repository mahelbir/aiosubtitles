import {SignalState} from '../constants/subtitle-core-enums.js';
import {
  compareReleaseValues,
  findSeasonEpisodeConflict,
  readEditionState,
  readUsableVideoRelease,
} from './release-comparison.js';

export const verifyHashMatch = ({
  candidateRelease,
  video,
  isSitePack = false,
}) => {
  if (candidateRelease == null) {
    return true;
  }
  if (
    findSeasonEpisodeConflict({candidateRelease, video, isSitePack}) != null
  ) {
    return false;
  }
  const videoRelease = readUsableVideoRelease(video);
  if (videoRelease == null) {
    return true;
  }
  const sourceFamilyState = compareReleaseValues(
    candidateRelease.releaseSourceFamily,
    videoRelease.releaseSourceFamily,
  );
  return (
    sourceFamilyState !== SignalState.CONFLICT &&
    readEditionState(
      candidateRelease.releaseEdition,
      videoRelease.releaseEdition,
    ) !== SignalState.STRONG_CONFLICT
  );
};
