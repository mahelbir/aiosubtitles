import {sha256} from 'melperjs/node';
import {mulberry32} from '../metrics/mulberry32.js';
import {RESAMPLE_SEED} from '../metrics/resampling.js';
import {
  areParsedValuesEqual,
  normalizeParsedField,
  PARSED_FIELD_NAMES,
} from './normalize-fields.js';

const SAMPLE_SHARE_DENOMINATOR = 10;

export class ParserLabelError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ParserLabelError';
  }
}

const getItemKey = ({releaseName, fieldName}) =>
  JSON.stringify([releaseName, fieldName]);

const compareText = (first, second) => {
  if (first === second) {
    return 0;
  }
  return first < second ? -1 : 1;
};

const compareFieldOrder = (first, second) =>
  PARSED_FIELD_NAMES.indexOf(first.fieldName) -
  PARSED_FIELD_NAMES.indexOf(second.fieldName);

export const findOwnItems = ({releaseNames, readingsByLibrary}) =>
  releaseNames.flatMap(releaseName =>
    PARSED_FIELD_NAMES.map(fieldName => {
      const fieldReadings = [...readingsByLibrary.values()].map(
        readingByName => readingByName.get(releaseName)[fieldName],
      );
      const isAgreed = fieldReadings.every(fieldReading =>
        areParsedValuesEqual(fieldReading, fieldReadings[0]),
      );
      return {
        releaseName,
        fieldName,
        isAgreed,
        agreedValue: isAgreed ? fieldReadings[0] : null,
      };
    }),
  );

export const selectAgreedSample = ownItems => {
  const orderedItems = ownItems
    .filter(ownItem => ownItem.isAgreed)
    .map(ownItem => ({ownItem, nameDigest: sha256(ownItem.releaseName)}))
    .toSorted(
      (first, second) =>
        compareText(first.nameDigest, second.nameDigest) ||
        compareFieldOrder(first.ownItem, second.ownItem),
    )
    .map(({ownItem}) => ownItem);
  const sampleSize = Math.ceil(orderedItems.length / SAMPLE_SHARE_DENOMINATOR);
  const random = mulberry32(RESAMPLE_SEED);
  for (let position = 0; position < sampleSize; position += 1) {
    const swapPosition =
      position + Math.floor(random() * (orderedItems.length - position));
    [orderedItems[position], orderedItems[swapPosition]] = [
      orderedItems[swapPosition],
      orderedItems[position],
    ];
  }
  return orderedItems.slice(0, sampleSize);
};

export const buildPendingItems = ownItems =>
  [
    ...ownItems.filter(ownItem => !ownItem.isAgreed),
    ...selectAgreedSample(ownItems),
  ]
    .map(({releaseName, fieldName}) => ({releaseName, fieldName}))
    .toSorted(
      (first, second) =>
        compareText(first.releaseName, second.releaseName) ||
        compareFieldOrder(first, second),
    );

const isLabelShape = label =>
  typeof label?.releaseName === 'string' &&
  PARSED_FIELD_NAMES.includes(label.fieldName) &&
  Object.hasOwn(label, 'expectedValue');

const isNormalisedValue = ({fieldName, expectedValue}) =>
  areParsedValuesEqual(
    normalizeParsedField(fieldName, expectedValue),
    expectedValue,
  );

export const parseParserLabels = labelsText => {
  let labelsJson;
  try {
    labelsJson = JSON.parse(labelsText);
  } catch {
    throw new ParserLabelError('The parser labels file is not valid JSON.');
  }
  const labels = labelsJson?.labels;
  if (!Array.isArray(labels) || !labels.every(isLabelShape)) {
    throw new ParserLabelError(
      'Each parser label needs a release name, a known field and an expected value.',
    );
  }
  if (!labels.every(isNormalisedValue)) {
    throw new ParserLabelError(
      'A parser label value is not in its normalised form.',
    );
  }
  if (new Set(labels.map(getItemKey)).size !== labels.length) {
    throw new ParserLabelError('One parser item is labelled twice.');
  }
  return labels;
};

export const resolveOwnTruth = ({ownItems, labels}) => {
  const labelByKey = new Map(labels.map(label => [getItemKey(label), label]));
  const pendingKeys = new Set(buildPendingItems(ownItems).map(getItemKey));
  const sampledKeys = new Set(selectAgreedSample(ownItems).map(getItemKey));
  if ([...pendingKeys].some(pendingKey => !labelByKey.has(pendingKey))) {
    throw new ParserLabelError('A pending parser item has no label.');
  }
  const expectedFieldsByName = new Map();
  let sampleErrorCount = 0;
  for (const ownItem of ownItems) {
    const itemKey = getItemKey(ownItem);
    const expectedValue = pendingKeys.has(itemKey)
      ? labelByKey.get(itemKey).expectedValue
      : ownItem.agreedValue;
    if (
      sampledKeys.has(itemKey) &&
      !areParsedValuesEqual(expectedValue, ownItem.agreedValue)
    ) {
      sampleErrorCount += 1;
    }
    const expectedFields = expectedFieldsByName.get(ownItem.releaseName) ?? {};
    expectedFields[ownItem.fieldName] = expectedValue;
    expectedFieldsByName.set(ownItem.releaseName, expectedFields);
  }
  return {
    nameCases: [...expectedFieldsByName].map(
      ([releaseName, expectedFields]) => ({releaseName, expectedFields}),
    ),
    pendingItemCount: pendingKeys.size,
    sampleSize: sampledKeys.size,
    sampleErrorCount,
    ignoredLabelCount: [...labelByKey.keys()].filter(
      labelKey => !pendingKeys.has(labelKey),
    ).length,
  };
};
