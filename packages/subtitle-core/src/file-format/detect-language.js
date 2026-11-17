import {francAll} from 'franc-min';
import {data as francTrigramData} from 'franc-min/data.js';
import {expressions as francScriptExpressions} from 'franc-min/expressions.js';
import {SubtitleLanguage} from '@repo/shared/constants/subtitle-language.js';
import {toSubtitleLanguageCode} from '@repo/shared/lib/subtitle-language.js';

const UNDETERMINED_LANGUAGE_CODE = 'und';
const DETECTION_SAMPLE_LENGTH = 2048;
const DETECTION_TEXT_LENGTH_MIN = 100;
const RUNNER_UP_SCORE_MAX = 0.99;
const LATIN_SHARE_MIN = 0.5;
const LETTER_PATTERN = /\p{L}/gu;
const LATIN_LETTER_PATTERN = /\p{Script=Latin}/gu;
const SERBO_CROATIAN_BASE_LANGUAGE = 'sh';
const SIBLING_LANGUAGE_BASES = new Map([
  ['bs', SERBO_CROATIAN_BASE_LANGUAGE],
  ['hr', SERBO_CROATIAN_BASE_LANGUAGE],
  ['sr', SERBO_CROATIAN_BASE_LANGUAGE],
  ['id', 'ms'],
]);
const FRANC_MACROLANGUAGE_CODES = new Map([
  ['arb', 'ara'],
  ['azj', 'aze'],
  ['ckb', 'kur'],
  ['cmn', 'zho'],
  ['fuv', 'ful'],
  ['koi', 'kom'],
  ['npi', 'nep'],
  ['pbu', 'pus'],
  ['pes', 'fas'],
  ['plt', 'mlg'],
  ['qug', 'que'],
  ['swh', 'swa'],
  ['uzn', 'uzb'],
  ['zlm', 'msa'],
]);

const toFrancSubtitleLanguageCode = francLanguageCode =>
  toSubtitleLanguageCode(
    FRANC_MACROLANGUAGE_CODES.get(francLanguageCode) ?? francLanguageCode,
  );

const toIsoLanguage = languageCode =>
  SubtitleLanguage.raw(languageCode)?.iso6391 ?? languageCode;

const toBaseLanguage = (languageCode, {canMergeSiblings}) => {
  const isoLanguage = toIsoLanguage(languageCode);
  return canMergeSiblings
    ? (SIBLING_LANGUAGE_BASES.get(isoLanguage) ?? isoLanguage)
    : isoLanguage;
};

const toFrancBaseLanguage = francLanguageCode =>
  toBaseLanguage(
    toFrancSubtitleLanguageCode(francLanguageCode) ?? francLanguageCode,
    {canMergeSiblings: true},
  );

const DETECTABLE_ISO_LANGUAGES = new Set(
  [
    ...Object.values(francTrigramData).flatMap(Object.keys),
    ...Object.keys(francScriptExpressions).filter(
      expressionName => !Object.hasOwn(francTrigramData, expressionName),
    ),
  ]
    .map(toFrancSubtitleLanguageCode)
    .filter(Boolean)
    .map(toIsoLanguage),
);

const sampleDetectionText = text => {
  if (text.length <= DETECTION_SAMPLE_LENGTH) {
    return text;
  }
  const sampleStart = Math.floor((text.length - DETECTION_SAMPLE_LENGTH) / 2);
  return text.slice(sampleStart, sampleStart + DETECTION_SAMPLE_LENGTH);
};

export const isLatinScriptText = text => {
  const sampleText = sampleDetectionText(text);
  const letterCount = sampleText.match(LETTER_PATTERN)?.length ?? 0;
  const latinLetterCount = sampleText.match(LATIN_LETTER_PATTERN)?.length ?? 0;
  return letterCount > 0 && latinLetterCount / letterCount >= LATIN_SHARE_MIN;
};

export const isSameBaseLanguage = (
  languageCode,
  otherLanguageCode,
  {canMergeSiblings},
) =>
  toBaseLanguage(languageCode, {canMergeSiblings}) ===
  toBaseLanguage(otherLanguageCode, {canMergeSiblings});

export const canDetectLanguageCode = languageCode =>
  DETECTABLE_ISO_LANGUAGES.has(toIsoLanguage(languageCode));

export const detectLanguageCode = text => {
  const sampleText = sampleDetectionText(text);
  const [[topLanguageCode], ...otherScores] = francAll(sampleText, {
    minLength: DETECTION_TEXT_LENGTH_MIN,
  });
  if (topLanguageCode === UNDETERMINED_LANGUAGE_CODE) {
    return null;
  }
  const topBaseLanguage = toFrancBaseLanguage(topLanguageCode);
  const runnerUp = otherScores.find(
    ([francLanguageCode]) =>
      toFrancBaseLanguage(francLanguageCode) !== topBaseLanguage,
  );
  if (runnerUp && runnerUp[1] > RUNNER_UP_SCORE_MAX) {
    return null;
  }
  if (
    topBaseLanguage === SERBO_CROATIAN_BASE_LANGUAGE &&
    !isLatinScriptText(sampleText)
  ) {
    return SubtitleLanguage.SRP;
  }
  return toFrancSubtitleLanguageCode(topLanguageCode);
};
