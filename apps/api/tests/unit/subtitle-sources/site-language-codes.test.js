import {describe, expect, it} from 'vitest';
import {SubtitleLanguage} from '@repo/shared/constants/subtitle-language.js';
import {
  fromSiteLanguageCode,
  toSiteLanguageCodes,
} from '../../../src/lib/subtitle-sources/site-language-codes.js';

describe('fromSiteLanguageCode', () => {
  it.each([
    ['pb', 'pob'],
    ['ea', 'spl'],
    ['sp', 'spa'],
    ['pm', 'por'],
    ['zt', 'zho'],
    ['PB', 'pob'],
  ])('reads the site code %s as %s', (siteLanguageCode, languageCode) => {
    expect(fromSiteLanguageCode(siteLanguageCode)).toBe(languageCode);
  });

  it('reads a plain ISO 639-1 code through the shared language lookup', () => {
    expect(fromSiteLanguageCode('tr')).toBe('tur');
    expect(fromSiteLanguageCode('pt')).toBe('por');
  });

  it.each([null, undefined, 42])(
    'reads %s as no language',
    siteLanguageCode => {
      expect(fromSiteLanguageCode(siteLanguageCode)).toBeNull();
    },
  );

  it.each(['me', 'zc', 'ze', 'at', 'ma', 'sb', 'tp', 'und', 'xx'])(
    'leaves the site code %s unmapped',
    siteLanguageCode => {
      expect(fromSiteLanguageCode(siteLanguageCode)).toBeNull();
    },
  );
});

describe('toSiteLanguageCodes', () => {
  it('asks a regional language by its site code alone', () => {
    expect(toSiteLanguageCodes(['pob'])).toEqual(['pb']);
    expect(toSiteLanguageCodes(['spl'])).toEqual(['ea']);
  });

  it('asks a base language by its ISO 639-1 code and its site variants', () => {
    expect(toSiteLanguageCodes(['spa'])).toEqual(['es', 'sp']);
    expect(toSiteLanguageCodes(['por'])).toEqual(['pt', 'pm']);
    expect(toSiteLanguageCodes(['zho'])).toEqual(['zh', 'zt']);
  });

  it('asks every other language by its ISO 639-1 code', () => {
    expect(toSiteLanguageCodes(['tur', 'eng'])).toEqual(['tr', 'en']);
  });

  it('asks each site code once', () => {
    expect(toSiteLanguageCodes(['por', 'pob', 'por'])).toEqual([
      'pt',
      'pm',
      'pb',
    ]);
  });

  it('round-trips the codes it sends for every subtitle language', () => {
    for (const languageCode of SubtitleLanguage.values) {
      for (const siteLanguageCode of toSiteLanguageCodes([languageCode])) {
        expect(fromSiteLanguageCode(siteLanguageCode), languageCode).toBe(
          languageCode,
        );
      }
    }
  });
});
