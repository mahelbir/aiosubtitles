import {readFileSync} from 'node:fs';
import englishLanguageNames from '@cospired/i18n-iso-languages/langs/en.json' with {type: 'json'};
import {describe, expect, it} from 'vitest';
import {SubtitleLanguage} from '../src/constants/subtitle-language.js';
import {toSubtitleLanguageCode} from '../src/lib/subtitle-language.js';

const stremioLanguageNames = JSON.parse(
  readFileSync(
    new URL('./fixtures/stremio-language-names.json', import.meta.url),
    'utf8',
  ),
);
const stremioLanguageCodes = Object.keys(stremioLanguageNames);
const REGIONAL_LANGUAGE_CODES = ['pob', 'spl'];
const subtitleLanguageOptions = SubtitleLanguage.toList({
  extra: subtitleLanguageItem => ({
    iso6391: subtitleLanguageItem.raw.iso6391,
  }),
});

describe('SubtitleLanguage', () => {
  it('reads a non-empty copy of Stremio language names', () => {
    expect(stremioLanguageCodes.length).toBeGreaterThan(100);
  });

  it('has one member per Stremio language code', () => {
    expect(SubtitleLanguage.values).toHaveLength(stremioLanguageCodes.length);
    expect([...SubtitleLanguage.values].sort()).toEqual(
      [...stremioLanguageCodes].sort(),
    );
  });

  it('makes every Stremio language code a member', () => {
    for (const languageCode of stremioLanguageCodes) {
      expect(SubtitleLanguage.has(languageCode), languageCode).toBe(true);
    }
  });

  it('keeps the Stremio native name of every member', () => {
    for (const languageCode of stremioLanguageCodes) {
      expect(SubtitleLanguage.item(languageCode).nativeName, languageCode).toBe(
        stremioLanguageNames[languageCode],
      );
    }
  });

  it('gives every member an English label and an optional two-letter code', () => {
    for (const subtitleLanguageOption of subtitleLanguageOptions) {
      expect(
        subtitleLanguageOption.label,
        subtitleLanguageOption.value,
      ).toMatch(/\S/);
      if (subtitleLanguageOption.iso6391 !== null) {
        expect(
          subtitleLanguageOption.iso6391,
          subtitleLanguageOption.value,
        ).toMatch(/^[a-z]{2}$/);
      }
    }
  });

  it('takes the English label of every non-regional member from the ISO 639 library', () => {
    for (const subtitleLanguageOption of subtitleLanguageOptions) {
      if (REGIONAL_LANGUAGE_CODES.includes(subtitleLanguageOption.value)) {
        continue;
      }
      expect(subtitleLanguageOption.label, subtitleLanguageOption.value).toBe(
        englishLanguageNames.languages[subtitleLanguageOption.iso6391],
      );
    }
  });

  it.each([
    ['tur', 'Turkish', 'tr'],
    ['eng', 'English', 'en'],
    ['ger', 'German', 'de'],
    ['fre', 'French', 'fr'],
  ])('describes %s', (languageCode, label, iso6391) => {
    const subtitleLanguageItem = SubtitleLanguage.item(languageCode);
    expect(subtitleLanguageItem.label).toBe(label);
    expect(subtitleLanguageItem.iso6391).toBe(iso6391);
  });

  it('labels pob as Brazilian Portuguese', () => {
    expect(SubtitleLanguage.label('pob')).toBe('Brazilian Portuguese');
  });

  it.each([
    ['pob', 'pt'],
    ['spl', 'es'],
  ])(
    'keeps the region of %s in its key and gives it %s',
    (languageCode, iso6391) => {
      expect(SubtitleLanguage.item(languageCode).iso6391).toBe(iso6391);
    },
  );

  it('labels spl as Latin American Spanish', () => {
    expect(SubtitleLanguage.label('spl')).toBe('Latin American Spanish');
  });

  it('maps every member value and label back to itself', () => {
    for (const subtitleLanguageOption of subtitleLanguageOptions) {
      expect(
        toSubtitleLanguageCode(subtitleLanguageOption.value),
        subtitleLanguageOption.value,
      ).toBe(subtitleLanguageOption.value);
      expect(
        toSubtitleLanguageCode(subtitleLanguageOption.label),
        subtitleLanguageOption.label,
      ).toBe(subtitleLanguageOption.value);
    }
  });

  it('maps the two-letter code of every non-regional member back to it', () => {
    for (const subtitleLanguageOption of subtitleLanguageOptions) {
      if (REGIONAL_LANGUAGE_CODES.includes(subtitleLanguageOption.value)) {
        continue;
      }
      expect(
        toSubtitleLanguageCode(subtitleLanguageOption.iso6391),
        subtitleLanguageOption.value,
      ).toBe(subtitleLanguageOption.value);
    }
  });
});

describe('toSubtitleLanguageCode', () => {
  it.each([
    ['tur', 'tur'],
    ['tr', 'tur'],
    ['TR', 'tur'],
    ['tr-TR', 'tur'],
    ['Turkish', 'tur'],
    ['turkish', 'tur'],
    ['pob', 'pob'],
    ['pt-BR', 'pob'],
    ['Brazilian Portuguese', 'pob'],
    ['brazilian portuguese', 'pob'],
    ['de', 'ger'],
    ['deu', 'ger'],
    ['ger', 'ger'],
    ['fra', 'fre'],
    ['fre', 'fre'],
    ['chi', 'zho'],
    ['zho', 'zho'],
    ['en', 'eng'],
    ['pt', 'por'],
    ['pt-PT', 'por'],
    ['pt_BR', 'pob'],
    ['es-419', 'spl'],
    ['es-ES', 'spa'],
    ['Greek', 'ell'],
    ['Hebrew', 'heb'],
    [' Turkish ', 'tur'],
  ])('maps %j to %s', (siteLanguage, subtitleLanguageCode) => {
    expect(toSubtitleLanguageCode(siteLanguage)).toBe(subtitleLanguageCode);
  });

  it.each([
    ['Farsi', 'fas'],
    ['Farsi/Persian', 'fas'],
    ['Norwegian Bokmål', 'nob'],
    ['Khmer', 'khm'],
    ['Sinhala', 'sin'],
    ['Filipino', 'tgl'],
    ['iw', 'heb'],
    ['in', 'ind'],
    ['ji', 'yid'],
    ['FARSI', 'fas'],
    [' filipino ', 'tgl'],
  ])('maps the site alias %j to %s', (siteLanguage, subtitleLanguageCode) => {
    expect(toSubtitleLanguageCode(siteLanguage)).toBe(subtitleLanguageCode);
  });

  it.each([
    'xx',
    '',
    'Klingonese',
    'xx-YY',
    'constructor',
    '__proto__',
    'toString',
    'hasOwnProperty',
    undefined,
    null,
  ])('maps %j to null', siteLanguage => {
    expect(toSubtitleLanguageCode(siteLanguage)).toBeNull();
  });
});
