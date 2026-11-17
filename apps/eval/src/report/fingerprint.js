import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {sha256} from 'melperjs/node';
import {atlasPaths} from '../corpus/atlas-paths.js';
import {
  EVAL_APP_ROOT,
  EVAL_SOURCE_TREE_PATH,
  METRICS_PATH,
  SUBTITLE_CORE_SOURCE_TREE_PATH,
} from '../eval-paths.js';
import {computeMetricsDigest} from '../metrics-lock.js';

const readCommittedTree = treePath =>
  execFileSync('git', ['rev-parse', `HEAD:${treePath}`], {
    cwd: EVAL_APP_ROOT,
    encoding: 'utf8',
  }).trim();

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

export const getCodeFingerprint = () => ({
  evalSourceTree: readCommittedTree(EVAL_SOURCE_TREE_PATH),
  subtitleCoreSourceTree: readCommittedTree(SUBTITLE_CORE_SOURCE_TREE_PATH),
});
