import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {mapValues, uniq} from 'es-toolkit';
import {sha256} from 'melperjs/node';
import {NameDataset, ParserLibrary} from '../constants/parser-library.js';
import {readJsonFile} from '../json-file.js';
import {EVAL_APP_ROOT} from '../eval-paths.js';
import {parseWithGuessit} from './adapters/guessit.js';
import {parseWithParsium} from './adapters/parsium.js';
import {parseWithReleaseParser} from './adapters/release-parser.js';
import {parseWithVideoFilenameParser} from './adapters/video-filename-parser.js';
import {readExternalNameCases} from './datasets/external-names.js';
import {hasExpectedFields} from './datasets/name-cases.js';
import {readOwnNameSources, readOwnNames} from './datasets/own-names.js';
import {isNameEligible} from './name-eligibility.js';
import {PARSED_FIELD_NAMES} from './normalize-fields.js';
import {
  buildPendingItems,
  findOwnItems,
  parseParserLabels,
  resolveOwnTruth,
} from './own-labels.js';
import {
  buildScoreUnits,
  decideParser,
  listPairComparisons,
  mergeScopeUnits,
  resampleLibraryScore,
  summarizeFieldAccuracy,
} from './score-libraries.js';

export const GUESSIT_VERSION = '4.5.1';

const JAVASCRIPT_PARSERS = {
  [ParserLibrary.RELEASE_PARSER]: parseWithReleaseParser,
  [ParserLibrary.VIDEO_FILENAME_PARSER]: parseWithVideoFilenameParser,
  [ParserLibrary.PARSIUM]: parseWithParsium,
};

export class GuessitOutputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GuessitOutputError';
  }
}

export const parseGuessitOutput = (guessitText, releaseNames) => {
  let guessitOutput;
  try {
    guessitOutput = JSON.parse(guessitText);
  } catch {
    throw new GuessitOutputError('The guessit output is not valid JSON.');
  }
  if (guessitOutput?.guessitVersion !== GUESSIT_VERSION) {
    throw new GuessitOutputError(
      `The guessit output must come from guessit ${GUESSIT_VERSION}.`,
    );
  }
  const missingNameCount = releaseNames.filter(
    releaseName =>
      !Object.hasOwn(guessitOutput.parsedByName ?? {}, releaseName),
  ).length;
  if (missingNameCount > 0) {
    throw new GuessitOutputError(
      `The guessit output misses ${missingNameCount} release names.`,
    );
  }
  return guessitOutput;
};

const getParser = (library, guessitOutput) =>
  library === ParserLibrary.GUESSIT
    ? releaseName => parseWithGuessit(releaseName, guessitOutput)
    : JAVASCRIPT_PARSERS[library];

export const readLibraryReadings = ({releaseNames, guessitOutput}) =>
  new Map(
    ParserLibrary.values.map(library => {
      const parseName = getParser(library, guessitOutput);
      return [
        library,
        new Map(
          releaseNames.map(releaseName => [
            releaseName,
            parseName(releaseName),
          ]),
        ),
      ];
    }),
  );

const readNameSources = async ({atlasRoot, referenceRoot}) => {
  const [ownNameSources, {nameCasesByDataset, droppedEditionCountByDataset}] =
    await Promise.all([
      readOwnNameSources({atlasRoot}),
      readExternalNameCases({referenceRoot}),
    ]);
  return {
    ownNameSources,
    ownNames: ownNameSources.ownNames,
    externalNameCases: nameCasesByDataset,
    droppedEditionCountByDataset,
  };
};

const listAssertingNames = nameCases =>
  nameCases.filter(hasExpectedFields).map(nameCase => nameCase.releaseName);

const listAllNames = ({ownNames, externalNameCases}) =>
  uniq([
    ...ownNames,
    ...Object.values(externalNameCases).flatMap(listAssertingNames),
  ]).toSorted();

const countNamesByDataset = ({ownNames, externalNameCases}) => ({
  [NameDataset.OWN]: ownNames.length,
  ...mapValues(
    externalNameCases,
    nameCases => listAssertingNames(nameCases).length,
  ),
});

export const exportParserNames = async ({atlasRoot, referenceRoot}) => {
  const nameSources = await readNameSources({atlasRoot, referenceRoot});
  return {
    releaseNames: listAllNames(nameSources),
    nameCountByDataset: countNamesByDataset(nameSources),
  };
};

export const exportPendingItems = async ({atlasRoot, guessitOutput}) => {
  const ownNames = await readOwnNames({atlasRoot});
  const ownItems = findOwnItems({
    releaseNames: ownNames,
    readingsByLibrary: readLibraryReadings({
      releaseNames: ownNames,
      guessitOutput,
    }),
  });
  return {
    pendingItems: buildPendingItems(ownItems),
    ownNameCount: ownNames.length,
    ownItemCount: ownItems.length,
  };
};

const readLibraryVersions = async () =>
  Object.fromEntries(
    await Promise.all(
      Object.keys(JAVASCRIPT_PARSERS).map(async library => {
        const packageName = ParserLibrary.label(library);
        const {version} = await readJsonFile(
          join(EVAL_APP_ROOT, 'node_modules', packageName, 'package.json'),
        );
        return [packageName, version];
      }),
    ),
  );

const scoreLibraries = ({nameCasesByDataset, readingsByLibrary}) =>
  Object.fromEntries(
    ParserLibrary.values.map(library => [
      library,
      Object.fromEntries(
        Object.entries(nameCasesByDataset)
          .filter(([datasetName]) => isNameEligible({library, datasetName}))
          .map(([datasetName, nameCases]) => [
            datasetName,
            buildScoreUnits({
              nameCases,
              readingByName: readingsByLibrary.get(library),
            }),
          ]),
      ),
    ]),
  );

const summarizeLibraryResults = scoreUnitsByLibrary =>
  Object.entries(scoreUnitsByLibrary).flatMap(([library, unitsByDataset]) =>
    NameDataset.values
      .filter(datasetName => Object.hasOwn(unitsByDataset, datasetName))
      .map(datasetName => {
        const datasetUnits = mergeScopeUnits(unitsByDataset[datasetName]);
        const fieldAccuracy = summarizeFieldAccuracy(datasetUnits);
        return {
          library,
          datasetName,
          fieldAccuracy,
          emptyFieldNames: PARSED_FIELD_NAMES.filter(
            fieldName => fieldAccuracy[fieldName].itemCount === 0,
          ),
          libraryScore: resampleLibraryScore(datasetUnits),
        };
      }),
  );

export const runParserTest = async ({
  atlasRoot,
  parserLabelsPath,
  guessitOutputPath,
  referenceRoot,
  referenceCommits,
}) => {
  const [nameSources, labelsText, guessitText, libraryVersions] =
    await Promise.all([
      readNameSources({atlasRoot, referenceRoot}),
      readFile(parserLabelsPath, 'utf8'),
      readFile(guessitOutputPath, 'utf8'),
      readLibraryVersions(),
    ]);
  const releaseNames = listAllNames(nameSources);
  const guessitOutput = parseGuessitOutput(guessitText, releaseNames);
  const readingsByLibrary = readLibraryReadings({releaseNames, guessitOutput});
  const ownTruth = resolveOwnTruth({
    ownItems: findOwnItems({
      releaseNames: nameSources.ownNames,
      readingsByLibrary,
    }),
    labels: parseParserLabels(labelsText),
  });
  const scoreUnitsByLibrary = scoreLibraries({
    nameCasesByDataset: {
      [NameDataset.OWN]: ownTruth.nameCases,
      ...nameSources.externalNameCases,
    },
    readingsByLibrary,
  });
  return {
    ownNameCount: nameSources.ownNames.length,
    ownNameCountBySource: {
      subtitleReleaseNames: nameSources.ownNameSources.subtitleReleaseNameCount,
      videoFilenames: nameSources.ownNameSources.videoFilenameCount,
    },
    nameCountByDataset: countNamesByDataset(nameSources),
    droppedEditionCountByDataset: nameSources.droppedEditionCountByDataset,
    ownTruth: {
      pendingItemCount: ownTruth.pendingItemCount,
      sampleSize: ownTruth.sampleSize,
      sampleErrorCount: ownTruth.sampleErrorCount,
      ignoredLabelCount: ownTruth.ignoredLabelCount,
    },
    labelsSha256: sha256(labelsText),
    guessitVersion: guessitOutput.guessitVersion,
    libraryVersions,
    referenceCommits,
    libraryResults: summarizeLibraryResults(scoreUnitsByLibrary),
    pairComparisons: listPairComparisons(scoreUnitsByLibrary),
    decision: decideParser({scoreUnitsByLibrary}),
  };
};
