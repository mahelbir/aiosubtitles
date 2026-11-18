import {zipWith} from 'es-toolkit';
import {add} from 'es-toolkit/compat';
import {sha256} from 'melperjs/node';
import {NameDataset, ParserLibrary} from '../constants/parser-library.js';
import {
  divideOrNull,
  listUnorderedPairs,
  normalizeScore,
  summarizeDefinedMean,
} from '../metrics/metric-math.js';
import {
  comparePaired,
  RESAMPLE_DRAW_COUNT,
  RESAMPLE_SEED,
  resampleStatistic,
} from '../metrics/resampling.js';
import {isKeptNameCase} from './datasets/name-cases.js';
import {isNameEligible} from './name-eligibility.js';
import {areParsedValuesEqual, PARSED_FIELD_NAMES} from './normalize-fields.js';

const SEASON_EPISODE_FIELD_NAMES = ['seasonNumbers', 'episodeNumbers'];
const PORT_DECISION_LINE = 'Decision: port guessit';

const parserLibraryList = ParserLibrary.toList({
  extra: parserLibrary => ({isJavaScript: parserLibrary.raw.isJavaScript}),
});
const JAVASCRIPT_LIBRARIES = parserLibraryList
  .filter(({isJavaScript}) => isJavaScript)
  .map(({value: library}) => library);
const EXTERNAL_DATASETS = NameDataset.values.filter(
  datasetName => datasetName !== NameDataset.OWN,
);

export const buildScoreUnits = ({nameCases, readingByName}) =>
  nameCases
    .filter(isKeptNameCase)
    .map(({releaseName, expectedFields, hasDroppedEdition = false}) => {
      const parsedFields = readingByName.get(releaseName);
      const fieldOutcomes = PARSED_FIELD_NAMES.map(fieldName => {
        if (!Object.hasOwn(expectedFields, fieldName)) {
          return {itemCount: 0, correctCount: 0};
        }
        return {
          itemCount: 1,
          correctCount: areParsedValuesEqual(
            parsedFields[fieldName],
            expectedFields[fieldName],
          )
            ? 1
            : 0,
        };
      });
      return {
        sortKey: sha256(releaseName),
        itemCounts: fieldOutcomes.map(({itemCount}) => itemCount),
        correctCounts: fieldOutcomes.map(({correctCount}) => correctCount),
        hasDroppedEdition,
      };
    });

const sumFieldCounts = scoreUnits => {
  const itemTotals = new Float64Array(PARSED_FIELD_NAMES.length);
  const correctTotals = new Float64Array(PARSED_FIELD_NAMES.length);
  for (const scoreUnit of scoreUnits) {
    for (
      let fieldIndex = 0;
      fieldIndex < PARSED_FIELD_NAMES.length;
      fieldIndex += 1
    ) {
      itemTotals[fieldIndex] += scoreUnit.itemCounts[fieldIndex];
      correctTotals[fieldIndex] += scoreUnit.correctCounts[fieldIndex];
    }
  }
  return {itemTotals, correctTotals};
};

const listFieldAccuracies = scoreUnits => {
  const {itemTotals, correctTotals} = sumFieldCounts(scoreUnits);
  return PARSED_FIELD_NAMES.map((_, fieldIndex) =>
    divideOrNull(correctTotals[fieldIndex], itemTotals[fieldIndex]),
  );
};

export const summarizeFieldAccuracy = scoreUnits => {
  const {itemTotals, correctTotals} = sumFieldCounts(scoreUnits);
  return Object.fromEntries(
    PARSED_FIELD_NAMES.map((fieldName, fieldIndex) => [
      fieldName,
      {
        correctCount: correctTotals[fieldIndex],
        itemCount: itemTotals[fieldIndex],
        accuracy: divideOrNull(
          correctTotals[fieldIndex],
          itemTotals[fieldIndex],
        ),
      },
    ]),
  );
};

export const computeLibraryScore = scoreUnits =>
  summarizeDefinedMean(listFieldAccuracies(scoreUnits)).value;

const getSortKey = scoreUnit => scoreUnit.sortKey;

const getStatistic = fieldName => {
  if (fieldName === undefined) {
    return computeLibraryScore;
  }
  const fieldIndex = PARSED_FIELD_NAMES.indexOf(fieldName);
  return scoreUnits => listFieldAccuracies(scoreUnits)[fieldIndex];
};

const keepFieldUnits = (scoreUnits, fieldName) => {
  if (fieldName === undefined) {
    return scoreUnits;
  }
  const fieldIndex = PARSED_FIELD_NAMES.indexOf(fieldName);
  return scoreUnits.filter(scoreUnit => scoreUnit.itemCounts[fieldIndex] > 0);
};

export const resampleLibraryScore = scoreUnits =>
  resampleStatistic({
    units: scoreUnits,
    sortKey: getSortKey,
    statistic: getStatistic(),
    seed: RESAMPLE_SEED,
    drawCount: RESAMPLE_DRAW_COUNT,
  });

export const compareLibraries = ({unitsA, unitsB, fieldName}) => {
  const fieldUnitsA = keepFieldUnits(unitsA, fieldName);
  if (fieldUnitsA.length === 0) {
    return null;
  }
  return comparePaired({
    unitsA: fieldUnitsA,
    unitsB: keepFieldUnits(unitsB, fieldName),
    sortKey: getSortKey,
    statistic: getStatistic(fieldName),
    seed: RESAMPLE_SEED,
    drawCount: RESAMPLE_DRAW_COUNT,
  });
};

export const listSharedExternalDatasets = (libraryA, libraryB) =>
  EXTERNAL_DATASETS.filter(
    datasetName =>
      isNameEligible({library: libraryA, datasetName}) &&
      isNameEligible({library: libraryB, datasetName}),
  );

const EDITION_FIELD_INDEX = PARSED_FIELD_NAMES.indexOf('releaseEdition');

const withoutEditionItem = fieldCounts =>
  fieldCounts.map((fieldCount, fieldIndex) =>
    fieldIndex === EDITION_FIELD_INDEX ? 0 : fieldCount,
  );

const hasItems = scoreUnit =>
  scoreUnit.itemCounts.some(itemCount => itemCount > 0);

export const mergeScopeUnits = scoreUnits => {
  const mergedUnitByKey = new Map();
  for (const scoreUnit of scoreUnits) {
    const mergedUnit = mergedUnitByKey.get(scoreUnit.sortKey);
    mergedUnitByKey.set(
      scoreUnit.sortKey,
      mergedUnit === undefined
        ? scoreUnit
        : {
            sortKey: scoreUnit.sortKey,
            itemCounts: zipWith(
              mergedUnit.itemCounts,
              scoreUnit.itemCounts,
              add,
            ),
            correctCounts: zipWith(
              mergedUnit.correctCounts,
              scoreUnit.correctCounts,
              add,
            ),
            hasDroppedEdition:
              mergedUnit.hasDroppedEdition || scoreUnit.hasDroppedEdition,
          },
    );
  }
  return [...mergedUnitByKey.values()]
    .map(scoreUnit =>
      scoreUnit.hasDroppedEdition
        ? {
            ...scoreUnit,
            itemCounts: withoutEditionItem(scoreUnit.itemCounts),
            correctCounts: withoutEditionItem(scoreUnit.correctCounts),
          }
        : scoreUnit,
    )
    .filter(hasItems);
};

const collectScopeUnits = (scoreUnitsByLibrary, library, datasetNames) =>
  mergeScopeUnits(
    datasetNames.flatMap(
      datasetName => scoreUnitsByLibrary[library][datasetName],
    ),
  );

const compareInScope = ({
  scoreUnitsByLibrary,
  libraryA,
  libraryB,
  datasetNames,
  fieldName,
}) => {
  return compareLibraries({
    unitsA: collectScopeUnits(scoreUnitsByLibrary, libraryA, datasetNames),
    unitsB: collectScopeUnits(scoreUnitsByLibrary, libraryB, datasetNames),
    fieldName,
  });
};

export const listPairComparisons = scoreUnitsByLibrary =>
  listUnorderedPairs(ParserLibrary.values).flatMap(([libraryA, libraryB]) =>
    [[NameDataset.OWN], listSharedExternalDatasets(libraryA, libraryB)].map(
      datasetNames => {
        const comparisonAB = compareInScope({
          scoreUnitsByLibrary,
          libraryA,
          libraryB,
          datasetNames,
        });
        const comparisonBA = compareInScope({
          scoreUnitsByLibrary,
          libraryA: libraryB,
          libraryB: libraryA,
          datasetNames,
        });
        return {
          libraryA,
          libraryB,
          datasetNames,
          difference: comparisonAB?.difference ?? null,
          isAWinner: comparisonAB?.isAWinner ?? false,
          isBWinner: comparisonBA?.isAWinner ?? false,
        };
      },
    ),
  );

const isBeatenBy = ({
  scoreUnitsByLibrary,
  winner,
  loser,
  datasetNames,
  fieldName,
}) =>
  compareInScope({
    scoreUnitsByLibrary,
    libraryA: winner,
    libraryB: loser,
    datasetNames,
    fieldName,
  })?.isAWinner ?? false;

export const decideParser = ({scoreUnitsByLibrary}) => {
  const ownScoreByLibrary = new Map(
    JAVASCRIPT_LIBRARIES.map(library => [
      library,
      normalizeScore(
        computeLibraryScore(scoreUnitsByLibrary[library][NameDataset.OWN]),
      ),
    ]),
  );
  const [bestLibrary] = JAVASCRIPT_LIBRARIES.toSorted(
    (first, second) =>
      ownScoreByLibrary.get(second) - ownScoreByLibrary.get(first),
  );
  const carriedLibraries = [
    bestLibrary,
    ...JAVASCRIPT_LIBRARIES.filter(
      library =>
        library !== bestLibrary &&
        !isBeatenBy({
          scoreUnitsByLibrary,
          winner: bestLibrary,
          loser: library,
          datasetNames: [NameDataset.OWN],
        }),
    ),
  ];
  const isGuessitPorted = carriedLibraries.every(
    library =>
      isBeatenBy({
        scoreUnitsByLibrary,
        winner: ParserLibrary.GUESSIT,
        loser: library,
        datasetNames: [NameDataset.OWN],
      }) &&
      !isBeatenBy({
        scoreUnitsByLibrary,
        winner: library,
        loser: ParserLibrary.GUESSIT,
        datasetNames: listSharedExternalDatasets(
          library,
          ParserLibrary.GUESSIT,
        ),
      }),
  );
  const fieldFlags = isGuessitPorted
    ? carriedLibraries.flatMap(library =>
        SEASON_EPISODE_FIELD_NAMES.filter(fieldName =>
          isBeatenBy({
            scoreUnitsByLibrary,
            winner: library,
            loser: ParserLibrary.GUESSIT,
            datasetNames: [NameDataset.OWN],
            fieldName,
          }),
        ).map(fieldName => ({library, fieldName})),
      )
    : [];
  return {
    ownScoreByLibrary: Object.fromEntries(ownScoreByLibrary),
    bestLibrary,
    carriedLibraries,
    isGuessitPorted,
    fieldFlags,
    decisionLine: isGuessitPorted
      ? PORT_DECISION_LINE
      : `Decision: use ${ParserLibrary.label(bestLibrary)}`,
  };
};
