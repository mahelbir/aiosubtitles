import {execFile} from 'node:child_process';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {describe, expect, it} from 'vitest';
import {EVAL_COMMANDS, EvalUsageError} from '../src/cli-args.js';
import {runEvalCli} from '../src/cli.js';
import {
  FIXTURE_PRIVATE_VALUES,
  ATLAS_FIXTURE_ROOT,
} from './support/atlas-fixture.js';

const CLI_PATH = join(import.meta.dirname, '..', 'src', 'cli.js');
const runNode = promisify(execFile);

const inspectFixture = async () => {
  const lines = [];
  await runEvalCli({
    argv: ['inspect', '--atlas', ATLAS_FIXTURE_ROOT],
    writeLine: line => lines.push(line),
  });
  return lines.join('\n');
};

describe('runEvalCli inspect', () => {
  it('prints the case and candidate counts', async () => {
    const output = await inspectFixture();
    expect(output).toMatch(/^cases: 2$/m);
    expect(output).toMatch(/^candidates: 9$/m);
  });

  it('counts content groups per video over valid pool rows', async () => {
    expect(await inspectFixture()).toMatch(/^content groups: 3$/m);
  });

  it('counts one class per content group, found anywhere in the video', async () => {
    const output = await inspectFixture();
    expect(output).toMatch(/\bfits 1\b/);
    expect(output).toMatch(/\bwrong 2\b/);
  });

  it('lists every class in metrics order, zeros and unclassed groups included', async () => {
    expect(await inspectFixture()).toMatch(
      /^classes: fits 1, constant 0, drift 0, steps 0, recap 0, wrong 2, unclassed 0$/m,
    );
  });

  it('prints no private name, hash or url', async () => {
    const output = await inspectFixture();
    expect(output).toMatch(/^cases: 2$/m);
    for (const privateValue of FIXTURE_PRIVATE_VALUES) {
      expect(output).not.toContain(privateValue);
    }
    expect(output).not.toMatch(/[a-z]+:\/\/|auth=/i);
  });

  it('rejects a relative Atlas root with a usage error', async () => {
    await expect(
      runEvalCli({
        argv: ['inspect', '--atlas', 'rel/path'],
        writeLine: () => {},
      }),
    ).rejects.toBeInstanceOf(EvalUsageError);
  });

  it('rejects an unknown command with a usage error', async () => {
    await expect(
      runEvalCli({
        argv: ['no-such-command', '--atlas', ATLAS_FIXTURE_ROOT],
        writeLine: () => {},
      }),
    ).rejects.toBeInstanceOf(EvalUsageError);
  });
});

describe('EVAL_COMMANDS', () => {
  it('pairs every command with its options and its runner', () => {
    for (const evalCommand of Object.values(EVAL_COMMANDS)) {
      expect(Object.keys(evalCommand).sort()).toEqual(['options', 'run']);
      expect(evalCommand.run).toBeTypeOf('function');
    }
  });
});

describe('cli.js process', () => {
  it('runs inspect and exits 0', async () => {
    const {stdout} = await runNode(process.execPath, [
      CLI_PATH,
      'inspect',
      '--atlas',
      ATLAS_FIXTURE_ROOT,
    ]);
    expect(stdout).toMatch(/^cases: 2$/m);
    expect(stdout).toMatch(/^content groups: 3$/m);
  });

  it('exits non-zero with the usage message for a relative root', async () => {
    const failure = await runNode(process.execPath, [
      CLI_PATH,
      'inspect',
      '--atlas',
      'rel/path',
    ]).then(
      () => null,
      error => error,
    );
    expect(failure?.code).toBeGreaterThan(0);
    expect(failure.stderr).toContain('--atlas must be an absolute path.');
  });
});
