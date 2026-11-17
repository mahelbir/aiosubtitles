import {cp, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {runEvalCli} from '../src/cli.js';
import {ATLAS_FIXTURE_ROOT} from './support/atlas-fixture.js';

describe('runEvalCli inspect on a group without a class', () => {
  let atlasRoot;

  beforeEach(async () => {
    atlasRoot = await mkdtemp(join(tmpdir(), 'eval-atlas-'));
    await cp(ATLAS_FIXTURE_ROOT, atlasRoot, {recursive: true});
  });

  afterEach(async () => {
    await rm(atlasRoot, {recursive: true, force: true});
  });

  it('counts the group as unclassed instead of hiding it', async () => {
    const casePath = join(atlasRoot, 'eval', 'corpus', 'V90', 'case.json');
    const caseJson = JSON.parse(await readFile(casePath, 'utf8'));
    caseJson.candidates.find(
      caseCandidate => caseCandidate.id === 'V90/c3',
    ).expectedClass = null;
    await writeFile(casePath, JSON.stringify(caseJson));
    const lines = [];
    await runEvalCli({
      argv: ['inspect', '--atlas', atlasRoot],
      writeLine: line => lines.push(line),
    });
    expect(lines).toContain(
      'classes: fits 1, constant 0, drift 0, steps 0, recap 0, wrong 1, unclassed 1',
    );
  });
});
