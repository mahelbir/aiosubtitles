import {describe, expect, it} from 'vitest';
import {
  SubtitleMessage,
  SubtitleNote,
  SubtitleNotice,
} from '../../../src/lib/stremio-row/stremio-row-enums.js';

const KEBAB_CASE_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const enumMembers = [
  [
    'SubtitleNotice',
    SubtitleNotice,
    ['OPENSUBTITLES_ACCOUNT', 'OPENSUBTITLES_ACCOUNT_FIX'],
  ],
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

describe('stremio-row enums', () => {
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

  it('labels the OpenSubtitles account notice with its hidden subtitle count placeholder', () => {
    expect(SubtitleNotice.label('OPENSUBTITLES_ACCOUNT')).toBe(
      'Add an OpenSubtitles account to see {hiddenSubtitleCount} more',
    );
  });

  it('labels the OpenSubtitles account fix notice with its hidden subtitle count placeholder', () => {
    expect(SubtitleNotice.label('OPENSUBTITLES_ACCOUNT_FIX')).toBe(
      'Fix your OpenSubtitles account to see {hiddenSubtitleCount} more',
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
