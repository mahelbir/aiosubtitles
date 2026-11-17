import isoLanguages from '@cospired/i18n-iso-languages';
import englishLanguageNames from '@cospired/i18n-iso-languages/langs/en.json' with {type: 'json'};
import {Enum} from 'enum-plus';
import stremioLanguageNames from './stremio-language-names.json' with {type: 'json'};

const REGIONAL_SUBTITLE_LANGUAGES = new Map([
  ['pob', {label: 'Brazilian Portuguese', iso6391: 'pt'}],
  ['spl', {label: 'Latin American Spanish', iso6391: 'es'}],
]);

function toSubtitleLanguageInit(languageCode, nativeName) {
  const regionalLanguage = REGIONAL_SUBTITLE_LANGUAGES.get(languageCode);
  if (regionalLanguage) {
    return {value: languageCode, nativeName, ...regionalLanguage};
  }
  const iso6391 = isoLanguages.toAlpha2(languageCode) ?? null;
  return {
    value: languageCode,
    label: englishLanguageNames.languages[iso6391],
    nativeName,
    iso6391,
  };
}

export const SubtitleLanguage = Enum(
  Object.fromEntries(
    Object.entries(stremioLanguageNames).map(([languageCode, nativeName]) => [
      languageCode.toUpperCase(),
      toSubtitleLanguageInit(languageCode, nativeName),
    ]),
  ),
);
