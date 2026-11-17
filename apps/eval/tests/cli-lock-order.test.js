import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {assertMetricsLock, MetricsLockError} from '../src/metrics-lock.js';
import {runEvalCli} from '../src/cli.js';
import {ATLAS_FIXTURE_ROOT} from './support/atlas-fixture.js';

vi.mock('node:fs/promises', async importOriginal => {
  const original = await importOriginal();
  return {...original, readFile: vi.fn(original.readFile)};
});

vi.mock('../src/metrics-lock.js', async importOriginal => {
  const original = await importOriginal();
  return {
    ...original,
    assertMetricsLock: vi.fn(async () => {
      throw new original.MetricsLockError();
    }),
  };
});

const EVAL_ROOT = join(import.meta.dirname, '..');
const MISSING_ATLAS_ROOT = join(
  EVAL_ROOT,
  'tests',
  'fixtures',
  'no-such-atlas',
);

const readPathsUnder = rootPath =>
  vi
    .mocked(readFile)
    .mock.calls.map(([filePath]) => String(filePath))
    .filter(filePath => filePath.startsWith(rootPath));

describe('runEvalCli metrics lock', () => {
  afterEach(() => {
    vi.mocked(assertMetricsLock).mockClear();
    vi.mocked(readFile).mockClear();
  });

  it('checks the metrics lock before it reads the corpus', async () => {
    await expect(
      runEvalCli({
        argv: ['inspect', '--atlas', MISSING_ATLAS_ROOT],
        writeLine: () => {},
      }),
    ).rejects.toBeInstanceOf(MetricsLockError);
  });

  it('reads no corpus file before the lock check settles', async () => {
    let readsBeforeSettle = null;
    vi.mocked(assertMetricsLock).mockImplementationOnce(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
      readsBeforeSettle = readPathsUnder(ATLAS_FIXTURE_ROOT);
      throw new MetricsLockError();
    });
    await expect(
      runEvalCli({
        argv: ['inspect', '--atlas', ATLAS_FIXTURE_ROOT],
        writeLine: () => {},
      }),
    ).rejects.toBeInstanceOf(MetricsLockError);
    expect(readsBeforeSettle).toEqual([]);
    expect(readPathsUnder(ATLAS_FIXTURE_ROOT)).toEqual([]);
  });

  it('checks the committed metrics pair of the eval app', async () => {
    await runEvalCli({
      argv: ['inspect', '--atlas', MISSING_ATLAS_ROOT],
      writeLine: () => {},
    }).catch(() => {});
    expect(assertMetricsLock).toHaveBeenCalledWith({
      metricsPath: join(EVAL_ROOT, 'metrics.md'),
      lockPath: join(EVAL_ROOT, 'metrics.lock'),
    });
  });
});
