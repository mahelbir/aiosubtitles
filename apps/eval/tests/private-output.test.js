import {execFileSync} from 'node:child_process';
import {
  access,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import {devNull, tmpdir} from 'node:os';
import {join} from 'node:path';
import {omit} from 'es-toolkit';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {runExportDisagreements} from '../src/commands/export-disagreements.js';
import {runExportNames} from '../src/commands/export-names.js';
import {
  assertPrivateOutputPath,
  PrivateOutputPathError,
} from '../src/private-output.js';
import {ATLAS_FIXTURE_ROOT} from './support/atlas-fixture.js';

const GIT_SAFE_ENV = omit(process.env, [
  'GIT_DIR',
  'GIT_INDEX_FILE',
  'GIT_WORK_TREE',
]);

const runGit = (repositoryRoot, gitArgs) =>
  execFileSync('git', ['-c', `core.hooksPath=${devNull}`, ...gitArgs], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: GIT_SAFE_ENV,
  }).trim();

describe('assertPrivateOutputPath', () => {
  let workRoot;
  let repositoryRoot;

  beforeAll(async () => {
    workRoot = await realpath(await mkdtemp(join(tmpdir(), 'eval-private-')));
    repositoryRoot = join(workRoot, 'repository');
    await mkdir(join(repositoryRoot, 'docs'), {recursive: true});
    await writeFile(join(repositoryRoot, '.gitignore'), 'private/\n');
    runGit(repositoryRoot, ['init', '--quiet']);
  });

  afterAll(async () => {
    await rm(workRoot, {recursive: true, force: true});
  });

  it('accepts a path outside every git work tree', () => {
    expect(() =>
      assertPrivateOutputPath(join(workRoot, 'outside', 'names.json')),
    ).not.toThrow();
  });

  it('accepts an ignored path inside a work tree, even one not created yet', () => {
    expect(() =>
      assertPrivateOutputPath(
        join(repositoryRoot, 'private', 'deep', 'n.json'),
      ),
    ).not.toThrow();
  });

  it('refuses a path git would track', () => {
    expect(() =>
      assertPrivateOutputPath(join(repositoryRoot, 'docs', 'names.json')),
    ).toThrow(PrivateOutputPathError);
  });

  it('makes export-names refuse a tracked path and write nothing', async () => {
    const namesPath = join(repositoryRoot, 'docs', 'parser-names.json');
    await expect(
      runExportNames({
        atlasRoot: ATLAS_FIXTURE_ROOT,
        commandOptions: {'names-output': namesPath},
        writeLine: () => {},
        referenceRoot: join(import.meta.dirname, 'fixtures', 'reference-mini'),
      }),
    ).rejects.toBeInstanceOf(PrivateOutputPathError);
    await expect(access(namesPath)).rejects.toThrow();
  });

  it('makes export-disagreements refuse a tracked path before reading anything', async () => {
    await expect(
      runExportDisagreements({
        atlasRoot: ATLAS_FIXTURE_ROOT,
        commandOptions: {
          'guessit-output': join(workRoot, 'missing-guessit.json'),
          'pending-output': join(repositoryRoot, 'docs', 'pending.json'),
        },
        writeLine: () => {},
      }),
    ).rejects.toBeInstanceOf(PrivateOutputPathError);
  });
});
