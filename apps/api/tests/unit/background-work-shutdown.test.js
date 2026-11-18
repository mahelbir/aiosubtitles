import Fastify from 'fastify';
import fp from 'fastify-plugin';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {
  SHUTDOWN_DRAIN_WINDOW_MS,
  SHUTDOWN_GRACE_MS,
  SHUTDOWN_SETTLE_WINDOW_MS,
} from '../../src/lib/shutdown-deadline.js';
import {enqueueBackgroundJob} from '../../src/lib/subtitle-background/background-queues.js';
import backgroundWorkPlugin from '../../src/plugins/background-work.js';

const IN_FLIGHT_DOWNLOAD_MS = 2000;

function createDatastorePlugin(name, closeOrder) {
  return fp(
    async fastify => {
      fastify.addHook('onClose', async () => {
        closeOrder.push(name);
      });
    },
    {name},
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe('background work shutdown', () => {
  it('refuses new jobs and aborts running ones at the deadline before the datastores close', async () => {
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
    const closeOrder = [];
    const app = Fastify();
    app.register(createDatastorePlugin('db', closeOrder));
    app.register(createDatastorePlugin('redis', closeOrder));
    app.register(backgroundWorkPlugin);
    await app.ready();
    const jobSignals = [];
    enqueueBackgroundJob({
      subtitleSource: SubtitleSource.THESUBTITLEDB,
      runJob: ({signal}) => {
        jobSignals.push(signal);
        return new Promise(resolve => {
          signal.addEventListener('abort', () => {
            setTimeout(() => {
              closeOrder.push('in-flight download stored');
              resolve();
            }, IN_FLIGHT_DOWNLOAD_MS);
          });
        });
      },
    });
    enqueueBackgroundJob({
      subtitleSource: SubtitleSource.OPENSUBTITLES,
      runJob: () => new Promise(() => {}),
    });

    let isClosed = false;
    const closing = app.close().then(() => {
      isClosed = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    const isLateJobAccepted = enqueueBackgroundJob({
      subtitleSource: SubtitleSource.ALTYAZIDB,
      runJob: async () => {},
    });
    await vi.advanceTimersByTimeAsync(
      SHUTDOWN_DRAIN_WINDOW_MS + SHUTDOWN_SETTLE_WINDOW_MS - 1000,
    );
    const isClosedBeforeSettleEnd = isClosed;
    const closeOrderBeforeSettleEnd = [...closeOrder];
    await vi.advanceTimersByTimeAsync(1000);
    await closing;

    expect(isLateJobAccepted).toBe(false);
    expect(isClosedBeforeSettleEnd).toBe(false);
    expect(closeOrderBeforeSettleEnd).toEqual(['in-flight download stored']);
    expect(jobSignals).toHaveLength(1);
    expect(jobSignals[0].aborted).toBe(true);
    expect(closeOrder).toEqual(['in-flight download stored', 'redis', 'db']);
    expect(SHUTDOWN_DRAIN_WINDOW_MS + SHUTDOWN_SETTLE_WINDOW_MS).toBeLessThan(
      SHUTDOWN_GRACE_MS,
    );
  });
});
