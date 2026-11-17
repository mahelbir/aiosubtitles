import {isEqual} from 'es-toolkit';
import {
  HardRejectReason,
  SignalState,
} from '../constants/subtitle-core-enums.js';

export const readUsableVideoRelease = video =>
  video.videoRelease == null || video.videoRelease.isMeaningless
    ? null
    : video.videoRelease;

export const compareReleaseValues = (
  candidateValue,
  videoValue,
  areSameValues = isEqual,
) => {
  if (candidateValue == null || videoValue == null) {
    return SignalState.UNKNOWN;
  }
  return areSameValues(candidateValue, videoValue)
    ? SignalState.MATCH
    : SignalState.CONFLICT;
};

export const readEditionState = (candidateEdition, videoEdition) => {
  if (candidateEdition == null && videoEdition == null) {
    return SignalState.UNKNOWN;
  }
  if (candidateEdition === videoEdition) {
    return SignalState.MATCH;
  }
  return candidateEdition == null || videoEdition == null
    ? SignalState.CONFLICT
    : SignalState.STRONG_CONFLICT;
};

export const isConflictState = signalState =>
  signalState === SignalState.CONFLICT ||
  signalState === SignalState.STRONG_CONFLICT;

const readRequestedNumber = (catalogNumber, nameNumbers = []) =>
  catalogNumber ?? (nameNumbers.length === 1 ? nameNumbers[0] : null);

export const findSeasonEpisodeConflict = ({
  candidateRelease,
  video,
  isSitePack = false,
}) => {
  const videoRelease = readUsableVideoRelease(video);
  const requestedSeason = readRequestedNumber(
    video.catalogSeason,
    videoRelease?.seasonNumbers,
  );
  const requestedEpisode = readRequestedNumber(
    video.catalogEpisode,
    videoRelease?.episodeNumbers,
  );
  const {seasonNumbers, episodeNumbers, isSeasonPack} = candidateRelease;
  if (requestedSeason == null || seasonNumbers.length === 0) {
    return null;
  }
  if (!seasonNumbers.includes(requestedSeason)) {
    return HardRejectReason.WRONG_SEASON;
  }
  const isPack = isSeasonPack || isSitePack;
  const hasEpisodeScope = episodeNumbers.length > (isPack ? 1 : 0);
  return requestedEpisode != null &&
    hasEpisodeScope &&
    !episodeNumbers.includes(requestedEpisode)
    ? HardRejectReason.WRONG_EPISODE
    : null;
};
