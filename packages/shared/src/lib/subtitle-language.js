import isoLanguages from '@cospired/i18n-iso-languages';
import {SubtitleLanguage} from '../constants/subtitle-language.js';

const REGIONAL_LOCALE_TAGS = new Map([
  ['pt-br', SubtitleLanguage.POB],
  ['es-419', SubtitleLanguage.SPL],
]);
const NAME_QUALIFIER_PATTERN = /\s*\(.*\)$/;

const subtitleLanguageList = SubtitleLanguage.toList();
const subtitleLanguageCodeByName = new Map([
  ...subtitleLanguageList.map(({value: languageCode, label}) => [
    label.replace(NAME_QUALIFIER_PATTERN, '').toLowerCase(),
    languageCode,
  ]),
  ...subtitleLanguageList.map(({value: languageCode, label}) => [
    label.toLowerCase(),
    languageCode,
  ]),
]);

function fromIsoLanguageCode(isoLanguageCode) {
  const iso6391 = isoLanguages.toAlpha2(isoLanguageCode);
  if (!iso6391) {
    return null;
  }
  return (
    [
      isoLanguages.alpha2ToAlpha3B(iso6391),
      isoLanguages.alpha2ToAlpha3T(iso6391),
    ].find(
      languageCode => languageCode && SubtitleLanguage.has(languageCode),
    ) ?? null
  );
}

export function toSubtitleLanguageCode(siteLanguage) {
  if (typeof siteLanguage !== 'string') {
    return null;
  }
  const normalizedSiteLanguage = siteLanguage.trim().toLowerCase();
  if (SubtitleLanguage.has(normalizedSiteLanguage)) {
    return normalizedSiteLanguage;
  }
  const localeTag = normalizedSiteLanguage.replaceAll('_', '-');
  const [primaryLanguageTag] = localeTag.split('-');
  return (
    REGIONAL_LOCALE_TAGS.get(localeTag) ??
    subtitleLanguageCodeByName.get(normalizedSiteLanguage) ??
    fromIsoLanguageCode(primaryLanguageTag)
  );
}
