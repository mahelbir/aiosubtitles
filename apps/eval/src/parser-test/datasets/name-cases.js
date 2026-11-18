import {
  areParsedValuesEqual,
  listCanonicalEditions,
  normalizeParsedField,
  PARSED_FIELD_NAMES,
} from '../normalize-fields.js';

const EDITION_FIELD_NAME = 'releaseEdition';

const isNamedEdition = rawValue =>
  rawValue !== null &&
  rawValue !== undefined &&
  rawValue !== '' &&
  !(Array.isArray(rawValue) && rawValue.length === 0);

const isEditionUnasserted = rawFields =>
  Object.hasOwn(rawFields, EDITION_FIELD_NAME) &&
  isNamedEdition(rawFields[EDITION_FIELD_NAME]) &&
  listCanonicalEditions(rawFields[EDITION_FIELD_NAME]).length !== 1;

const hasSeveralEditions = rawFields =>
  Object.hasOwn(rawFields, EDITION_FIELD_NAME) &&
  listCanonicalEditions(rawFields[EDITION_FIELD_NAME]).length > 1;

export const toExpectedFields = rawFields =>
  Object.fromEntries(
    PARSED_FIELD_NAMES.filter(
      fieldName =>
        Object.hasOwn(rawFields, fieldName) &&
        !(fieldName === EDITION_FIELD_NAME && isEditionUnasserted(rawFields)),
    ).map(fieldName => [
      fieldName,
      normalizeParsedField(fieldName, rawFields[fieldName]),
    ]),
  );

export const buildNameCase = (releaseName, rawFields) => ({
  releaseName,
  expectedFields: toExpectedFields(rawFields),
  ...(hasSeveralEditions(rawFields) ? {hasDroppedEdition: true} : {}),
});

const orderExpectedFields = expectedFields =>
  Object.fromEntries(
    PARSED_FIELD_NAMES.filter(fieldName =>
      Object.hasOwn(expectedFields, fieldName),
    ).map(fieldName => [fieldName, expectedFields[fieldName]]),
  );

export const mergeNameCases = nameCases => {
  const expectedByName = new Map();
  const conflictsByName = new Map();
  const droppedEditionNames = new Set();
  for (const {releaseName, expectedFields, hasDroppedEdition} of nameCases) {
    const mergedFields = expectedByName.get(releaseName) ?? {};
    const conflictedFields = conflictsByName.get(releaseName) ?? new Set();
    for (const [fieldName, expectedValue] of Object.entries(expectedFields)) {
      if (
        Object.hasOwn(mergedFields, fieldName) &&
        !areParsedValuesEqual(mergedFields[fieldName], expectedValue)
      ) {
        conflictedFields.add(fieldName);
      }
      mergedFields[fieldName] = expectedValue;
    }
    if (hasDroppedEdition) {
      droppedEditionNames.add(releaseName);
    }
    expectedByName.set(releaseName, mergedFields);
    conflictsByName.set(releaseName, conflictedFields);
  }
  return [...expectedByName]
    .map(([releaseName, mergedFields]) => {
      const conflictedFields = conflictsByName.get(releaseName);
      return {
        releaseName,
        expectedFields: orderExpectedFields(
          Object.fromEntries(
            Object.entries(mergedFields).filter(
              ([fieldName]) =>
                !conflictedFields.has(fieldName) &&
                !(
                  fieldName === EDITION_FIELD_NAME &&
                  droppedEditionNames.has(releaseName)
                ),
            ),
          ),
        ),
        ...(droppedEditionNames.has(releaseName)
          ? {hasDroppedEdition: true}
          : {}),
      };
    })
    .filter(isKeptNameCase);
};

export const hasExpectedFields = nameCase =>
  Object.keys(nameCase.expectedFields).length > 0;

export const isKeptNameCase = nameCase =>
  hasExpectedFields(nameCase) || nameCase.hasDroppedEdition === true;

export const countDroppedEditionNames = nameCases =>
  nameCases.filter(nameCase => nameCase.hasDroppedEdition).length;
