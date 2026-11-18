import PQueue from 'p-queue';
import {createLogger} from '../logger.js';
import {
  SHUTDOWN_DRAIN_WINDOW_MS,
  SHUTDOWN_SETTLE_WINDOW_MS,
  waitForAbort,
} from '../shutdown-deadline.js';

export const BACKGROUND_QUEUE_SIZE_MAX = 500;

const logger = createLogger('subtitle-background');
const backgroundQueues = new Map();
const droppedJobCounts = new Map();
const waitingJobKeys = new Set();
let isStopped = false;
let jobController = new AbortController();

export function enqueueBackgroundJob({subtitleSource, jobKey, runJob}) {
  if (isStopped || (jobKey && waitingJobKeys.has(jobKey))) {
    return false;
  }
  const backgroundQueue = readBackgroundQueue(subtitleSource);
  if (backgroundQueue.size >= BACKGROUND_QUEUE_SIZE_MAX) {
    const droppedJobCount = (droppedJobCounts.get(subtitleSource) ?? 0) + 1;
    droppedJobCounts.set(subtitleSource, droppedJobCount);
    logger.debug(
      {subtitleSource, droppedJobCount},
      'Background job dropped at the queue cap.',
    );
    return false;
  }
  if (jobKey) {
    waitingJobKeys.add(jobKey);
  }
  backgroundQueue
    .add(() => {
      waitingJobKeys.delete(jobKey);
      return runJob({signal: jobController.signal});
    })
    .catch(error => {
      logger.warn(
        {subtitleSource, errorName: error?.name},
        'Background job failed.',
      );
    });
  return true;
}

export function readBackgroundQueueSizes() {
  return [...backgroundQueues].map(([subtitleSource, backgroundQueue]) => ({
    subtitleSource,
    waitingJobCount: backgroundQueue.size,
    runningJobCount: backgroundQueue.pending,
    droppedJobCount: droppedJobCounts.get(subtitleSource) ?? 0,
  }));
}

export function stopBackgroundWork({signal}) {
  isStopped = true;
  const stoppedController = jobController;
  waitForAbort(signal).then(() => stoppedController.abort());
}

export async function drainBackgroundQueues({signal} = {}) {
  const isDrained = signal
    ? await Promise.race([
        waitForIdleQueues().then(() => true),
        waitForAbort(signal).then(() => false),
      ])
    : await waitWithin(waitForIdleQueues(), SHUTDOWN_DRAIN_WINDOW_MS);
  if (isDrained) {
    return;
  }
  abortBackgroundJobs();
  if (signal) {
    await waitWithin(waitForIdleQueues(), SHUTDOWN_SETTLE_WINDOW_MS);
  }
}

async function waitWithin(work, windowMs) {
  let windowTimer;
  const isDone = await Promise.race([
    work.then(() => true),
    new Promise(resolve => {
      windowTimer = setTimeout(resolve, windowMs, false);
    }),
  ]);
  clearTimeout(windowTimer);
  return isDone;
}

function abortBackgroundJobs() {
  for (const backgroundQueue of backgroundQueues.values()) {
    backgroundQueue.clear();
  }
  waitingJobKeys.clear();
  jobController.abort();
  if (!isStopped) {
    jobController = new AbortController();
  }
  logger.warn('Background work stopped at the shutdown window.');
}

function readBackgroundQueue(subtitleSource) {
  if (!backgroundQueues.has(subtitleSource)) {
    backgroundQueues.set(subtitleSource, new PQueue({concurrency: 1}));
  }
  return backgroundQueues.get(subtitleSource);
}

async function waitForIdleQueues() {
  while (hasQueuedWork()) {
    await Promise.all(
      [...backgroundQueues.values()].map(backgroundQueue =>
        backgroundQueue.onIdle(),
      ),
    );
  }
}

function hasQueuedWork() {
  return [...backgroundQueues.values()].some(
    backgroundQueue => backgroundQueue.size > 0 || backgroundQueue.pending > 0,
  );
}
