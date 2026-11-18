import {deepFreeze} from 'es-toolkit';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {
  ScoreTableMode,
  ScoringSignal,
} from '../constants/subtitle-core-enums.js';

const ORION_SCORE_TABLE = {
  tableName: 'orion',
  tableCitations: [
    '.reference/orion/src/addon.js:764-767 tiers: quota-costly, then forced (default fo=last, addon.js:169), then score',
    '.reference/orion/src/addon.js:730 hash-match 1000',
    '.reference/orion/src/release.js:67 release-group 150',
    '.reference/orion/src/release.js:68 release-source-family 100 / -100',
    '.reference/orion/src/release.js:69 streaming-service 30',
    '.reference/orion/src/release.js:70-71 release-edition 60 / -30 / -60',
    '.reference/orion/src/release.js:72 resolution 10',
    '.reference/orion/src/addon.js:736 word-overlap 40 x Jaccard (subtitle.js:399-407)',
    '.reference/orion/src/addon.js:747 trusted-uploader 20',
    '.reference/orion/src/addon.js:748 machine-translated -500',
    '.reference/orion/src/addon.js:749 download-count 10 per log10',
  ],
  tableMode: ScoreTableMode.TIERED,
  tierOrder: [ScoringSignal.QUOTA_COSTLY, ScoringSignal.FORCED],
  signalPoints: {
    [ScoringSignal.QUOTA_COSTLY]: {matchPoints: 0, conflictPoints: -1},
    [ScoringSignal.FORCED]: {matchPoints: 0, conflictPoints: -1},
    [ScoringSignal.HASH_MATCH]: {matchPoints: 1000, conflictPoints: 0},
    [ScoringSignal.RELEASE_GROUP]: {matchPoints: 150, conflictPoints: 0},
    [ScoringSignal.RELEASE_SOURCE_FAMILY]: {
      matchPoints: 100,
      conflictPoints: -100,
    },
    [ScoringSignal.STREAMING_SERVICE]: {matchPoints: 30, conflictPoints: 0},
    [ScoringSignal.RELEASE_EDITION]: {
      matchPoints: 60,
      conflictPoints: -30,
      strongConflictPoints: -60,
    },
    [ScoringSignal.RESOLUTION]: {matchPoints: 10, conflictPoints: 0},
    [ScoringSignal.WORD_OVERLAP]: {matchPoints: 40, conflictPoints: 0},
    [ScoringSignal.TRUSTED_UPLOADER]: {matchPoints: 20, conflictPoints: 0},
    [ScoringSignal.MACHINE_TRANSLATED]: {matchPoints: 0, conflictPoints: -500},
    [ScoringSignal.DOWNLOAD_COUNT]: {matchPoints: 10, conflictPoints: 0},
  },
};

const LYRA_SCORE_TABLE = {
  tableName: 'lyra',
  tableCitations: [
    '.reference/Stremio-Lyra/src/utils/filenameMatcher.js:57-62 release-group 50 movie / 30 series',
    '.reference/Stremio-Lyra/src/utils/filenameMatcher.js:69-72 release-source-family 10',
    '.reference/Stremio-Lyra/src/utils/filenameMatcher.js:76-77 resolution 5',
  ],
  tableMode: ScoreTableMode.ADDITIVE,
  signalPoints: {
    [ScoringSignal.RELEASE_GROUP]: {matchPoints: 50, conflictPoints: 0},
    [ScoringSignal.RELEASE_SOURCE_FAMILY]: {matchPoints: 10, conflictPoints: 0},
    [ScoringSignal.RESOLUTION]: {matchPoints: 5, conflictPoints: 0},
  },
  episodeSignalPoints: {
    [ScoringSignal.RELEASE_GROUP]: {matchPoints: 30, conflictPoints: 0},
  },
};

const VEGA_SCORE_TABLE = {
  tableName: 'vega',
  tableCitations: [
    '.reference/StremioVega/src/handlers/subtitles.js:2556-2557,2792 tier: hash-match 200000',
    '.reference/StremioVega/src/handlers/subtitles.js:2283-2284 exact-name 10000',
    '.reference/StremioVega/src/handlers/subtitles.js:2306-2316 release-group 4000 / -100',
    '.reference/StremioVega/src/handlers/subtitles.js:2326-2328 release-source-family 2500',
    '.reference/StremioVega/src/handlers/subtitles.js:2343-2347 streaming-service 1200 / -200',
    '.reference/StremioVega/src/handlers/subtitles.js:2353-2355 resolution 1000',
    '.reference/StremioVega/src/handlers/subtitles.js:2461-2471 release-edition 1500 / -300 / -1000',
    '.reference/StremioVega/src/handlers/subtitles.js:2717-2725 subtitle sources: opensubtitles-v3 3, others 2',
  ],
  tableMode: ScoreTableMode.TIERED,
  tierOrder: [ScoringSignal.HASH_MATCH],
  signalPoints: {
    [ScoringSignal.HASH_MATCH]: {matchPoints: 200_000, conflictPoints: 0},
    [ScoringSignal.EXACT_NAME]: {matchPoints: 10_000, conflictPoints: 0},
    [ScoringSignal.RELEASE_GROUP]: {matchPoints: 4000, conflictPoints: -100},
    [ScoringSignal.RELEASE_SOURCE_FAMILY]: {
      matchPoints: 2500,
      conflictPoints: 0,
    },
    [ScoringSignal.STREAMING_SERVICE]: {
      matchPoints: 1200,
      conflictPoints: -200,
    },
    [ScoringSignal.RESOLUTION]: {matchPoints: 1000, conflictPoints: 0},
    [ScoringSignal.RELEASE_EDITION]: {
      matchPoints: 1500,
      conflictPoints: -300,
      strongConflictPoints: -1000,
    },
  },
  subtitleSourcePoints: {
    [SubtitleSource.OPENSUBTITLES_V3]: 3,
    [SubtitleSource.SUBDL]: 2,
    [SubtitleSource.SUBSOURCE]: 2,
    [SubtitleSource.STREMIO_COMMUNITY_SUBTITLES]: 2,
    [SubtitleSource.WYZIE]: 2,
    [SubtitleSource.THESUBTITLEDB]: 2,
  },
};

const SUBLIMINAL_SCORE_TABLE = {
  tableName: 'subliminal',
  tableCitations: [
    '.reference/subliminal/src/subliminal/score.py:81 hash-match 323 movie',
    '.reference/subliminal/src/subliminal/score.py:64 hash-match 971 episode',
    '.reference/subliminal/src/subliminal/score.py:70,85 release-group 18',
    '.reference/subliminal/src/subliminal/score.py:71,86 streaming-service 18',
    '.reference/subliminal/src/subliminal/score.py:73,88 release-source-family 4',
    '.reference/subliminal/src/subliminal/score.py:75,90 resolution 1',
  ],
  tableMode: ScoreTableMode.ADDITIVE,
  signalPoints: {
    [ScoringSignal.HASH_MATCH]: {matchPoints: 323, conflictPoints: 0},
    [ScoringSignal.RELEASE_GROUP]: {matchPoints: 18, conflictPoints: 0},
    [ScoringSignal.STREAMING_SERVICE]: {matchPoints: 18, conflictPoints: 0},
    [ScoringSignal.RELEASE_SOURCE_FAMILY]: {matchPoints: 4, conflictPoints: 0},
    [ScoringSignal.RESOLUTION]: {matchPoints: 1, conflictPoints: 0},
  },
  episodeSignalPoints: {
    [ScoringSignal.HASH_MATCH]: {matchPoints: 971, conflictPoints: 0},
  },
};

const BAZARR_SCORE_TABLE = {
  tableName: 'bazarr',
  tableCitations: [
    '.reference/bazarr/custom_libs/subliminal_patch/score.py:47 hash-match 179 movie',
    '.reference/bazarr/custom_libs/subliminal_patch/score.py:33 hash-match 359 episode',
    '.reference/bazarr/custom_libs/subliminal_patch/score.py:50 release-source-family 30 movie',
    '.reference/bazarr/custom_libs/subliminal_patch/score.py:38 release-source-family 25 episode',
    '.reference/bazarr/custom_libs/subliminal_patch/score.py:52 release-group 15 movie',
    '.reference/bazarr/custom_libs/subliminal_patch/score.py:39 release-group 20 episode',
    '.reference/bazarr/custom_libs/subliminal_patch/score.py:51 release-edition 30 movie, none episode',
    '.reference/bazarr/custom_libs/subliminal_patch/score.py:54,41 resolution 1',
    '.reference/bazarr/custom_libs/subliminal_patch/score.py:57,44 streaming-service 1',
    ".reference/bazarr/custom_libs/subliminal_patch/subtitle.py:517-530 release-edition 0 / -30, streaming-service 0 / -1: both-absent counts as match, shifted by −30/−1 to keep Bazarr's order",
  ],
  tableMode: ScoreTableMode.ADDITIVE,
  signalPoints: {
    [ScoringSignal.HASH_MATCH]: {matchPoints: 179, conflictPoints: 0},
    [ScoringSignal.RELEASE_SOURCE_FAMILY]: {matchPoints: 30, conflictPoints: 0},
    [ScoringSignal.RELEASE_EDITION]: {matchPoints: 0, conflictPoints: -30},
    [ScoringSignal.RELEASE_GROUP]: {matchPoints: 15, conflictPoints: 0},
    [ScoringSignal.RESOLUTION]: {matchPoints: 1, conflictPoints: 0},
    [ScoringSignal.STREAMING_SERVICE]: {matchPoints: 0, conflictPoints: -1},
  },
  episodeSignalPoints: {
    [ScoringSignal.HASH_MATCH]: {matchPoints: 359, conflictPoints: 0},
    [ScoringSignal.RELEASE_SOURCE_FAMILY]: {matchPoints: 25, conflictPoints: 0},
    [ScoringSignal.RELEASE_EDITION]: {matchPoints: 0, conflictPoints: 0},
    [ScoringSignal.RELEASE_GROUP]: {matchPoints: 20, conflictPoints: 0},
  },
};

const STRICT_PRIORITY_SCORE_TABLE = {
  tableName: 'strict-priority',
  tableCitations: [
    'apps/eval/metrics.md §6 "Strict priority": subliminal rows by descending weight, ties in declaration order, no negative points, no fps row',
    '.reference/subliminal/src/subliminal/score.py:64 hash-match 971',
    '.reference/subliminal/src/subliminal/score.py:70 release-group 18',
    '.reference/subliminal/src/subliminal/score.py:71 streaming-service 18',
    '.reference/subliminal/src/subliminal/score.py:73 release-source-family 4',
    '.reference/subliminal/src/subliminal/score.py:75 resolution 1',
  ],
  tableMode: ScoreTableMode.STRICT_PRIORITY,
  priorityOrder: [
    ScoringSignal.HASH_MATCH,
    ScoringSignal.RELEASE_GROUP,
    ScoringSignal.STREAMING_SERVICE,
    ScoringSignal.RELEASE_SOURCE_FAMILY,
    ScoringSignal.RESOLUTION,
  ],
  signalPoints: {
    [ScoringSignal.HASH_MATCH]: {matchPoints: 971, conflictPoints: 0},
    [ScoringSignal.RELEASE_GROUP]: {matchPoints: 18, conflictPoints: 0},
    [ScoringSignal.STREAMING_SERVICE]: {matchPoints: 18, conflictPoints: 0},
    [ScoringSignal.RELEASE_SOURCE_FAMILY]: {matchPoints: 4, conflictPoints: 0},
    [ScoringSignal.RESOLUTION]: {matchPoints: 1, conflictPoints: 0},
  },
};

export const READY_MADE_SCORE_TABLES = deepFreeze([
  ORION_SCORE_TABLE,
  LYRA_SCORE_TABLE,
  VEGA_SCORE_TABLE,
  SUBLIMINAL_SCORE_TABLE,
  BAZARR_SCORE_TABLE,
  STRICT_PRIORITY_SCORE_TABLE,
]);
