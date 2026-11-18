import {describe, expect, it} from 'vitest';
import {
  ReleaseEdition,
  ReleaseSourceFamily,
} from '../../src/constants/subtitle-core-enums.js';
import {
  buildAliasLookup,
  listCanonicalEditions,
  lookupEdition,
  lookupSourceFamily,
  lookupStreamingService,
} from '../../src/release-name/release-vocabulary.js';

describe('buildAliasLookup', () => {
  it('maps the canonical value and every alias key to the canonical value', () => {
    expect(
      buildAliasLookup({NF: ['Netflix']}, aliasText => aliasText.toLowerCase()),
    ).toEqual(
      new Map([
        ['nf', 'NF'],
        ['netflix', 'NF'],
      ]),
    );
  });

  it('refuses two canonical values that claim one alias key', () => {
    expect(() =>
      buildAliasLookup({NF: ['shared'], AMZN: ['shared']}, aliasText =>
        aliasText.toLowerCase(),
      ),
    ).toThrow(RangeError);
  });
});

describe('lookupSourceFamily', () => {
  it.each([
    ['WEB-DL', ReleaseSourceFamily.WEB],
    ['WEBRip', ReleaseSourceFamily.WEB],
    ['WEB', ReleaseSourceFamily.WEB],
    ['BluRay', ReleaseSourceFamily.BLURAY],
    ['BDRip', ReleaseSourceFamily.BLURAY],
    ['Blu-ray', ReleaseSourceFamily.BLURAY],
    ['HDTV', ReleaseSourceFamily.HDTV],
    ['PDTV', ReleaseSourceFamily.HDTV],
    ['DVD', ReleaseSourceFamily.DVD],
    ['DVDRip', ReleaseSourceFamily.DVD],
  ])('reads %s as %s', (sourceText, sourceFamily) => {
    expect(lookupSourceFamily(sourceText)).toBe(sourceFamily);
  });

  it.each(['CAM', 'TeleSync', 'HDRip'])(
    'reads %s as the other bucket',
    sourceText => {
      expect(lookupSourceFamily(sourceText)).toBe('other');
    },
  );

  it('gives null for a word that names no source', () => {
    expect(lookupSourceFamily('Paket')).toBeNull();
  });
});

describe('lookupStreamingService', () => {
  it.each([
    ['Netflix', 'NF'],
    ['NF', 'NF'],
    ['Amazon Prime Video', 'AMZN'],
    ['amzn', 'AMZN'],
    ['Disney+', 'DSNP'],
    ['Apple TV+', 'ATVP'],
    ['HBO Max', 'HMAX'],
    ['BBC iPlayer', 'iP'],
    ['BluTV', 'BLU'],
  ])('reads %s as the service code %s', (serviceText, serviceCode) => {
    expect(lookupStreamingService(serviceText)).toBe(serviceCode);
  });

  it('gives null for a name that is no known service', () => {
    expect(lookupStreamingService('Not A Service')).toBeNull();
  });
});

describe('lookupEdition', () => {
  it.each([
    ['Extended', ReleaseEdition.EXTENDED],
    ['EXTENDED', ReleaseEdition.EXTENDED],
    ['Extended Cut', ReleaseEdition.EXTENDED],
    ["Director's Cut", ReleaseEdition.DIRECTORS_CUT],
    ['Directors.Cut', ReleaseEdition.DIRECTORS_CUT],
    ['Theatrical', ReleaseEdition.THEATRICAL],
    ['Unrated', ReleaseEdition.UNRATED],
    ['Uncut', ReleaseEdition.UNCUT],
    ['IMAX', ReleaseEdition.IMAX],
    ['Remastered', ReleaseEdition.REMASTERED],
    ['Special Edition', ReleaseEdition.SPECIAL],
  ])('reads %s as %s', (editionText, edition) => {
    expect(lookupEdition(editionText)).toBe(edition);
  });

  it('gives null for a word that names no edition', () => {
    expect(lookupEdition('Collector')).toBeNull();
  });
});

describe('listCanonicalEditions', () => {
  it('lists each canonical edition once and drops unknown words', () => {
    expect(
      listCanonicalEditions(['Extended', 'EXTENDED Cut', 'Collector', 'IMAX']),
    ).toEqual([ReleaseEdition.EXTENDED, ReleaseEdition.IMAX]);
  });

  it('reads a single raw value', () => {
    expect(listCanonicalEditions('Unrated')).toEqual([ReleaseEdition.UNRATED]);
  });

  it('gives an empty list for an absent value', () => {
    expect(listCanonicalEditions(null)).toEqual([]);
  });
});
