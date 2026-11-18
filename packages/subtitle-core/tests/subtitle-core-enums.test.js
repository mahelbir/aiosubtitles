import {describe, expect, it} from 'vitest';
import {
  ArchiveKind,
  ConfidenceWord,
  DuplicateTier,
  HardRejectReason,
  ReleaseEdition,
  ReleaseSourceFamily,
  ScoreTableMode,
  ScoringSignal,
  SignalState,
  SubtitleFileExtension,
  SubtitleFileFormat,
  SubtitleFileInvalidReason,
  SubtitleMessage,
  SubtitleNote,
  SubtitleNotice,
} from '../src/constants/subtitle-core-enums.js';

const KEBAB_CASE_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const enumMembers = [
  ['ArchiveKind', ArchiveKind, ['ZIP', 'RAR', 'SEVEN_ZIP']],
  [
    'ScoringSignal',
    ScoringSignal,
    [
      'HASH_MATCH',
      'EXACT_NAME',
      'RELEASE_GROUP',
      'RELEASE_SOURCE_FAMILY',
      'AUDIO_SOURCE_FAMILY_HINT',
      'STREAMING_SERVICE',
      'RELEASE_EDITION',
      'NAME_FPS',
      'RESOLUTION',
      'WORD_OVERLAP',
      'TRUSTED_UPLOADER',
      'DOWNLOAD_COUNT',
      'MACHINE_TRANSLATED',
      'HEARING_IMPAIRED',
      'FORCED',
      'REFERENCE_FAMILY',
      'CUE_SHAPE',
      'INDEPENDENT_COPIES',
      'VARIANT_REFERENCE_FAMILY',
      'VARIANT_HASH_MATCH',
      'QUOTA_COSTLY',
    ],
  ],
  [
    'SignalState',
    SignalState,
    ['MATCH', 'CONFLICT', 'STRONG_CONFLICT', 'UNKNOWN'],
  ],
  ['ConfidenceWord', ConfidenceWord, ['EXACT', 'CLOSE']],
  [
    'HardRejectReason',
    HardRejectReason,
    [
      'WRONG_SEASON',
      'WRONG_EPISODE',
      'WRONG_YEAR',
      'CD_PART',
      'INVALID_FILE',
      'PACK_WITHOUT_EPISODE',
    ],
  ],
  [
    'ReleaseSourceFamily',
    ReleaseSourceFamily,
    ['BLURAY', 'WEB', 'HDTV', 'DVD'],
  ],
  [
    'ReleaseEdition',
    ReleaseEdition,
    [
      'EXTENDED',
      'DIRECTORS_CUT',
      'THEATRICAL',
      'UNRATED',
      'UNCUT',
      'IMAX',
      'REMASTERED',
      'SPECIAL',
    ],
  ],
  [
    'SubtitleFileFormat',
    SubtitleFileFormat,
    ['SRT', 'VTT', 'ASS', 'SSA', 'MICRODVD', 'OTHER'],
  ],
  ['SubtitleFileExtension', SubtitleFileExtension, ['SRT', 'ASS']],
  [
    'SubtitleFileInvalidReason',
    SubtitleFileInvalidReason,
    ['WRONG_LANGUAGE', 'ERROR_PAGE', 'TOO_SHORT', 'REPETITIVE', 'UNREADABLE'],
  ],
  [
    'DuplicateTier',
    DuplicateTier,
    ['IDENTITY', 'ALIAS', 'CONTENT_KEY', 'NEAR_DUPLICATE'],
  ],
  ['ScoreTableMode', ScoreTableMode, ['ADDITIVE', 'STRICT_PRIORITY', 'TIERED']],
  ['SubtitleNotice', SubtitleNotice, ['OPENSUBTITLES_ACCOUNT']],
  [
    'SubtitleNote',
    SubtitleNote,
    ['HEARING_IMPAIRED', 'FORCED', 'MACHINE_TRANSLATED', 'QUOTA_COSTLY'],
  ],
  [
    'SubtitleMessage',
    SubtitleMessage,
    [
      'RATE_LIMITED',
      'SUBTITLE_NOT_FOUND',
      'USER_CONFIG_DELETED',
      'SUBTITLE_DOWNLOAD_FAILED',
    ],
  ],
];

const toStoredValue = memberName =>
  memberName.toLowerCase().replaceAll('_', '-');

describe('subtitle-core enums', () => {
  it.each(enumMembers)(
    '%s lists exactly its members',
    (enumName, subject, memberNames) => {
      expect(subject.keys).toEqual(memberNames);
    },
  );

  it.each(enumMembers)(
    '%s stores each member as its lower-case kebab-case form',
    (enumName, subject, memberNames) => {
      expect(subject.values).toEqual(memberNames.map(toStoredValue));
      expect(
        subject.values.every(storedValue =>
          KEBAB_CASE_PATTERN.test(storedValue),
        ),
      ).toBe(true);
    },
  );

  it('numbers the duplicate tiers from 1 to 4', () => {
    const tierList = DuplicateTier.toList({
      extra: tier => ({tierNumber: tier.raw.tierNumber}),
    });

    expect(tierList.map(({value, tierNumber}) => [value, tierNumber])).toEqual([
      ['identity', 1],
      ['alias', 2],
      ['content-key', 3],
      ['near-duplicate', 4],
    ]);
  });

  it('labels the subtitle notes in the order HI, Forced, MT, Quota with their row flags', () => {
    const noteList = SubtitleNote.toList({
      extra: note => ({noteFlagName: note.raw.noteFlagName}),
    });

    expect(
      noteList.map(({label, noteFlagName}) => [label, noteFlagName]),
    ).toEqual([
      ['HI', 'isHearingImpaired'],
      ['Forced', 'isForced'],
      ['MT', 'isMachineTranslated'],
      ['Quota', 'isQuotaCostly'],
    ]);
  });

  it('labels the confidence words', () => {
    expect(ConfidenceWord.label('EXACT')).toBe('Exact');
    expect(ConfidenceWord.label('CLOSE')).toBe('Close');
  });

  it('labels the OpenSubtitles account notice with its hidden subtitle count placeholder', () => {
    expect(SubtitleNotice.label('OPENSUBTITLES_ACCOUNT')).toBe(
      'Add an OpenSubtitles account to see {hiddenSubtitleCount} more',
    );
  });

  it.each([
    ['RATE_LIMITED', 'Too many requests, try again in a minute.'],
    ['SUBTITLE_NOT_FOUND', 'Subtitle not found.'],
    ['USER_CONFIG_DELETED', 'This configuration was deleted.'],
    [
      'SUBTITLE_DOWNLOAD_FAILED',
      'This subtitle could not be downloaded. Please try another one.',
    ],
  ])(
    'labels the %s subtitle message with its spec text',
    (memberName, messageText) => {
      expect(SubtitleMessage.label(memberName)).toBe(messageText);
    },
  );
});
