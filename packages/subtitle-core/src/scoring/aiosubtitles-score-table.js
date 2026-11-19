import {deepFreeze} from 'es-toolkit';
import {
  ScoreTableMode,
  ScoringSignal,
} from '../constants/subtitle-core-enums.js';

export const AIOSUBTITLES_SCORE_TABLE = deepFreeze({
  tableName: 'aiosubtitles',
  tableCitations: [
    'packages/subtitle-core/src/scoring/aiosubtitles-score-table.js',
  ],
  tableMode: ScoreTableMode.ADDITIVE,
  signalPoints: {
    [ScoringSignal.HASH_MATCH]: {matchPoints: 1000, conflictPoints: 0},
    [ScoringSignal.EXACT_NAME]: {matchPoints: 50, conflictPoints: 0},
    [ScoringSignal.RELEASE_GROUP]: {matchPoints: 40, conflictPoints: -10},
    [ScoringSignal.RELEASE_SOURCE_FAMILY]: {
      matchPoints: 30,
      conflictPoints: -40,
    },
    [ScoringSignal.AUDIO_SOURCE_FAMILY_HINT]: {
      matchPoints: 15,
      conflictPoints: -20,
    },
    [ScoringSignal.STREAMING_SERVICE]: {matchPoints: 20, conflictPoints: -20},
    [ScoringSignal.RELEASE_EDITION]: {
      matchPoints: 30,
      conflictPoints: -40,
      strongConflictPoints: -50,
    },
    [ScoringSignal.NAME_FPS]: {matchPoints: 0, conflictPoints: -50},
    [ScoringSignal.RESOLUTION]: {matchPoints: 3, conflictPoints: 0},
    [ScoringSignal.WORD_OVERLAP]: {matchPoints: 20, conflictPoints: 0},
    [ScoringSignal.TRUSTED_UPLOADER]: {matchPoints: 10, conflictPoints: 0},
    [ScoringSignal.DOWNLOAD_COUNT]: {
      matchPoints: 2,
      conflictPoints: 0,
      maxPoints: 10,
    },
    [ScoringSignal.MACHINE_TRANSLATED]: {matchPoints: 0, conflictPoints: -20},
    [ScoringSignal.HEARING_IMPAIRED]: {matchPoints: 0, conflictPoints: -5},
    [ScoringSignal.FORCED]: {matchPoints: 0, conflictPoints: -200},
    [ScoringSignal.REFERENCE_FAMILY]: {matchPoints: 900, conflictPoints: -300},
    [ScoringSignal.CUE_SHAPE]: {matchPoints: 0, conflictPoints: -30},
    [ScoringSignal.INDEPENDENT_COPIES]: {
      matchPoints: 5,
      conflictPoints: 0,
      maxPoints: 15,
    },
    [ScoringSignal.VARIANT_REFERENCE_FAMILY]: {
      matchPoints: 300,
      conflictPoints: 0,
      maxPoints: 900,
    },
    [ScoringSignal.VARIANT_HASH_MATCH]: {
      matchPoints: 300,
      conflictPoints: 0,
      maxPoints: 900,
    },
    [ScoringSignal.QUOTA_COSTLY]: {matchPoints: 0, conflictPoints: 0},
  },
});
