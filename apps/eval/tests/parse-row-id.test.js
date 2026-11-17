import {describe, expect, it} from 'vitest';
import {parseRowId, RowIdFormatError} from '../src/corpus/parse-row-id.js';

describe('parseRowId', () => {
  it('parses a free row with two release names and a duplicate suffix', () => {
    expect(
      parseRowId(
        '[AltyazıDB] ✓ Ücretsiz · HI | Show.S01E01.WEB-NTb _ Show.S01E01.720p (2)',
      ),
    ).toEqual({
      subtitleSourceName: 'AltyazıDB',
      isFree: true,
      isQuotaCostly: false,
      isHearingImpaired: true,
      isForced: false,
      isOfficialAddon: false,
      releaseNames: ['Show.S01E01.WEB-NTb', 'Show.S01E01.720p'],
      duplicateIndex: 2,
    });
  });

  it('keeps a four-digit year in parentheses', () => {
    expect(
      parseRowId('[SubDL] ✓ Ücretsiz | Movie Name (2019)').releaseNames,
    ).toEqual(['Movie Name (2019)']);
  });

  it('reads a paid row and ignores the volatile quota count', () => {
    const row = parseRowId(
      '[OpenSubtitles] 1 hak harcar · bugün 17 kaldı · Yabancı konuşmalar | Movie.2019.1080p',
    );
    expect([row.isQuotaCostly, row.isForced, row.isFree]).toEqual([
      true,
      true,
      false,
    ]);
  });

  it('does not split a name on a glued underscore', () => {
    expect(
      parseRowId('[SubSource] ✓ Ücretsiz | Show_S01E01').releaseNames,
    ).toEqual(['Show_S01E01']);
  });

  it('marks a row from the official addon', () => {
    expect(
      parseRowId('[OpenSubtitles] ✓ Ücretsiz · Resmi | Movie.2019.720p'),
    ).toEqual({
      subtitleSourceName: 'OpenSubtitles',
      isFree: true,
      isQuotaCostly: false,
      isHearingImpaired: false,
      isForced: false,
      isOfficialAddon: true,
      releaseNames: ['Movie.2019.720p'],
      duplicateIndex: null,
    });
  });

  it('reads a pooled foreign-parts row without setting another flag', () => {
    expect(
      parseRowId(
        '[TheSubtitleDB] ✓ Ücretsiz · Havuz · Yabancı konuşmalar | Movie.2019.WEB',
      ),
    ).toEqual({
      subtitleSourceName: 'TheSubtitleDB',
      isFree: true,
      isQuotaCostly: false,
      isHearingImpaired: false,
      isForced: true,
      isOfficialAddon: false,
      releaseNames: ['Movie.2019.WEB'],
      duplicateIndex: null,
    });
  });

  it('reads a paid row without a quota count', () => {
    const row = parseRowId('[OpenSubtitles] 1 hak harcar · HI | Movie.2019');
    expect([
      row.isQuotaCostly,
      row.isFree,
      row.isHearingImpaired,
      row.releaseNames,
    ]).toEqual([true, false, true, ['Movie.2019']]);
  });

  it('gives the same parse for two fetches with different quota counts', () => {
    expect(
      parseRowId('[OpenSubtitles] 1 hak harcar · bugün 3 kaldı | Movie.2019')
        ?.releaseNames,
    ).toEqual(['Movie.2019']);
    expect(
      parseRowId('[OpenSubtitles] 1 hak harcar · bugün 3 kaldı | Movie.2019'),
    ).toEqual(
      parseRowId('[OpenSubtitles] 1 hak harcar · bugün 250 kaldı | Movie.2019'),
    );
  });

  it('keeps a three-digit number in parentheses', () => {
    const row = parseRowId('[SubDL] ✓ Ücretsiz | Movie Name (123)');
    expect([row.releaseNames, row.duplicateIndex]).toEqual([
      ['Movie Name (123)'],
      null,
    ]);
  });

  it('strips a one-digit duplicate suffix only once', () => {
    const row = parseRowId('[SubDL] ✓ Ücretsiz | Movie Name (2019) (3)');
    expect([row.releaseNames, row.duplicateIndex]).toEqual([
      ['Movie Name (2019)'],
      3,
    ]);
  });

  it('splits only on the first bracket and the first bar', () => {
    const row = parseRowId('[AniSub] ✓ Ücretsiz | Show [Group] - 01 | extra');
    expect([row.subtitleSourceName, row.releaseNames]).toEqual([
      'AniSub',
      ['Show [Group] - 01 | extra'],
    ]);
  });

  it.each([
    ['a missing source bracket', 'AniSub ✓ Ücretsiz | Show 01'],
    ['a missing name bar', '[AniSub] ✓ Ücretsiz Show 01'],
    ['an empty text', ''],
  ])('rejects %s without echoing the row', (_label, rowId) => {
    expect(() => parseRowId(rowId)).toThrow(RowIdFormatError);
    if (rowId) {
      expect(() => parseRowId(rowId)).not.toThrow(rowId);
    }
  });
});
