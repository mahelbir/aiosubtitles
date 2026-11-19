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
  SRT: {value: 'srt', fileExtensions: ['srt']},
  VTT: {value: 'vtt', fileExtensions: ['vtt']},
  ASS: {value: 'ass', fileExtensions: ['ass']},
  SSA: {value: 'ssa', fileExtensions: ['ssa']},
  MICRODVD: {value: 'microdvd', fileExtensions: ['sub']},
  OTHER: {value: 'other', fileExtensions: []},
});

export const ASS_FILE_FORMATS = new Set([
  SubtitleFileFormat.ASS,
  SubtitleFileFormat.SSA,
]);

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

export const ArchiveKind = Enum({
  ZIP: {value: 'zip', fileExtensions: ['zip']},
  RAR: {value: 'rar', fileExtensions: ['rar']},
  SEVEN_ZIP: {value: 'seven-zip', fileExtensions: ['7z']},
});

const toFileExtensions = fileKind =>
  new Set(
    fileKind
      .toList({extra: option => ({fileExtensions: option.raw.fileExtensions})})
      .flatMap(({fileExtensions}) => fileExtensions),
  );

export const SUBTITLE_FORMAT_FILE_EXTENSIONS =
  toFileExtensions(SubtitleFileFormat);

export const ARCHIVE_FILE_EXTENSIONS = toFileExtensions(ArchiveKind);
