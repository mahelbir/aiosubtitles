import {uniq} from 'es-toolkit';
import {ReleaseSourceFamily} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {
  lookupSourceFamily,
  lookupStreamingService,
  OTHER_SOURCE_FAMILY,
  pickByOrder,
  pickReleaseEdition,
  toServiceKey,
  toTexts,
} from '@repo/subtitle-core/release-name/release-vocabulary.js';

export {
  buildAliasLookup,
  listCanonicalEditions,
  lookupSourceFamily,
} from '@repo/subtitle-core/release-name/release-vocabulary.js';

export const PARSED_FIELD_NAMES = [
  'releaseGroup',
  'releaseSourceFamily',
  'streamingService',
  'releaseEdition',
  'seasonNumbers',
  'episodeNumbers',
  'releaseTitle',
  'releaseYear',
];

const SOURCE_FAMILY_ORDER = [
  ...ReleaseSourceFamily.values,
  OTHER_SOURCE_FAMILY,
];

const TITLE_SEPARATOR_PATTERN = /[^\p{L}\p{M}\p{N}]+/gu;
const COMBINING_DOT_ABOVE_PATTERN = /̇/gu;
const INTEGER_PATTERN = /^\d+$/;

const normalizeSourceFamily = rawValue =>
  pickByOrder(
    toTexts(rawValue).map(
      rawText => lookupSourceFamily(rawText) ?? OTHER_SOURCE_FAMILY,
    ),
    SOURCE_FAMILY_ORDER,
  );

const normalizeStreamingService = rawValue => {
  const [rawText] = toTexts(rawValue);
  if (rawText === undefined) {
    return null;
  }
  return lookupStreamingService(rawText) ?? toServiceKey(rawText).toUpperCase();
};

const normalizeTitle = rawValue => {
  const [rawText] = toTexts(rawValue);
  const titleText = (rawText ?? '')
    .toLowerCase()
    .replace(COMBINING_DOT_ABOVE_PATTERN, '')
    .replace(TITLE_SEPARATOR_PATTERN, ' ')
    .trim();
  return titleText === '' ? null : titleText;
};

const normalizeGroup = rawValue => {
  const [rawText] = toTexts(rawValue);
  return rawText === undefined ? null : rawText.toLowerCase();
};

const toIntegers = rawValue =>
  toTexts(rawValue)
    .filter(rawText => INTEGER_PATTERN.test(rawText))
    .map(Number);

const normalizeNumberSet = rawValue =>
  uniq(toIntegers(rawValue)).toSorted((first, second) => first - second);

const normalizeYear = rawValue => toIntegers(rawValue)[0] ?? null;

const FIELD_NORMALIZERS = {
  releaseGroup: normalizeGroup,
  releaseSourceFamily: normalizeSourceFamily,
  streamingService: normalizeStreamingService,
  releaseEdition: pickReleaseEdition,
  seasonNumbers: normalizeNumberSet,
  episodeNumbers: normalizeNumberSet,
  releaseTitle: normalizeTitle,
  releaseYear: normalizeYear,
};

export const normalizeParsedField = (fieldName, rawValue) =>
  FIELD_NORMALIZERS[fieldName](rawValue);

export const normalizeParsedFields = rawFields =>
  Object.fromEntries(
    PARSED_FIELD_NAMES.map(fieldName => [
      fieldName,
      normalizeParsedField(fieldName, rawFields[fieldName]),
    ]),
  );

export const areParsedValuesEqual = (firstValue, secondValue) =>
  JSON.stringify(firstValue) === JSON.stringify(secondValue);
