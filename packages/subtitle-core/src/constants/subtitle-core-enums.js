import {Enum} from 'enum-plus';

export const ScoringSignal = Enum({
  HASH_MATCH: {value: 'hash-match'},
  EXACT_NAME: {value: 'exact-name'},
  RELEASE_GROUP: {value: 'release-group'},
  RELEASE_SOURCE_FAMILY: {value: 'release-source-family'},
  AUDIO_SOURCE_FAMILY_HINT: {value: 'audio-source-family-hint'},
  STREAMING_SERVICE: {value: 'streaming-service'},
  RELEASE_EDITION: {value: 'release-edition'},
  NAME_FPS: {value: 'name-fps'},
  RESOLUTION: {value: 'resolution'},
  WORD_OVERLAP: {value: 'word-overlap'},
  TRUSTED_UPLOADER: {value: 'trusted-uploader'},
  DOWNLOAD_COUNT: {value: 'download-count'},
  MACHINE_TRANSLATED: {value: 'machine-translated'},
  HEARING_IMPAIRED: {value: 'hearing-impaired'},
  FORCED: {value: 'forced'},
  REFERENCE_FAMILY: {value: 'reference-family'},
  CUE_SHAPE: {value: 'cue-shape'},
  INDEPENDENT_COPIES: {value: 'independent-copies'},
  VARIANT_REFERENCE_FAMILY: {value: 'variant-reference-family'},
  VARIANT_HASH_MATCH: {value: 'variant-hash-match'},
  QUOTA_COSTLY: {value: 'quota-costly'},
});

export const SignalState = Enum({
  MATCH: {value: 'match'},
  CONFLICT: {value: 'conflict'},
  STRONG_CONFLICT: {value: 'strong-conflict'},
  UNKNOWN: {value: 'unknown'},
});

export const ConfidenceWord = Enum({
  EXACT: {value: 'exact', label: 'Exact'},
  CLOSE: {value: 'close', label: 'Close'},
});

export const HardRejectReason = Enum({
  WRONG_SEASON: {value: 'wrong-season'},
  WRONG_EPISODE: {value: 'wrong-episode'},
  WRONG_TITLE: {value: 'wrong-title'},
  WRONG_YEAR: {value: 'wrong-year'},
  CD_PART: {value: 'cd-part'},
  INVALID_FILE: {value: 'invalid-file'},
  PACK_WITHOUT_EPISODE: {value: 'pack-without-episode'},
});

export const ReleaseSourceFamily = Enum({
  BLURAY: {value: 'bluray'},
  WEB: {value: 'web'},
  HDTV: {value: 'hdtv'},
  DVD: {value: 'dvd'},
});

export const ReleaseEdition = Enum({
  EXTENDED: {value: 'extended'},
  DIRECTORS_CUT: {value: 'directors-cut'},
  THEATRICAL: {value: 'theatrical'},
  UNRATED: {value: 'unrated'},
  UNCUT: {value: 'uncut'},
  IMAX: {value: 'imax'},
  REMASTERED: {value: 'remastered'},
  SPECIAL: {value: 'special'},
});

export const SubtitleFileFormat = Enum({
  SRT: {value: 'srt'},
  VTT: {value: 'vtt'},
  ASS: {value: 'ass'},
  SSA: {value: 'ssa'},
  MICRODVD: {value: 'microdvd'},
  OTHER: {value: 'other'},
});

export const SubtitleFileExtension = Enum({
  SRT: {value: 'srt'},
  ASS: {value: 'ass'},
});

export const SubtitleFileInvalidReason = Enum({
  WRONG_LANGUAGE: {value: 'wrong-language'},
  ERROR_PAGE: {value: 'error-page'},
  TOO_SHORT: {value: 'too-short'},
  REPETITIVE: {value: 'repetitive'},
  UNREADABLE: {value: 'unreadable'},
});

export const DuplicateTier = Enum({
  IDENTITY: {value: 'identity', tierNumber: 1},
  ALIAS: {value: 'alias', tierNumber: 2},
  CONTENT_KEY: {value: 'content-key', tierNumber: 3},
  NEAR_DUPLICATE: {value: 'near-duplicate', tierNumber: 4},
});

export const ScoreTableMode = Enum({
  ADDITIVE: {value: 'additive'},
  STRICT_PRIORITY: {value: 'strict-priority'},
  TIERED: {value: 'tiered'},
});

export const SubtitleNote = Enum({
  HEARING_IMPAIRED: {
    value: 'hearing-impaired',
    label: 'HI',
    noteFlagName: 'isHearingImpaired',
  },
  FORCED: {value: 'forced', label: 'Forced', noteFlagName: 'isForced'},
  MACHINE_TRANSLATED: {
    value: 'machine-translated',
    label: 'MT',
    noteFlagName: 'isMachineTranslated',
  },
  QUOTA_COSTLY: {
    value: 'quota-costly',
    label: 'Quota',
    noteFlagName: 'isQuotaCostly',
  },
});

export const SubtitleNotice = Enum({
  OPENSUBTITLES_ACCOUNT: {
    value: 'opensubtitles-account',
    label: 'Add an OpenSubtitles account to see {hiddenSubtitleCount} more',
  },
});

export const SubtitleMessage = Enum({
  RATE_LIMITED: {
    value: 'rate-limited',
    label: 'Too many requests, try again in a minute.',
  },
  SUBTITLE_NOT_FOUND: {
    value: 'subtitle-not-found',
    label: 'Subtitle not found.',
  },
  USER_CONFIG_DELETED: {
    value: 'user-config-deleted',
    label: 'This configuration was deleted.',
  },
  SUBTITLE_DOWNLOAD_FAILED: {
    value: 'subtitle-download-failed',
    label: 'This subtitle could not be downloaded. Please try another one.',
  },
});

export const ArchiveKind = Enum({
  ZIP: {value: 'zip'},
  RAR: {value: 'rar'},
  SEVEN_ZIP: {value: 'seven-zip'},
});
