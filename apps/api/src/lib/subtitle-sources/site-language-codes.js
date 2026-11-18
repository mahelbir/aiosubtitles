import {Enum} from 'enum-plus';
import {groupBy, uniq} from 'es-toolkit';
import {SubtitleLanguage} from '@repo/shared/constants/subtitle-language.js';
import {toSubtitleLanguageCode} from '@repo/shared/lib/subtitle-language.js';

export const SiteLanguageCodeStyle = Enum({
  TWO_LETTER: {value: 'two-letter', isIsoCodeKept: true},
  LOCALE: {value: 'locale', isIsoCodeKept: false},
});

const {TWO_LETTER, LOCALE} = SiteLanguageCodeStyle;
const SITE_LANGUAGE_CODES = new Map([
  [
    'pb',
    {languageCode: SubtitleLanguage.POB, siteLanguageCodeStyle: TWO_LETTER},
  ],
  [
    'ea',
    {languageCode: SubtitleLanguage.SPL, siteLanguageCodeStyle: TWO_LETTER},
  ],
  [
    'sp',
    {languageCode: SubtitleLanguage.SPA, siteLanguageCodeStyle: TWO_LETTER},
  ],
  [
    'pm',
    {languageCode: SubtitleLanguage.POR, siteLanguageCodeStyle: TWO_LETTER},
  ],
  [
    'zt',
    {languageCode: SubtitleLanguage.ZHO, siteLanguageCodeStyle: TWO_LETTER},
  ],
  [
    'pt-br',
    {languageCode: SubtitleLanguage.POB, siteLanguageCodeStyle: LOCALE},
  ],
  [
    'pt-pt',
    {languageCode: SubtitleLanguage.POR, siteLanguageCodeStyle: LOCALE},
  ],
  [
    'zh-cn',
    {languageCode: SubtitleLanguage.ZHO, siteLanguageCodeStyle: LOCALE},
  ],
]);

function toStyledLanguageKey({languageCode, siteLanguageCodeStyle}) {
  return `${siteLanguageCodeStyle}:${languageCode}`;
}

const siteLanguageCodesByStyledLanguage = groupBy(
  [...SITE_LANGUAGE_CODES.keys()],
  siteLanguageCode =>
    toStyledLanguageKey(SITE_LANGUAGE_CODES.get(siteLanguageCode)),
);

export function fromSiteLanguageCode(siteLanguageCode) {
  if (typeof siteLanguageCode !== 'string') {
    return null;
  }
  return (
    SITE_LANGUAGE_CODES.get(siteLanguageCode.trim().toLowerCase())
      ?.languageCode ?? toSubtitleLanguageCode(siteLanguageCode)
  );
}

function listStyledCodes(
  languageCode,
  siteLanguageCodeStyle,
  ownSiteLanguageCodes,
) {
  if (ownSiteLanguageCodes) {
    return [...ownSiteLanguageCodes]
      .filter(([, ownLanguageCode]) => ownLanguageCode === languageCode)
      .map(([siteLanguageCode]) => siteLanguageCode);
  }
  return (
    siteLanguageCodesByStyledLanguage[
      toStyledLanguageKey({languageCode, siteLanguageCodeStyle})
    ] ?? []
  );
}

function listSiteLanguageCodes(
  languageCode,
  siteLanguageCodeStyle,
  ownSiteLanguageCodes,
) {
  const styledCodes = listStyledCodes(
    languageCode,
    siteLanguageCodeStyle,
    ownSiteLanguageCodes,
  );
  const iso6391 = SubtitleLanguage.raw(languageCode)?.iso6391;
  const isIsoCodeAsked =
    Boolean(iso6391) &&
    toSubtitleLanguageCode(iso6391) === languageCode &&
    (SiteLanguageCodeStyle.raw(siteLanguageCodeStyle).isIsoCodeKept ||
      styledCodes.length === 0);
  return [...(isIsoCodeAsked ? [iso6391] : []), ...styledCodes];
}

/**
 * @param {string[]} languageCodes
 * @param {string} [siteLanguageCodeStyle]
 * @param {Map<string, string>|null} [ownSiteLanguageCodes]
 * @returns {string[]}
 */
export function toSiteLanguageCodes(
  languageCodes,
  siteLanguageCodeStyle = SiteLanguageCodeStyle.TWO_LETTER,
  ownSiteLanguageCodes = null,
) {
  return uniq(
    languageCodes.flatMap(languageCode =>
      listSiteLanguageCodes(
        languageCode,
        siteLanguageCodeStyle,
        ownSiteLanguageCodes,
      ),
    ),
  );
}
