import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {devNull, tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {omit} from 'es-toolkit';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
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

const SOURCE_TREE_PATHS = ['apps/eval/src', 'packages/subtitle-core/src'];

const GIT_SAFE_ENV = omit(process.env, [
  'GIT_DIR',
  'GIT_INDEX_FILE',
  'GIT_WORK_TREE',
]);

const runGit = (repositoryRoot, gitArgs) =>
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      '-c',
      'commit.gpgsign=false',
      '-c',
      `core.hooksPath=${devNull}`,
      ...gitArgs,
    ],
    {cwd: repositoryRoot, encoding: 'utf8', env: GIT_SAFE_ENV},
  ).trim();

const hasLiveUncommittedChanges = () =>
  runGit(EVAL_ROOT, [
    'status',
    '--porcelain',
    '--',
    ...SOURCE_TREE_PATHS.map(treePath => `:(top)${treePath}`),
  ]) !== '';

const writeRepositoryFile = async (repositoryRoot, relativePath, fileText) => {
  const filePath = join(repositoryRoot, relativePath);
  await mkdir(dirname(filePath), {recursive: true});
  await writeFile(filePath, fileText, 'utf8');
};

const createFixtureRepository = async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'eval-fingerprint-'));
  runGit(repositoryRoot, ['init', '--quiet']);
  await Promise.all([
    writeRepositoryFile(repositoryRoot, 'apps/eval/src/cli.js', 'export {};\n'),
    writeRepositoryFile(
      repositoryRoot,
      'packages/subtitle-core/src/index.js',
      'export {};\n',
    ),
    writeRepositoryFile(repositoryRoot, 'docs/notes.md', '# Notes\n'),
  ]);
  runGit(repositoryRoot, ['add', '--all']);
  runGit(repositoryRoot, ['commit', '--quiet', '--message', 'fixture']);
  return repositoryRoot;
};

const fixtureTree = (repositoryRoot, treePath) =>
  runGit(repositoryRoot, ['rev-parse', `HEAD:${treePath}`]);

describe('getCodeFingerprint', () => {
  let repositoryRoot;

  beforeEach(async () => {
    repositoryRoot = await createFixtureRepository();
  });

  afterEach(async () => {
    await rm(repositoryRoot, {recursive: true, force: true});
  });

  it('records the committed source trees instead of a commit hash', () => {
    expect(getCodeFingerprint()).toEqual({
      evalSourceTree: gitTree('apps/eval/src'),
      subtitleCoreSourceTree: gitTree('packages/subtitle-core/src'),
      hasUncommittedChanges: hasLiveUncommittedChanges(),
    });
  });

  it('marks a clean repository as clean', () => {
    expect(getCodeFingerprint({repositoryRoot})).toEqual({
      evalSourceTree: fixtureTree(repositoryRoot, 'apps/eval/src'),
      subtitleCoreSourceTree: fixtureTree(
        repositoryRoot,
        'packages/subtitle-core/src',
      ),
      hasUncommittedChanges: false,
    });
  });

  it('marks an edited eval source file as an uncommitted change', async () => {
    await writeRepositoryFile(
      repositoryRoot,
      'apps/eval/src/cli.js',
      'export const isEdited = true;\n',
    );
    expect(getCodeFingerprint({repositoryRoot}).hasUncommittedChanges).toBe(
      true,
    );
  });

  it('marks a new untracked subtitle-core file as an uncommitted change', async () => {
    await writeRepositoryFile(
      repositoryRoot,
      'packages/subtitle-core/src/new-module.js',
      'export {};\n',
    );
    expect(getCodeFingerprint({repositoryRoot}).hasUncommittedChanges).toBe(
      true,
    );
  });

  it('ignores changes outside the two source trees', async () => {
    await writeRepositoryFile(repositoryRoot, 'docs/notes.md', '# Edited\n');
    expect(getCodeFingerprint({repositoryRoot}).hasUncommittedChanges).toBe(
      false,
    );
  });
});
