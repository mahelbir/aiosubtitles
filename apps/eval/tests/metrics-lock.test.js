import {createHash} from 'node:crypto';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {
  assertMetricsLock,
  computeMetricsDigest,
  MetricsLockError,
  readMetricsLock,
} from '../src/metrics-lock.js';

const METRICS_TEXT = '# Metrics v1\n\nStatus: frozen v1. Çığ ölçüsü.\n';
const MISMATCH_MESSAGE = 'metrics.md does not match metrics.lock.';
const HEX_DIGEST = 'ab'.repeat(32);

const sha256Hex = text =>
  createHash('sha256').update(text, 'utf8').digest('hex');

describe('computeMetricsDigest', () => {
  it('returns the SHA-256 hex of an ASCII text', () => {
    expect(computeMetricsDigest('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('hashes the UTF-8 bytes of a non-ASCII text', () => {
    expect(computeMetricsDigest('Çığ')).toBe(
      'f6bcac8e1716305c760c39ee46bc09febde37648f3699e9c5a67b50848d2ab5f',
    );
  });
});

describe('readMetricsLock', () => {
  it('parses the digest and the file name of a shasum line', () => {
    expect(readMetricsLock(`${HEX_DIGEST}  metrics.md\n`)).toEqual({
      expectedDigest: HEX_DIGEST,
      metricsFileName: 'metrics.md',
    });
  });

  it.each([
    ['an empty text', ''],
    ['a short digest', 'abc  metrics.md\n'],
    ['a non-hex digest', `${'zz'.repeat(32)}  metrics.md\n`],
    ['a single-space separator', `${HEX_DIGEST} metrics.md\n`],
    ['a missing file name', `${HEX_DIGEST}  \n`],
    ['a digest only', `${HEX_DIGEST}\n`],
  ])('throws on %s', (_label, lockText) => {
    expect(() => readMetricsLock(lockText)).toThrow();
  });
});

describe('assertMetricsLock', () => {
  let directoryPath;
  let metricsPath;
  let lockPath;

  beforeEach(async () => {
    directoryPath = await mkdtemp(join(tmpdir(), 'metrics-lock-'));
    metricsPath = join(directoryPath, 'metrics.md');
    lockPath = join(directoryPath, 'metrics.lock');
  });

  afterEach(async () => {
    await rm(directoryPath, {recursive: true, force: true});
  });

  const writePair = async (metricsText, lockedText = metricsText) => {
    await writeFile(metricsPath, metricsText, 'utf8');
    await writeFile(lockPath, `${sha256Hex(lockedText)}  metrics.md\n`, 'utf8');
  };

  it('resolves when the metrics file matches its lock', async () => {
    await writePair(METRICS_TEXT);
    await expect(
      assertMetricsLock({metricsPath, lockPath}),
    ).resolves.toBeUndefined();
  });

  it('rejects when one byte of the metrics file changed', async () => {
    const changedText = METRICS_TEXT.replace('v1', 'v2');
    await writePair(changedText, METRICS_TEXT);
    const assertion = assertMetricsLock({metricsPath, lockPath});
    await expect(assertion).rejects.toBeInstanceOf(MetricsLockError);
    await expect(assertion).rejects.toThrow(MISMATCH_MESSAGE);
  });

  it('rejects when the lock file is missing', async () => {
    await writeFile(metricsPath, METRICS_TEXT, 'utf8');
    const assertion = assertMetricsLock({metricsPath, lockPath});
    await expect(assertion).rejects.toBeInstanceOf(MetricsLockError);
    await expect(assertion).rejects.toThrow(MISMATCH_MESSAGE);
  });

  it('rejects when the metrics file is missing', async () => {
    await writeFile(
      lockPath,
      `${sha256Hex(METRICS_TEXT)}  metrics.md\n`,
      'utf8',
    );
    const assertion = assertMetricsLock({metricsPath, lockPath});
    await expect(assertion).rejects.toBeInstanceOf(MetricsLockError);
    await expect(assertion).rejects.toThrow(MISMATCH_MESSAGE);
  });

  it('rejects when the lock file holds a malformed line', async () => {
    await writeFile(metricsPath, METRICS_TEXT, 'utf8');
    await writeFile(
      lockPath,
      `${sha256Hex(METRICS_TEXT)} metrics.md\n`,
      'utf8',
    );
    const assertion = assertMetricsLock({metricsPath, lockPath});
    await expect(assertion).rejects.toBeInstanceOf(MetricsLockError);
    await expect(assertion).rejects.toThrow(MISMATCH_MESSAGE);
  });
});

describe('committed metrics pair', () => {
  it('keeps the frozen metrics file matching its lock', async () => {
    const evalPath = join(import.meta.dirname, '..');
    await expect(
      assertMetricsLock({
        metricsPath: join(evalPath, 'metrics.md'),
        lockPath: join(evalPath, 'metrics.lock'),
      }),
    ).resolves.toBeUndefined();
  });
});
