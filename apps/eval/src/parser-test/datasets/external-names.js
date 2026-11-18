import {realpathSync} from 'node:fs';
import {readdir, readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {mapValues} from 'es-toolkit';
import {getMainCheckoutPath, runGit} from '@repo/tooling/git.js';
import {EVAL_APP_ROOT} from '../../eval-paths.js';
import {parseGuessitYaml} from './guessit-yaml.js';
import {countDroppedEditionNames, mergeNameCases} from './name-cases.js';
import {listGoPttCases, listPttCases} from './ptt-cases.js';
import {listSonarrCases} from './sonarr-cases.js';

export const REFERENCE_PROJECT_NAMES = ['guessit', 'Sonarr', 'PTT', 'go-ptt'];

const REFERENCE_FOLDER_NAME = '.reference';
const GUESSIT_TEST_PATH = ['guessit', 'guessit', 'test'];
const GUESSIT_PROTOCOL_FILE_NAMES = [
  'movies.yml',
  'episodes.yml',
  'various.yml',
];
const SONARR_TEST_PATH = ['Sonarr', 'src', 'NzbDrone.Core.Test', 'ParserTests'];
const PTT_TEST_PATH = ['PTT', 'tests'];
const GO_PTT_PATH = ['go-ptt'];
const SONARR_FILE_PATTERN = /\.cs$/;
const PTT_FILE_PATTERN = /^test_.*\.py$/;
const GO_PTT_FILE_PATTERN = /_test\.go$/;

export class ReferenceRootError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ReferenceRootError';
  }
}

const readMatchingFiles = async (folderPath, fileNamePattern) => {
  const directoryEntries = await readdir(folderPath, {withFileTypes: true});
  const fileNames = directoryEntries
    .filter(
      directoryEntry =>
        directoryEntry.isFile() && fileNamePattern.test(directoryEntry.name),
    )
    .map(directoryEntry => directoryEntry.name)
    .toSorted();
  return Promise.all(
    fileNames.map(fileName => readFile(join(folderPath, fileName), 'utf8')),
  );
};

const readGuessitCases = async referenceRoot => {
  const yamlTexts = await Promise.all(
    GUESSIT_PROTOCOL_FILE_NAMES.map(fileName =>
      readFile(join(referenceRoot, ...GUESSIT_TEST_PATH, fileName), 'utf8'),
    ),
  );
  return mergeNameCases(yamlTexts.flatMap(parseGuessitYaml));
};

const readSonarrCases = async referenceRoot =>
  mergeNameCases(
    (
      await readMatchingFiles(
        join(referenceRoot, ...SONARR_TEST_PATH),
        SONARR_FILE_PATTERN,
      )
    ).flatMap(listSonarrCases),
  );

const readPttFamilyCases = async referenceRoot => {
  const [pyTexts, goTexts] = await Promise.all([
    readMatchingFiles(join(referenceRoot, ...PTT_TEST_PATH), PTT_FILE_PATTERN),
    readMatchingFiles(join(referenceRoot, ...GO_PTT_PATH), GO_PTT_FILE_PATTERN),
  ]);
  return mergeNameCases([
    ...pyTexts.flatMap(listPttCases),
    ...goTexts.flatMap(listGoPttCases),
  ]);
};

export const readExternalNameCases = async ({referenceRoot}) => {
  const [guessit, sonarr, ptt] = await Promise.all([
    readGuessitCases(referenceRoot),
    readSonarrCases(referenceRoot),
    readPttFamilyCases(referenceRoot),
  ]);
  const nameCasesByDataset = {guessit, sonarr, ptt};
  return {
    nameCasesByDataset,
    droppedEditionCountByDataset: mapValues(
      nameCasesByDataset,
      countDroppedEditionNames,
    ),
  };
};

const readRepositoryRoot = projectRoot => {
  try {
    return realpathSync(runGit(projectRoot, ['rev-parse', '--show-toplevel']));
  } catch {
    throw new ReferenceRootError(
      'A reference project is not a git repository.',
    );
  }
};

const readProjectCommit = projectRoot => {
  if (readRepositoryRoot(projectRoot) !== realpathSync(projectRoot)) {
    throw new ReferenceRootError(
      'A reference project is not its own git repository.',
    );
  }
  if (runGit(projectRoot, ['status', '--porcelain']) !== '') {
    throw new ReferenceRootError(
      'A reference project has uncommitted changes.',
    );
  }
  return runGit(projectRoot, ['rev-parse', 'HEAD']);
};

export const readReferenceCommits = ({referenceRoot}) =>
  Object.fromEntries(
    REFERENCE_PROJECT_NAMES.map(projectName => [
      projectName,
      readProjectCommit(join(referenceRoot, projectName)),
    ]),
  );

export const resolveReferenceRoot = ({startDirectory = EVAL_APP_ROOT} = {}) => {
  try {
    return realpathSync(
      join(getMainCheckoutPath(startDirectory), REFERENCE_FOLDER_NAME),
    );
  } catch {
    throw new ReferenceRootError(
      'The .reference folder next to the main checkout is missing.',
    );
  }
};
