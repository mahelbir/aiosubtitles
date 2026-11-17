import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const LOCK_LINE_PATTERN = /^([0-9a-f]{64}) {2}(\S.*)$/;
const MISMATCH_MESSAGE = 'metrics.md does not match metrics.lock.';

export class MetricsLockError extends Error {
  constructor(message = MISMATCH_MESSAGE, options) {
    super(message, options);
    this.name = 'MetricsLockError';
  }
}

export const computeMetricsDigest = metricsText =>
  createHash('sha256').update(metricsText, 'utf8').digest('hex');

export const readMetricsLock = lockText => {
  const match = LOCK_LINE_PATTERN.exec(lockText.trimEnd());
  if (!match) {
    throw new MetricsLockError('metrics.lock is not a shasum -a 256 line.');
  }
  return {expectedDigest: match[1], metricsFileName: match[2]};
};

export const assertMetricsLock = async ({metricsPath, lockPath}) => {
  let metricsBytes;
  let expectedDigest;
  try {
    const [metricsBuffer, lockText] = await Promise.all([
      readFile(metricsPath),
      readFile(lockPath, 'utf8'),
    ]);
    metricsBytes = metricsBuffer;
    ({expectedDigest} = readMetricsLock(lockText));
  } catch (error) {
    throw new MetricsLockError(MISMATCH_MESSAGE, {cause: error});
  }
  if (computeMetricsDigest(metricsBytes) !== expectedDigest) {
    throw new MetricsLockError();
  }
};
