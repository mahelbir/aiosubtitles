import {readFile} from 'node:fs/promises';
import {sha256} from 'melperjs/node';
import {atlasPaths} from '../corpus/atlas-paths.js';
import {
  EVAL_APP_ROOT,
  EVAL_SOURCE_TREE_PATH,
  METRICS_PATH,
  SUBTITLE_CORE_SOURCE_TREE_PATH,
} from '../eval-paths.js';
import {runGit} from '../git-command.js';
import {readJsonFile} from '../json-file.js';
import {computeMetricsDigest} from '../metrics-lock.js';

const SOURCE_TREE_PATHS = [
  EVAL_SOURCE_TREE_PATH,
  SUBTITLE_CORE_SOURCE_TREE_PATH,
];

const readCommittedTree = (repositoryRoot, treePath) =>
  runGit(repositoryRoot, ['rev-parse', `HEAD:${treePath}`]);

export const computeCorpusFingerprint = async ({atlasRoot, caseCodes}) => {
  const [indexBytes, metricsBytes, ...caseBytes] = await Promise.all([
    readFile(atlasPaths.corpusIndex(atlasRoot)),
    readFile(METRICS_PATH),
    ...caseCodes.map(caseCode =>
      readFile(atlasPaths.caseJson(atlasRoot, caseCode)),
    ),
  ]);
  return {
    indexSha256: sha256(indexBytes),
    caseSha256ByCode: Object.fromEntries(
      caseCodes.map((caseCode, caseIndex) => [
        caseCode,
        sha256(caseBytes[caseIndex]),
      ]),
    ),
    metricsSha256: computeMetricsDigest(metricsBytes),
  };
};

export const getCodeFingerprint = ({repositoryRoot = EVAL_APP_ROOT} = {}) => ({
  evalSourceTree: readCommittedTree(repositoryRoot, EVAL_SOURCE_TREE_PATH),
  subtitleCoreSourceTree: readCommittedTree(
    repositoryRoot,
    SUBTITLE_CORE_SOURCE_TREE_PATH,
  ),
  hasUncommittedChanges:
    runGit(repositoryRoot, [
      'status',
      '--porcelain',
      '--untracked-files=all',
      '--',
      ...SOURCE_TREE_PATHS.map(treePath => `:(top)${treePath}`),
    ]) !== '',
});

export const readRunFingerprint = async atlasRoot => {
  const corpusIndex = await readJsonFile(atlasPaths.corpusIndex(atlasRoot));
  return {
    corpusFingerprint: await computeCorpusFingerprint({
      atlasRoot,
      caseCodes: corpusIndex.cases.map(({code}) => code),
    }),
    codeFingerprint: getCodeFingerprint(),
  };
};
