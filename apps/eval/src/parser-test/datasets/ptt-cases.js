import {isPlainObject, zipObject} from 'es-toolkit';
import {buildNameCase, mergeNameCases} from './name-cases.js';
import {
  createLiteralReader,
  isIdentifier,
  isPunctuation,
  tokenizeSource,
} from './source-literals.js';

const PYTHON_NAME_COLUMN = 'release_name';
const GO_NAME_COLUMN = 'ttitle';
const PYTHON_COLUMN_PREFIX = 'expected_';
const YEAR_PRESENCE_COLUMN = 'expect_year_presence';
const WHOLE_RESULT_COLUMNS = new Set(['output', 'result']);
const PARTIAL_RESULT_COLUMN = 'expected';
const GO_CASE_VARIABLE = 'tc';
const UNUSED_COLUMN_PREFIX = 'unused:';
const PARAMETRIZE_PATH = ['pytest', '.', 'mark', '.', 'parametrize'];

const SINGLE_COLUMN_FIELDS = {
  group: {fieldName: 'releaseGroup', isEmptyAbsence: true},
  title: {fieldName: 'releaseTitle', isEmptyAbsence: false},
  year: {fieldName: 'releaseYear', isEmptyAbsence: true},
  seasons: {fieldName: 'seasonNumbers', isEmptyAbsence: true},
  episode: {fieldName: 'episodeNumbers', isEmptyAbsence: true},
  episodes: {fieldName: 'episodeNumbers', isEmptyAbsence: true},
  quality: {fieldName: 'releaseSourceFamily', isEmptyAbsence: true},
  network: {fieldName: 'streamingService', isEmptyAbsence: true},
  edition: {fieldName: 'releaseEdition', isEmptyAbsence: true},
};

const WHOLE_RESULT_EDITION_FLAGS = {
  extended: 'Extended',
  unrated: 'Unrated',
  remastered: 'Remastered',
};

const isEmptyColumnValue = columnValue =>
  columnValue === null || columnValue === '';

const toLowerKeys = resultObject =>
  Object.fromEntries(
    Object.entries(resultObject).map(([resultKey, resultValue]) => [
      resultKey.toLowerCase(),
      resultValue,
    ]),
  );

const readWholeResult = resultObject => {
  const wholeResult = toLowerKeys(resultObject);
  return {
    releaseGroup: wholeResult.group ?? null,
    releaseSourceFamily: wholeResult.quality ?? null,
    streamingService: wholeResult.network ?? null,
    releaseEdition: [
      ...(isEmptyColumnValue(wholeResult.edition ?? null)
        ? []
        : [wholeResult.edition]),
      ...Object.entries(WHOLE_RESULT_EDITION_FLAGS)
        .filter(([flagName]) => wholeResult[flagName] === true)
        .map(([, editionName]) => editionName),
    ],
    seasonNumbers: wholeResult.seasons ?? [],
    episodeNumbers: wholeResult.episodes ?? [],
    releaseTitle: wholeResult.title ?? null,
    releaseYear: wholeResult.year ?? null,
  };
};

const readColumnFields = (columnValues, {isYearPresent}) =>
  Object.fromEntries(
    Object.entries(columnValues).flatMap(([columnName, columnValue]) => {
      const singleColumn = SINGLE_COLUMN_FIELDS[columnName];
      if (singleColumn === undefined || columnValue === undefined) {
        return [];
      }
      const isAbsent =
        isEmptyColumnValue(columnValue) ||
        (columnName === 'year' && !isYearPresent);
      if (isAbsent && !singleColumn.isEmptyAbsence) {
        return [];
      }
      return [[singleColumn.fieldName, isAbsent ? null : columnValue]];
    }),
  );

const readRow = ({columnNames, rowValues, nameColumn}) => {
  const rowByColumn = zipObject(columnNames, rowValues);
  const releaseName = rowByColumn[nameColumn];
  const columnValues = Object.fromEntries(
    Object.entries(rowByColumn)
      .filter(([columnName]) => columnName !== nameColumn)
      .map(([columnName, columnValue]) => [
        columnName.startsWith(PYTHON_COLUMN_PREFIX)
          ? columnName.slice(PYTHON_COLUMN_PREFIX.length)
          : columnName,
        columnValue,
      ]),
  );
  const wholeResult = Object.entries(columnValues).find(
    ([columnName, columnValue]) =>
      WHOLE_RESULT_COLUMNS.has(columnName) && isPlainObject(columnValue),
  );
  if (wholeResult) {
    return buildNameCase(releaseName, readWholeResult(wholeResult[1]));
  }
  const partialResult = columnValues[PARTIAL_RESULT_COLUMN];
  return buildNameCase(
    releaseName,
    readColumnFields(
      isPlainObject(partialResult) ? partialResult : columnValues,
      {isYearPresent: rowByColumn[YEAR_PRESENCE_COLUMN] !== false},
    ),
  );
};

const isParametrizeStart = literalReader =>
  isPunctuation(literalReader.peek(), '@') &&
  PARAMETRIZE_PATH.every((tokenText, offset) => {
    const token = literalReader.peek(offset + 1);
    return isIdentifier(token, tokenText) || isPunctuation(token, tokenText);
  }) &&
  isPunctuation(literalReader.peek(PARAMETRIZE_PATH.length + 1), '(');

export const listPttCases = pyText => {
  const literalReader = createLiteralReader(
    tokenizeSource(pyText, {commentStyle: 'hash'}),
  );
  const nameCases = [];
  while (!literalReader.isDone()) {
    if (!isParametrizeStart(literalReader)) {
      literalReader.advance();
      continue;
    }
    literalReader.setPosition(
      literalReader.getPosition() + PARAMETRIZE_PATH.length + 2,
    );
    const columnNames = String(literalReader.readValue())
      .split(',')
      .map(columnName => columnName.trim());
    literalReader.advance();
    const rows = literalReader.readValue();
    if (columnNames[0] !== PYTHON_NAME_COLUMN) {
      continue;
    }
    nameCases.push(
      ...rows.map(rowValues =>
        readRow({columnNames, rowValues, nameColumn: PYTHON_NAME_COLUMN}),
      ),
    );
  }
  return nameCases;
};

export const parsePttCases = pyText => mergeNameCases(listPttCases(pyText));

const readStructColumns = literalReader => {
  const columnNames = [];
  while (!isPunctuation(literalReader.peek(), '}')) {
    columnNames.push(literalReader.advance().tokenText);
    while (!isIdentifier(literalReader.advance())) {
      continue;
    }
  }
  literalReader.advance();
  return columnNames;
};

const readUsedCaseFields = literalReader => {
  const usedFieldNames = new Set();
  let depth = 0;
  do {
    const token = literalReader.advance();
    if (isPunctuation(token, '{')) {
      depth += 1;
    } else if (isPunctuation(token, '}')) {
      depth -= 1;
    } else if (
      isIdentifier(token, GO_CASE_VARIABLE) &&
      isPunctuation(literalReader.peek(), '.') &&
      isIdentifier(literalReader.peek(1))
    ) {
      usedFieldNames.add(literalReader.peek(1).tokenText);
    }
  } while (depth > 0 && !literalReader.isDone());
  return usedFieldNames;
};

const isStructTableStart = literalReader =>
  isPunctuation(literalReader.peek(), '[') &&
  isPunctuation(literalReader.peek(1), ']') &&
  isIdentifier(literalReader.peek(2), 'struct') &&
  isPunctuation(literalReader.peek(3), '{');

export const listGoPttCases = goText => {
  const literalReader = createLiteralReader(
    tokenizeSource(goText, {commentStyle: 'slash'}),
  );
  const nameCases = [];
  while (!literalReader.isDone()) {
    if (!isStructTableStart(literalReader)) {
      literalReader.advance();
      continue;
    }
    literalReader.setPosition(literalReader.getPosition() + 4);
    const columnNames = readStructColumns(literalReader);
    const rows = literalReader.readValue();
    const usedColumnNames = readUsedCaseFields(literalReader);
    if (!columnNames.includes(GO_NAME_COLUMN)) {
      continue;
    }
    const readColumnNames = columnNames.map(columnName =>
      columnName === GO_NAME_COLUMN || usedColumnNames.has(columnName)
        ? columnName
        : `${UNUSED_COLUMN_PREFIX}${columnName}`,
    );
    nameCases.push(
      ...rows.map(rowValues =>
        readRow({
          columnNames: readColumnNames,
          rowValues: Array.isArray(rowValues)
            ? rowValues
            : columnNames.map(columnName => rowValues[columnName]),
          nameColumn: GO_NAME_COLUMN,
        }),
      ),
    );
  }
  return nameCases;
};

export const parseGoPttCases = goText => mergeNameCases(listGoPttCases(goText));
