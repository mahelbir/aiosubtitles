import {describe, expect, it} from 'vitest';
import {
  ReleaseEdition,
  ReleaseSourceFamily,
  ScoringSignal,
  SignalState,
} from '../../src/constants/subtitle-core-enums.js';
import {measureNameOverlap} from '../../src/release-name/name-tokens.js';
import {extractSignals} from '../../src/scoring/extract-signals.js';
import {makeFileFacts} from '../helpers/deduplication-fixtures.js';
import {
  makeCandidate,
  makeNamedRelease,
  makeReleaseInfo,
  makeVideo,
} from '../helpers/factories.js';

const VIDEO_NAME = 'Show.S01E01.1080p.NF.WEB-DL.DDP5.1-NTb';
const NAME_SIGNALS = [
  ScoringSignal.EXACT_NAME,
  ScoringSignal.RELEASE_GROUP,
  ScoringSignal.RELEASE_SOURCE_FAMILY,
  ScoringSignal.AUDIO_SOURCE_FAMILY_HINT,
  ScoringSignal.STREAMING_SERVICE,
  ScoringSignal.RELEASE_EDITION,
  ScoringSignal.NAME_FPS,
  ScoringSignal.RESOLUTION,
  ScoringSignal.WORD_OVERLAP,
];

const makeVideoRelease = (overrides = {}) =>
  makeNamedRelease(VIDEO_NAME, {
    seasonNumbers: [1],
    episodeNumbers: [1],
    releaseGroup: 'NTb',
    releaseSourceFamily: ReleaseSourceFamily.WEB,
    streamingService: 'NF',
    resolutionHeight: 1080,
    audioTags: ['EAC3'],
    frameRate: 23.976,
    ...overrides,
  });

const makeNamedVideo = (videoOverrides = {}, releaseOverrides = {}) =>
  makeVideo({
    catalogSeason: 1,
    catalogEpisode: 1,
    videoRelease: makeVideoRelease(releaseOverrides),
    ...videoOverrides,
  });

const readSignals = ({
  candidate = makeCandidate(),
  candidateRelease = makeReleaseInfo(),
  video = makeNamedVideo(),
} = {}) => extractSignals({candidate, candidateRelease, video});

const expectSignal = (signals, scoringSignal, signalReading) =>
  expect(signals).toMatchObject({[scoringSignal]: signalReading});

const expectAllUnknown = (signals, scoringSignals) =>
  expect(signals).toMatchObject(
    Object.fromEntries(
      scoringSignals.map(scoringSignal => [
        scoringSignal,
        {signalState: SignalState.UNKNOWN},
      ]),
    ),
  );

describe('extractSignals', () => {
  describe('name signals', () => {
    const richRelease = makeVideoRelease({
      releaseEdition: ReleaseEdition.EXTENDED,
    });

    it('reads every name signal as unknown for a meaningless video name', () => {
      const signals = readSignals({
        candidateRelease: richRelease,
        video: makeNamedVideo({}, {isMeaningless: true}),
      });
      expectAllUnknown(signals, NAME_SIGNALS);
    });

    it('reads every name signal as unknown without a video name', () => {
      const signals = readSignals({
        candidateRelease: richRelease,
        video: makeVideo({catalogSeason: 1, catalogEpisode: 1}),
      });
      expectAllUnknown(signals, NAME_SIGNALS);
    });

    it('matches an identical name', () => {
      const signals = readSignals({candidateRelease: makeVideoRelease()});
      expectSignal(signals, ScoringSignal.EXACT_NAME, {
        signalState: SignalState.MATCH,
      });
    });

    it('does not match a different name as exact', () => {
      const signals = readSignals({
        candidateRelease: makeNamedRelease(
          'Show.S01E01.720p.NF.WEB-DL.DDP5.1-NTb',
        ),
      });
      expect(signals?.[ScoringSignal.EXACT_NAME]?.signalState).toBeDefined();
      expect(signals[ScoringSignal.EXACT_NAME].signalState).not.toBe(
        SignalState.MATCH,
      );
    });

    it('measures word overlap as the Jaccard of the name tokens', () => {
      const candidateRelease = makeNamedRelease(
        'Show.S01E01.720p.AMZN.WEB-DL.DDP5.1-NTb',
      );
      const signals = readSignals({candidateRelease});
      expectSignal(signals, ScoringSignal.WORD_OVERLAP, {
        signalState: SignalState.MATCH,
        signalMagnitude: expect.closeTo(
          measureNameOverlap(
            candidateRelease.nameTokens,
            makeVideoRelease().nameTokens,
          ),
        ),
      });
    });

    it.each([
      [
        ScoringSignal.RELEASE_GROUP,
        {releaseGroup: 'NTb'},
        {releaseGroup: 'FLUX'},
      ],
      [
        ScoringSignal.RELEASE_SOURCE_FAMILY,
        {releaseSourceFamily: ReleaseSourceFamily.WEB},
        {releaseSourceFamily: ReleaseSourceFamily.BLURAY},
      ],
      [
        ScoringSignal.STREAMING_SERVICE,
        {streamingService: 'NF'},
        {streamingService: 'AMZN'},
      ],
      [ScoringSignal.NAME_FPS, {frameRate: 23.976}, {frameRate: 25}],
    ])(
      'reads %s as a match when equal and a conflict when different',
      (scoringSignal, sameFields, otherFields) => {
        expectSignal(
          readSignals({candidateRelease: makeReleaseInfo(sameFields)}),
          scoringSignal,
          {signalState: SignalState.MATCH},
        );
        expectSignal(
          readSignals({candidateRelease: makeReleaseInfo(otherFields)}),
          scoringSignal,
          {signalState: SignalState.CONFLICT},
        );
      },
    );

    it.each([
      ScoringSignal.RELEASE_GROUP,
      ScoringSignal.RELEASE_SOURCE_FAMILY,
      ScoringSignal.STREAMING_SERVICE,
      ScoringSignal.NAME_FPS,
      ScoringSignal.RESOLUTION,
    ])(
      'reads %s as unknown when the candidate name lacks it',
      scoringSignal => {
        expectSignal(
          readSignals({candidateRelease: makeReleaseInfo()}),
          scoringSignal,
          {signalState: SignalState.UNKNOWN},
        );
      },
    );

    it('matches an equal resolution', () => {
      expectSignal(
        readSignals({
          candidateRelease: makeReleaseInfo({resolutionHeight: 1080}),
        }),
        ScoringSignal.RESOLUTION,
        {signalState: SignalState.MATCH},
      );
    });

    it('matches an equal edition', () => {
      expectSignal(
        readSignals({
          candidateRelease: makeReleaseInfo({
            releaseEdition: ReleaseEdition.EXTENDED,
          }),
          video: makeNamedVideo({}, {releaseEdition: ReleaseEdition.EXTENDED}),
        }),
        ScoringSignal.RELEASE_EDITION,
        {signalState: SignalState.MATCH},
      );
    });

    it('reads two different editions as a strong conflict', () => {
      expectSignal(
        readSignals({
          candidateRelease: makeReleaseInfo({
            releaseEdition: ReleaseEdition.DIRECTORS_CUT,
          }),
          video: makeNamedVideo({}, {releaseEdition: ReleaseEdition.EXTENDED}),
        }),
        ScoringSignal.RELEASE_EDITION,
        {signalState: SignalState.STRONG_CONFLICT},
      );
    });

    it('reads an edition carried by one name only as a conflict', () => {
      expectSignal(
        readSignals({
          candidateRelease: makeReleaseInfo({
            releaseEdition: ReleaseEdition.EXTENDED,
          }),
        }),
        ScoringSignal.RELEASE_EDITION,
        {signalState: SignalState.CONFLICT},
      );
      expectSignal(
        readSignals({
          candidateRelease: makeReleaseInfo(),
          video: makeNamedVideo({}, {releaseEdition: ReleaseEdition.EXTENDED}),
        }),
        ScoringSignal.RELEASE_EDITION,
        {signalState: SignalState.CONFLICT},
      );
    });

    it('reads a different resolution as a conflict', () => {
      expectSignal(
        readSignals({
          candidateRelease: makeReleaseInfo({resolutionHeight: 720}),
        }),
        ScoringSignal.RESOLUTION,
        {signalState: SignalState.CONFLICT},
      );
    });

    it('reads a different name as unknown, never a conflict', () => {
      const signals = readSignals({
        candidateRelease: makeNamedRelease('Other.Show.S01E01.720p-FLUX'),
      });
      expectAllUnknown(signals, [ScoringSignal.EXACT_NAME]);
    });

    it('reads the name signals of a candidate without a release name', () => {
      const signals = extractSignals({
        candidate: makeCandidate({hashMatchVideoHashes: ['h1']}),
        candidateRelease: null,
        video: makeNamedVideo({videoHash: 'h1'}),
      });
      expectAllUnknown(signals, NAME_SIGNALS);
      expectSignal(signals, ScoringSignal.HASH_MATCH, {
        signalState: SignalState.MATCH,
      });
    });

    it('reads the edition as unknown when neither name carries one', () => {
      expectSignal(
        readSignals({candidateRelease: makeReleaseInfo()}),
        ScoringSignal.RELEASE_EDITION,
        {signalState: SignalState.UNKNOWN},
      );
    });

    it('matches an audio hint that agrees with the video source', () => {
      expectSignal(
        readSignals({candidateRelease: makeReleaseInfo({audioTags: ['DDP']})}),
        ScoringSignal.AUDIO_SOURCE_FAMILY_HINT,
        {signalState: SignalState.MATCH},
      );
    });

    it('conflicts on an audio hint that contradicts the video source', () => {
      expectSignal(
        readSignals({
          candidateRelease: makeReleaseInfo({audioTags: ['TrueHD']}),
        }),
        ScoringSignal.AUDIO_SOURCE_FAMILY_HINT,
        {signalState: SignalState.CONFLICT},
      );
    });

    it('reads the audio hint as unknown without a hinting tag', () => {
      expectSignal(
        readSignals({candidateRelease: makeReleaseInfo({audioTags: ['AAC']})}),
        ScoringSignal.AUDIO_SOURCE_FAMILY_HINT,
        {signalState: SignalState.UNKNOWN},
      );
    });
  });

  describe('site signals', () => {
    it('reads site flags without any video information', () => {
      const signals = readSignals({
        candidate: makeCandidate({
          isUploaderTrusted: true,
          isMachineTranslated: true,
          isHearingImpaired: true,
          isForced: true,
          siteDownloadCount: 1000,
        }),
        video: makeVideo(),
      });
      expect(signals).toMatchObject({
        [ScoringSignal.TRUSTED_UPLOADER]: {signalState: SignalState.MATCH},
        [ScoringSignal.MACHINE_TRANSLATED]: {
          signalState: SignalState.CONFLICT,
        },
        [ScoringSignal.HEARING_IMPAIRED]: {signalState: SignalState.CONFLICT},
        [ScoringSignal.FORCED]: {signalState: SignalState.CONFLICT},
        [ScoringSignal.DOWNLOAD_COUNT]: {
          signalState: SignalState.MATCH,
          signalMagnitude: expect.closeTo(3),
        },
      });
    });

    it('reads unknown site flags as unknown', () => {
      expectAllUnknown(readSignals({video: makeVideo()}), [
        ScoringSignal.TRUSTED_UPLOADER,
        ScoringSignal.MACHINE_TRANSLATED,
        ScoringSignal.HEARING_IMPAIRED,
        ScoringSignal.FORCED,
        ScoringSignal.DOWNLOAD_COUNT,
      ]);
    });

    it('takes copy and variant counts as magnitudes', () => {
      const signals = readSignals({
        candidate: makeCandidate({
          independentCopyCount: 2,
          variantReferenceFamilyCount: 3,
          variantHashMatchCount: 1,
        }),
        video: makeVideo(),
      });
      expect(signals).toMatchObject({
        [ScoringSignal.INDEPENDENT_COPIES]: {
          signalState: SignalState.MATCH,
          signalMagnitude: 2,
        },
        [ScoringSignal.VARIANT_REFERENCE_FAMILY]: {
          signalState: SignalState.MATCH,
          signalMagnitude: 3,
        },
        [ScoringSignal.VARIANT_HASH_MATCH]: {
          signalState: SignalState.MATCH,
          signalMagnitude: 1,
        },
      });
    });
  });

  describe('file signals', () => {
    it.each([
      [true, SignalState.MATCH],
      [false, SignalState.CONFLICT],
    ])(
      'reads the reference time family %s as %s',
      (isSameTimeFamily, signalState) => {
        expectSignal(
          readSignals({
            candidate: makeCandidate({referenceComparison: {isSameTimeFamily}}),
          }),
          ScoringSignal.REFERENCE_FAMILY,
          {signalState},
        );
      },
    );

    it('reads the reference family as unknown without a comparison', () => {
      expectSignal(readSignals(), ScoringSignal.REFERENCE_FAMILY, {
        signalState: SignalState.UNKNOWN,
      });
    });

    it('reads the cue shape as unknown without a catalog duration', () => {
      expectSignal(
        readSignals({
          candidate: makeCandidate({fileFacts: makeFileFacts()}),
          video: makeVideo({catalogDurationMs: null}),
        }),
        ScoringSignal.CUE_SHAPE,
        {signalState: SignalState.UNKNOWN},
      );
    });

    it('reads the cue shape as unknown without a downloaded file', () => {
      expectSignal(
        readSignals({video: makeVideo({catalogDurationMs: 7_200_000})}),
        ScoringSignal.CUE_SHAPE,
        {signalState: SignalState.UNKNOWN},
      );
    });

    it('conflicts on a file far shorter than the catalog duration', () => {
      expectSignal(
        readSignals({
          candidate: makeCandidate({
            fileFacts: makeFileFacts({cueCount: 3, lastCueEndMs: 9000}),
          }),
          video: makeVideo({catalogDurationMs: 7_200_000}),
        }),
        ScoringSignal.CUE_SHAPE,
        {signalState: SignalState.CONFLICT},
      );
    });

    it('matches a file whose cues fill the catalog duration', () => {
      expectSignal(
        readSignals({
          candidate: makeCandidate({
            fileFacts: makeFileFacts({cueCount: 1400, lastCueEndMs: 7_080_000}),
          }),
          video: makeVideo({catalogDurationMs: 7_200_000}),
        }),
        ScoringSignal.CUE_SHAPE,
        {signalState: SignalState.MATCH},
      );
    });
  });

  describe('hash match', () => {
    it('matches a verified hash of the video', () => {
      expectSignal(
        readSignals({
          candidate: makeCandidate({hashMatchVideoHashes: ['h1']}),
          candidateRelease: makeReleaseInfo({
            releaseSourceFamily: ReleaseSourceFamily.WEB,
          }),
          video: makeNamedVideo({videoHash: 'h1'}),
        }),
        ScoringSignal.HASH_MATCH,
        {signalState: SignalState.MATCH},
      );
    });

    it('does not match a hash that fails verification', () => {
      const signals = readSignals({
        candidate: makeCandidate({hashMatchVideoHashes: ['h1']}),
        candidateRelease: makeReleaseInfo({
          releaseSourceFamily: ReleaseSourceFamily.BLURAY,
        }),
        video: makeNamedVideo({videoHash: 'h1'}),
      });
      expect(signals?.[ScoringSignal.HASH_MATCH]?.signalState).toBeDefined();
      expect(signals[ScoringSignal.HASH_MATCH].signalState).not.toBe(
        SignalState.MATCH,
      );
    });

    it('reads the hash as unknown when the video has none', () => {
      expectSignal(
        readSignals({
          candidate: makeCandidate({hashMatchVideoHashes: ['h1']}),
          video: makeVideo(),
        }),
        ScoringSignal.HASH_MATCH,
        {signalState: SignalState.UNKNOWN},
      );
    });
  });
});
