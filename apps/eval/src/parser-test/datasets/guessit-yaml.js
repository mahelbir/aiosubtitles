import {parseDocument} from 'yaml';
import {toGuessitRawFields} from '../adapters/guessit.js';
import {buildNameCase, isKeptNameCase} from './name-cases.js';

const DEFAULT_ENTRY_NAME = '__default__';
const NEGATED_PREFIX = '-';
const POSITIVE_PREFIX = '+';
const OPTIONS_KEY = 'options';

const readEntries = yamlText =>
  parseDocument(yamlText, {uniqueKeys: false}).contents.items.map(entry => ({
    entryKey: String(entry.key.value),
    expectation: entry.value?.toJSON() ?? null,
  }));

const withExpectationsCarriedBack = entries => {
  let nextExpectation = null;
  return entries
    .toReversed()
    .map(({entryKey, expectation}) => {
      nextExpectation = expectation ?? nextExpectation;
      return {entryKey, expectation: nextExpectation};
    })
    .toReversed();
};

const readAssertedProperties = expectation =>
  Object.fromEntries(
    Object.entries(expectation ?? {}).filter(
      ([propertyName]) => !propertyName.startsWith(NEGATED_PREFIX),
    ),
  );

const toAssertedRawFields = expectation => {
  const rawFields = toGuessitRawFields(readAssertedProperties(expectation));
  return Object.fromEntries(
    Object.entries(rawFields).filter(([, rawValue]) => rawValue !== undefined),
  );
};

export const parseGuessitYaml = yamlText => {
  const nameCaseByName = new Map();
  for (const {entryKey, expectation} of withExpectationsCarriedBack(
    readEntries(yamlText),
  )) {
    if (
      entryKey === DEFAULT_ENTRY_NAME ||
      entryKey.startsWith(NEGATED_PREFIX) ||
      Object.hasOwn(expectation ?? {}, OPTIONS_KEY)
    ) {
      continue;
    }
    const releaseName = entryKey.startsWith(POSITIVE_PREFIX)
      ? entryKey.slice(POSITIVE_PREFIX.length)
      : entryKey;
    nameCaseByName.delete(releaseName);
    nameCaseByName.set(
      releaseName,
      buildNameCase(releaseName, toAssertedRawFields(expectation)),
    );
  }
  return [...nameCaseByName.values()].filter(isKeptNameCase);
};
