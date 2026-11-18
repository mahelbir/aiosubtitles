import {isEqual} from 'es-toolkit';
import {ScoringSignal, SignalState} from '../constants/subtitle-core-enums.js';
import {measureNameOverlap} from '../release-name/name-tokens.js';
import {inferReleaseSourceFamilyFromAudio} from '../release-name/release-source-family.js';
import {
  compareReleaseValues,
  readEditionState,
  readUsableVideoRelease,
} from './release-comparison.js';
import {verifyHashMatch} from './verify-hash-match.js';

export const RELEASE_NAME_SIGNALS = Object.freeze([
  ScoringSignal.EXACT_NAME,
  ScoringSignal.RELEASE_GROUP,
  ScoringSignal.RELEASE_SOURCE_FAMILY,
  ScoringSignal.AUDIO_SOURCE_FAMILY_HINT,
  ScoringSignal.STREAMING_SERVICE,
  ScoringSignal.RELEASE_EDITION,
  ScoringSignal.NAME_FPS,
  ScoringSignal.RESOLUTION,
  ScoringSignal.WORD_OVERLAP,
]);

const FRAME_RATE_TOLERANCE = 0.01;
const CUE_SHAPE_MIN_END_SHARE = 0.5;
const CUE_SHAPE_MAX_END_SHARE = 1.25;
const CUE_SHAPE_MIN_CUES_PER_MINUTE = 1;
const MS_PER_MINUTE = 60_000;

const UNKNOWN_READING = Object.freeze({
  signalState: SignalState.UNKNOWN,
  signalMagnitude: 0,
});

const readState = signalState =>
  signalState === SignalState.UNKNOWN
    ? UNKNOWN_READING
    : {signalState, signalMagnitude: 1};

const readMagnitude = signalMagnitude =>
  signalMagnitude == null
    ? UNKNOWN_READING
    : {signalState: SignalState.MATCH, signalMagnitude};

const readFlag = (siteFlag, stateWhenSet) =>
  readState(siteFlag === true ? stateWhenSet : SignalState.UNKNOWN);

const areSameTexts = (candidateText, videoText) =>
  candidateText.toLowerCase() === videoText.toLowerCase();

const areSameFrameRates = (candidateFrameRate, videoFrameRate) =>
  Math.abs(candidateFrameRate - videoFrameRate) < FRAME_RATE_TOLERANCE;

const readVideoSourceFamily = videoRelease =>
  videoRelease.releaseSourceFamily ??
  inferReleaseSourceFamilyFromAudio(videoRelease.audioTags);

const readCueShapeState = (fileFacts, catalogDurationMs) => {
  if (
    fileFacts == null ||
    catalogDurationMs == null ||
    catalogDurationMs <= 0
  ) {
    return SignalState.UNKNOWN;
  }
  const endShare = fileFacts.lastCueEndMs / catalogDurationMs;
  const cuesPerMinute =
    fileFacts.cueCount / (catalogDurationMs / MS_PER_MINUTE);
  return endShare >= CUE_SHAPE_MIN_END_SHARE &&
    endShare <= CUE_SHAPE_MAX_END_SHARE &&
    cuesPerMinute >= CUE_SHAPE_MIN_CUES_PER_MINUTE
    ? SignalState.MATCH
    : SignalState.CONFLICT;
};

const readReferenceFamilyState = referenceComparison => {
  if (referenceComparison == null) {
    return SignalState.UNKNOWN;
  }
  return referenceComparison.isSameTimeFamily
    ? SignalState.MATCH
    : SignalState.CONFLICT;
};

const readNameSignals = (candidateRelease, videoRelease) => {
  if (candidateRelease == null || videoRelease == null) {
    return Object.fromEntries(
      RELEASE_NAME_SIGNALS.map(scoringSignal => [
        scoringSignal,
        UNKNOWN_READING,
      ]),
    );
  }
  const hasNameTokens = candidateRelease.nameTokens.length > 0;
  return {
    [ScoringSignal.EXACT_NAME]: readState(
      hasNameTokens &&
        isEqual(candidateRelease.nameTokens, videoRelease.nameTokens)
        ? SignalState.MATCH
        : SignalState.UNKNOWN,
    ),
    [ScoringSignal.RELEASE_GROUP]: readState(
      compareReleaseValues(
        candidateRelease.releaseGroup,
        videoRelease.releaseGroup,
        areSameTexts,
      ),
    ),
    [ScoringSignal.RELEASE_SOURCE_FAMILY]: readState(
      compareReleaseValues(
        candidateRelease.releaseSourceFamily,
        videoRelease.releaseSourceFamily,
      ),
    ),
    [ScoringSignal.AUDIO_SOURCE_FAMILY_HINT]: readState(
      compareReleaseValues(
        inferReleaseSourceFamilyFromAudio(candidateRelease.audioTags),
        readVideoSourceFamily(videoRelease),
      ),
    ),
    [ScoringSignal.STREAMING_SERVICE]: readState(
      compareReleaseValues(
        candidateRelease.streamingService,
        videoRelease.streamingService,
        areSameTexts,
      ),
    ),
    [ScoringSignal.RELEASE_EDITION]: readState(
      readEditionState(
        candidateRelease.releaseEdition,
        videoRelease.releaseEdition,
      ),
    ),
    [ScoringSignal.NAME_FPS]: readState(
      compareReleaseValues(
        candidateRelease.frameRate,
        videoRelease.frameRate,
        areSameFrameRates,
      ),
    ),
    [ScoringSignal.RESOLUTION]: readState(
      compareReleaseValues(
        candidateRelease.resolutionHeight,
        videoRelease.resolutionHeight,
      ),
    ),
    [ScoringSignal.WORD_OVERLAP]: hasNameTokens
      ? readMagnitude(
          measureNameOverlap(
            candidateRelease.nameTokens,
            videoRelease.nameTokens,
          ),
        )
      : UNKNOWN_READING,
  };
};

const isHashMatchVerified = ({candidate, candidateRelease, video}) =>
  video.videoHash != null &&
  candidate.hashMatchVideoHashes.includes(video.videoHash) &&
  verifyHashMatch({candidateRelease, video, isSitePack: candidate.isSitePack});

const hasVideoInformation = video =>
  video.videoHash != null || readUsableVideoRelease(video) != null;

const readVariantCount = (variantCount, video) =>
  hasVideoInformation(video) ? UNKNOWN_READING : readMagnitude(variantCount);

export const extractCandidateSignals = ({candidate, video}) => ({
  [ScoringSignal.TRUSTED_UPLOADER]: readFlag(
    candidate.isUploaderTrusted,
    SignalState.MATCH,
  ),
  [ScoringSignal.DOWNLOAD_COUNT]: readMagnitude(
    candidate.siteDownloadCount > 0
      ? Math.log10(candidate.siteDownloadCount)
      : null,
  ),
  [ScoringSignal.MACHINE_TRANSLATED]: readFlag(
    candidate.isMachineTranslated,
    SignalState.CONFLICT,
  ),
  [ScoringSignal.HEARING_IMPAIRED]: readFlag(
    candidate.isHearingImpaired,
    SignalState.CONFLICT,
  ),
  [ScoringSignal.FORCED]: readFlag(candidate.isForced, SignalState.CONFLICT),
  [ScoringSignal.QUOTA_COSTLY]: readFlag(
    candidate.isQuotaCostly,
    SignalState.CONFLICT,
  ),
  [ScoringSignal.REFERENCE_FAMILY]: readState(
    readReferenceFamilyState(candidate.referenceComparison),
  ),
  [ScoringSignal.CUE_SHAPE]: readState(
    readCueShapeState(candidate.fileFacts, video.catalogDurationMs),
  ),
  [ScoringSignal.INDEPENDENT_COPIES]: readMagnitude(
    candidate.independentCopyCount,
  ),
  [ScoringSignal.VARIANT_REFERENCE_FAMILY]: readVariantCount(
    candidate.variantReferenceFamilyCount,
    video,
  ),
  [ScoringSignal.VARIANT_HASH_MATCH]: readVariantCount(
    candidate.variantHashMatchCount,
    video,
  ),
});

export const extractReleaseSignals = ({
  candidate,
  candidateRelease,
  video,
}) => ({
  [ScoringSignal.HASH_MATCH]: readState(
    isHashMatchVerified({candidate, candidateRelease, video})
      ? SignalState.MATCH
      : SignalState.UNKNOWN,
  ),
  ...readNameSignals(candidateRelease, readUsableVideoRelease(video)),
});

export const extractSignals = ({candidate, candidateRelease, video}) => ({
  ...extractCandidateSignals({candidate, video}),
  ...extractReleaseSignals({candidate, candidateRelease, video}),
});
