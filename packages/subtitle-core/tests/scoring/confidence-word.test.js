import {describe, expect, it} from 'vitest';
import {
  ConfidenceWord,
  ScoringSignal,
  SignalState,
} from '../../src/constants/subtitle-core-enums.js';
import {getConfidenceWord} from '../../src/scoring/confidence-word.js';
import {makeSignalReading, makeSignalSet} from '../helpers/factories.js';

const MATCH_READING = makeSignalReading();
const CONFLICT_READING = makeSignalReading({
  signalState: SignalState.CONFLICT,
});
const GROUP_AND_FAMILY_MATCH = {
  [ScoringSignal.RELEASE_GROUP]: MATCH_READING,
  [ScoringSignal.RELEASE_SOURCE_FAMILY]: MATCH_READING,
};

describe('getConfidenceWord', () => {
  it('says Exact on a valid hash match', () => {
    expect(
      getConfidenceWord({signals: makeSignalSet(), isHashValid: true}),
    ).toBe(ConfidenceWord.EXACT);
  });

  it('says Exact on the same time family as the reference', () => {
    expect(
      getConfidenceWord({
        signals: makeSignalSet({
          [ScoringSignal.REFERENCE_FAMILY]: MATCH_READING,
        }),
        isHashValid: false,
      }),
    ).toBe(ConfidenceWord.EXACT);
  });

  it('prefers Exact over Close', () => {
    expect(
      getConfidenceWord({
        signals: makeSignalSet({[ScoringSignal.EXACT_NAME]: MATCH_READING}),
        isHashValid: true,
      }),
    ).toBe(ConfidenceWord.EXACT);
  });

  it('says Close on an exact name match', () => {
    expect(
      getConfidenceWord({
        signals: makeSignalSet({[ScoringSignal.EXACT_NAME]: MATCH_READING}),
        isHashValid: false,
      }),
    ).toBe(ConfidenceWord.CLOSE);
  });

  it('says Close on group and family match with no name conflict', () => {
    expect(
      getConfidenceWord({
        signals: makeSignalSet(GROUP_AND_FAMILY_MATCH),
        isHashValid: false,
      }),
    ).toBe(ConfidenceWord.CLOSE);
  });

  it.each([ScoringSignal.RESOLUTION, ScoringSignal.WORD_OVERLAP])(
    'keeps Close on group and family match when %s conflicts',
    scoringSignal => {
      expect(
        getConfidenceWord({
          signals: makeSignalSet({
            ...GROUP_AND_FAMILY_MATCH,
            [scoringSignal]: CONFLICT_READING,
          }),
          isHashValid: false,
        }),
      ).toBe(ConfidenceWord.CLOSE);
    },
  );

  it('keeps Close when only a site signal conflicts', () => {
    expect(
      getConfidenceWord({
        signals: makeSignalSet({
          ...GROUP_AND_FAMILY_MATCH,
          [ScoringSignal.HEARING_IMPAIRED]: CONFLICT_READING,
        }),
        isHashValid: false,
      }),
    ).toBe(ConfidenceWord.CLOSE);
  });

  it.each([
    [ScoringSignal.RELEASE_EDITION, SignalState.STRONG_CONFLICT],
    [ScoringSignal.STREAMING_SERVICE, SignalState.CONFLICT],
    [ScoringSignal.NAME_FPS, SignalState.CONFLICT],
  ])(
    'gives no word on group and family match when %s reads %s',
    (scoringSignal, signalState) => {
      expect(
        getConfidenceWord({
          signals: makeSignalSet({
            ...GROUP_AND_FAMILY_MATCH,
            [scoringSignal]: makeSignalReading({signalState}),
          }),
          isHashValid: false,
        }),
      ).toBeNull();
    },
  );

  it('gives no word on a group match alone', () => {
    expect(
      getConfidenceWord({
        signals: makeSignalSet({[ScoringSignal.RELEASE_GROUP]: MATCH_READING}),
        isHashValid: false,
      }),
    ).toBeNull();
  });

  it('gives no word on a reference time family conflict', () => {
    expect(
      getConfidenceWord({
        signals: makeSignalSet({
          [ScoringSignal.REFERENCE_FAMILY]: CONFLICT_READING,
        }),
        isHashValid: false,
      }),
    ).toBeNull();
  });

  it('gives no word without signals', () => {
    expect(
      getConfidenceWord({signals: makeSignalSet(), isHashValid: false}),
    ).toBeNull();
  });
});
