import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {computeMetricsDigest} from '../src/metrics-lock.js';
import {
  computeCorpusFingerprint,
  getCodeFingerprint,
} from '../src/report/fingerprint.js';
import {ATLAS_FIXTURE_ROOT} from './support/atlas-fixture.js';

const EVAL_ROOT = join(import.meta.dirname, '..');

const sha256File = async filePath =>
  createHash('sha256')
    .update(await readFile(filePath))
    .digest('hex');

const corpusFile = (...segments) =>
  join(ATLAS_FIXTURE_ROOT, 'eval', 'corpus', ...segments);

const gitTree = treePath =>
  execFileSync('git', ['rev-parse', `HEAD:${treePath}`], {
    cwd: EVAL_ROOT,
    encoding: 'utf8',
  }).trim();

describe('computeCorpusFingerprint', () => {
  it('hashes index.json, each case.json read and the metrics file', async () => {
    expect(
      await computeCorpusFingerprint({
        atlasRoot: ATLAS_FIXTURE_ROOT,
        caseCodes: ['V90', 'V92'],
      }),
    ).toEqual({
      indexSha256: await sha256File(corpusFile('index.json')),
      caseSha256ByCode: {
        V90: await sha256File(corpusFile('V90', 'case.json')),
        V92: await sha256File(corpusFile('V92', 'case.json')),
      },
      metricsSha256: computeMetricsDigest(
        await readFile(join(EVAL_ROOT, 'metrics.md')),
      ),
    });
  });

  it('hashes only the cases it is given', async () => {
    const fingerprint = await computeCorpusFingerprint({
      atlasRoot: ATLAS_FIXTURE_ROOT,
      caseCodes: ['V92'],
    });
    expect(Object.keys(fingerprint.caseSha256ByCode)).toEqual(['V92']);
  });
});

describe('getCodeFingerprint', () => {
  it('records the committed source trees instead of a commit hash', () => {
    expect(getCodeFingerprint()).toEqual({
      evalSourceTree: gitTree('apps/eval/src'),
      subtitleCoreSourceTree: gitTree('packages/subtitle-core/src'),
    });
  });
});
