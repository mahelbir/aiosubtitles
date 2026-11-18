import {groupBy, uniq} from 'es-toolkit';
import {SubtitleLanguage} from '@repo/shared/constants/subtitle-language.js';
import {toSubtitleLanguageCode} from '@repo/shared/lib/subtitle-language.js';

const SITE_LANGUAGE_CODES = new Map([
  ['pb', SubtitleLanguage.POB],
  ['ea', SubtitleLanguage.SPL],
  ['sp', SubtitleLanguage.SPA],
  ['pm', SubtitleLanguage.POR],
  ['zt', SubtitleLanguage.ZHO],
]);

const siteLanguageCodesByLanguageCode = groupBy(
  [...SITE_LANGUAGE_CODES.keys()],
  siteLanguageCode => SITE_LANGUAGE_CODES.get(siteLanguageCode),
);

export function fromSiteLanguageCode(siteLanguageCode) {
  if (typeof siteLanguageCode !== 'string') {
    return null;
  }
  return (
    SITE_LANGUAGE_CODES.get(siteLanguageCode.trim().toLowerCase()) ??
    toSubtitleLanguageCode(siteLanguageCode)
  );
}

function listSiteLanguageCodes(languageCode) {
  const iso6391 = SubtitleLanguage.raw(languageCode)?.iso6391;
  return [
    ...(iso6391 && toSubtitleLanguageCode(iso6391) === languageCode
      ? [iso6391]
      : []),
    ...(siteLanguageCodesByLanguageCode[languageCode] ?? []),
  ];
}

export function toSiteLanguageCodes(languageCodes) {
  return uniq(languageCodes.flatMap(listSiteLanguageCodes));
}
