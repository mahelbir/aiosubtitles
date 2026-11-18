import {sumBy} from 'es-toolkit';
import {compareCueTimings} from '@repo/subtitle-core/timing/compare-cue-timings.js';
import {summarizeDefinedMean} from '../metrics/metric-math.js';
import {
  TIME_FAMILY_GRID,
  computeFamilyAgreement,
  computeTruthReferenceAgreement,
  selectTimeFamilyParameters,
} from '../metrics/time-family-metrics.js';
import {resampleVideoValues} from './video-spread.js';

export const FAMILY_AGREEMENT_FIELDS = [
  'precision',
  'recall',
  'balancedAccuracy',
];
export const TRUTH_AGREEMENT_FIELDS = ['precision', 'recall'];

const SHARE_FREE_MATCHED_CUE_SHARE_MIN = 0;

const readOrCreate = (cacheMap, cacheKey, createEntry) => {
  if (!cacheMap.has(cacheKey)) {
    cacheMap.set(cacheKey, createEntry());
  }
  return cacheMap.get(cacheKey);
};

export const createTimingComparer = () => {
  const comparisonsByReference = new Map();
  const readComparison = (reference, candidate, startToleranceMs) =>
    readOrCreate(
      readOrCreate(
        readOrCreate(comparisonsByReference, reference, () => new Map()),
        candidate,
        () => new Map(),
      ),
      startToleranceMs,
      () =>
        compareCueTimings({
          candidateCues: candidate.cues,
          referenceCues: reference.cues,
          timingSettings: {
            cueStartToleranceMs: startToleranceMs,
            matchedCueShareMin: SHARE_FREE_MATCHED_CUE_SHARE_MIN,
          },
        }),
    );
  return ({startToleranceMs, matchedShareMin}) =>
    (reference, candidate) => {
      const {isSameTimeFamily, matchedCueShare} = readComparison(
        reference,
        candidate,
        startToleranceMs,
      );
      return isSameTimeFamily && matchedCueShare >= matchedShareMin;
    };
};

const createFamilyAgreementCache = createSameFamilyCheck => {
  const agreementBySetting = new Map();
  return (setting, video) => {
    if (!agreementBySetting.has(setting)) {
      agreementBySetting.set(setting, new Map());
    }
    const agreementByVideo = agreementBySetting.get(setting);
    if (!agreementByVideo.has(video)) {
      const [videoAgreement] = computeFamilyAgreement({
        videos: [video],
        isSameTimeFamily: createSameFamilyCheck(setting),
      }).videos;
      agreementByVideo.set(video, videoAgreement);
    }
    return agreementByVideo.get(video);
  };
};

const summarizeFields = (videoEntries, fieldNames) =>
  Object.fromEntries(
    fieldNames.map(fieldName => {
      const videoValues = videoEntries.map(videoEntry => ({
        videoCode: videoEntry.videoCode,
        metricValue: videoEntry[fieldName],
      }));
      return [
        fieldName,
        {
          ...summarizeDefinedMean(
            videoValues.map(({metricValue}) => metricValue),
          ),
          spread: resampleVideoValues({videoValues}),
        },
      ];
    }),
  );

export const runTimeFamily = ({videos}) => {
  const createSameFamilyCheck = createTimingComparer();
  const readFamilyAgreement = createFamilyAgreementCache(createSameFamilyCheck);
  const selection = selectTimeFamilyParameters({
    grid: TIME_FAMILY_GRID,
    videos,
    scoreSetting: ({setting, videos: trainingVideos}) =>
      summarizeDefinedMean(
        trainingVideos.map(
          video => readFamilyAgreement(setting, video).balancedAccuracy,
        ),
      ).value,
  });
  const heldOutEntries = selection.heldOut.map(({setting}, videoIndex) => {
    const video = videos[videoIndex];
    const [truthAgreement] = computeTruthReferenceAgreement({
      videos: [video],
      isSameTimeFamily: createSameFamilyCheck(setting),
    }).videos;
    return {
      familyAgreement: readFamilyAgreement(setting, video),
      truthAgreement,
    };
  });
  const familyEntries = heldOutEntries.map(
    ({familyAgreement}) => familyAgreement,
  );
  return {
    finalSetting: selection.setting,
    finalCriterion: selection.criterion,
    familyAgreement: {
      fields: summarizeFields(familyEntries, FAMILY_AGREEMENT_FIELDS),
      crossClassSameCount: sumBy(
        familyEntries,
        ({crossClassSameCount}) => crossClassSameCount,
      ),
      videos: familyEntries,
    },
    truthAgreement: {
      fields: summarizeFields(
        heldOutEntries.map(({truthAgreement}) => truthAgreement),
        TRUTH_AGREEMENT_FIELDS,
      ),
      videos: heldOutEntries.map(({truthAgreement}) => truthAgreement),
    },
  };
};
