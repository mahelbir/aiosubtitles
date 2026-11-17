import {difference} from 'es-toolkit';
import {
  ConfidenceWord,
  ScoringSignal,
  SignalState,
} from '../constants/subtitle-core-enums.js';
import {RELEASE_NAME_SIGNALS} from './extract-signals.js';
import {isConflictState} from './release-comparison.js';

const CLOSE_VETO_SIGNALS = Object.freeze(
  difference(RELEASE_NAME_SIGNALS, [
    ScoringSignal.RESOLUTION,
    ScoringSignal.WORD_OVERLAP,
  ]),
);

const isSignalMatched = (signals, scoringSignal) =>
  signals[scoringSignal]?.signalState === SignalState.MATCH;

export const getConfidenceWord = ({signals, isHashValid}) => {
  if (isHashValid || isSignalMatched(signals, ScoringSignal.REFERENCE_FAMILY)) {
    return ConfidenceWord.EXACT;
  }
  if (isSignalMatched(signals, ScoringSignal.EXACT_NAME)) {
    return ConfidenceWord.CLOSE;
  }
  const hasNameConflict = CLOSE_VETO_SIGNALS.some(scoringSignal =>
    isConflictState(signals[scoringSignal]?.signalState),
  );
  return isSignalMatched(signals, ScoringSignal.RELEASE_GROUP) &&
    isSignalMatched(signals, ScoringSignal.RELEASE_SOURCE_FAMILY) &&
    !hasNameConflict
    ? ConfidenceWord.CLOSE
    : null;
};
