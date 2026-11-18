import {describe, expect, it} from 'vitest';
import {
  ReleaseEdition,
  ReleaseSourceFamily,
} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {normalizeParsedFields} from '../../src/parser-test/normalize-fields.js';
import {
  ABSENT_PARSED_FIELDS,
  buildParsedFields,
} from './helpers/parsed-fields.js';

const OTHER_SOURCE_FAMILY = 'other';

const normalizeOneField = (fieldName, rawValue) =>
  normalizeParsedFields({[fieldName]: rawValue})?.[fieldName];

describe('normalizeParsedFields', () => {
  it('normalises every field of a scene episode name', () => {
    expect(
      normalizeParsedFields({
        releaseGroup: 'NTb',
        releaseSourceFamily: 'WEB-DL',
        streamingService: 'Netflix',
        releaseEdition: null,
        seasonNumbers: [1],
        episodeNumbers: [2],
        releaseTitle: 'The Show',
        releaseYear: null,
      }),
    ).toEqual(
      buildParsedFields({
        releaseGroup: 'ntb',
        releaseSourceFamily: ReleaseSourceFamily.WEB,
        streamingService: 'NF',
        seasonNumbers: [1],
        episodeNumbers: [2],
        releaseTitle: 'the show',
      }),
    );
  });

  it('normalises every field of a scene movie name', () => {
    expect(
      normalizeParsedFields({
        releaseGroup: 'SPARKS',
        releaseSourceFamily: 'BluRay',
        releaseEdition: 'EXTENDED',
        releaseTitle: 'Movie Name',
        releaseYear: '2019',
      }),
    ).toEqual(
      buildParsedFields({
        releaseGroup: 'sparks',
        releaseSourceFamily: ReleaseSourceFamily.BLURAY,
        releaseEdition: ReleaseEdition.EXTENDED,
        releaseTitle: 'movie name',
        releaseYear: 2019,
      }),
    );
  });

  it('turns missing fields into absence', () => {
    expect(normalizeParsedFields({})).toEqual(ABSENT_PARSED_FIELDS);
  });

  it('turns empty strings into absence', () => {
    expect(
      normalizeParsedFields({
        releaseGroup: '',
        releaseSourceFamily: '',
        streamingService: '',
        releaseEdition: '',
        releaseTitle: '  ',
      }),
    ).toEqual(ABSENT_PARSED_FIELDS);
  });

  describe('source family', () => {
    it.each([
      ['WEB-DL', ReleaseSourceFamily.WEB],
      ['WEBDL', ReleaseSourceFamily.WEB],
      ['WEBRip', ReleaseSourceFamily.WEB],
      ['WEBRIP', ReleaseSourceFamily.WEB],
      ['WEB', ReleaseSourceFamily.WEB],
      ['Web', ReleaseSourceFamily.WEB],
      ['BluRay', ReleaseSourceFamily.BLURAY],
      ['Blu-ray', ReleaseSourceFamily.BLURAY],
      ['BLURAY', ReleaseSourceFamily.BLURAY],
      ['Ultra HD Blu-ray', ReleaseSourceFamily.BLURAY],
      ['BDRip', ReleaseSourceFamily.BLURAY],
      ['BRRip', ReleaseSourceFamily.BLURAY],
      ['BluRay REMUX', ReleaseSourceFamily.BLURAY],
      ['REMUX', ReleaseSourceFamily.BLURAY],
      ['Remux', ReleaseSourceFamily.BLURAY],
      ['HDTV', ReleaseSourceFamily.HDTV],
      ['TV', ReleaseSourceFamily.HDTV],
      ['DVD', ReleaseSourceFamily.DVD],
      ['DVDRip', ReleaseSourceFamily.DVD],
      ['CAM', OTHER_SOURCE_FAMILY],
      ['TeleSync', OTHER_SOURCE_FAMILY],
    ])('maps %s to its family', (rawSource, sourceFamily) => {
      expect(normalizeOneField('releaseSourceFamily', rawSource)).toBe(
        sourceFamily,
      );
    });

    it('treats WEBRip and WEB-DL as one family', () => {
      expect(normalizeOneField('releaseSourceFamily', 'WEBRip')).toBe(
        normalizeOneField('releaseSourceFamily', 'WEB-DL'),
      );
      expect(normalizeOneField('releaseSourceFamily', 'WEB-DL')).toBe(
        ReleaseSourceFamily.WEB,
      );
    });

    it('keeps "other" outside the product source families', () => {
      expect(ReleaseSourceFamily.values).not.toContain(OTHER_SOURCE_FAMILY);
      expect(normalizeOneField('releaseSourceFamily', 'CAM')).toBe(
        OTHER_SOURCE_FAMILY,
      );
    });
  });

  describe('streaming service', () => {
    it.each([
      ['Netflix', 'NF'],
      ['NF', 'NF'],
      ['Amazon Prime Video', 'AMZN'],
      ['Prime Video', 'AMZN'],
      ['Amazon Prime', 'AMZN'],
      ['AMZN', 'AMZN'],
      ['Disney+', 'DSNP'],
      ['DSNP', 'DSNP'],
      ['Apple TV+', 'ATVP'],
      ['AppleTV', 'ATVP'],
      ['ATVP', 'ATVP'],
      ['HBO Max', 'HMAX'],
      ['HMAX', 'HMAX'],
      ['Hulu', 'HULU'],
      ['HULU', 'HULU'],
    ])('maps %s to %s', (rawService, serviceCode) => {
      expect(normalizeOneField('streamingService', rawService)).toBe(
        serviceCode,
      );
    });
  });

  describe('edition', () => {
    it.each([
      ['Extended', ReleaseEdition.EXTENDED],
      ['Extended Edition', ReleaseEdition.EXTENDED],
      ['EXTENDED', ReleaseEdition.EXTENDED],
      ["Director's Cut", ReleaseEdition.DIRECTORS_CUT],
      ['Directors Cut', ReleaseEdition.DIRECTORS_CUT],
      ['Theatrical', ReleaseEdition.THEATRICAL],
      ['Unrated', ReleaseEdition.UNRATED],
      ['Uncut', ReleaseEdition.UNCUT],
      ['IMAX', ReleaseEdition.IMAX],
      ['Remastered', ReleaseEdition.REMASTERED],
      ['Special', ReleaseEdition.SPECIAL],
      ['Special Edition', ReleaseEdition.SPECIAL],
    ])('maps %s to its canonical edition', (rawEdition, edition) => {
      expect(normalizeOneField('releaseEdition', rawEdition)).toBe(edition);
    });
  });

  describe('title', () => {
    it('case-folds, turns punctuation into spaces and collapses spaces', () => {
      expect(
        normalizeOneField('releaseTitle', '  The.Show:_Part-Two!  (US) '),
      ).toBe('the show part two us');
    });

    it('composes the title to NFC before comparing', () => {
      expect(normalizeOneField('releaseTitle', 'Amélie')).toBe('amélie');
    });
  });

  describe('group', () => {
    it('case-folds the group and keeps its inner punctuation', () => {
      expect(normalizeOneField('releaseGroup', 'AlFleNi-TeaM')).toBe(
        'alfleni-team',
      );
    });
  });

  describe('season and episode', () => {
    it('turns a lone number into a set of one', () => {
      expect(normalizeOneField('seasonNumbers', 3)).toEqual([3]);
      expect(normalizeOneField('episodeNumbers', '7')).toEqual([7]);
    });

    it('sorts and dedupes a list of numbers', () => {
      expect(normalizeOneField('episodeNumbers', [4, '3', 4])).toEqual([3, 4]);
    });
  });

  describe('year', () => {
    it.each([
      ['2019', 2019],
      [2019, 2019],
    ])('reads %j as the integer year', (rawYear, year) => {
      expect(normalizeOneField('releaseYear', rawYear)).toBe(year);
    });
  });
});
