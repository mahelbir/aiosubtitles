import {QueryTypes} from 'sequelize';
import {vi} from 'vitest';
import {sequelize} from '../../src/db/index.js';

// PostgreSQL-specific
const LOCK_WAITERS_QUERY =
  'SELECT count(*)::int AS waiting FROM pg_stat_activity' +
  ' WHERE datname = current_database()' +
  ' AND cardinality(pg_blocking_pids(pid)) > 0';
const LOCK_WAIT_POLL = {timeout: 10000, interval: 10};

export function createBarrier(participants) {
  let arrived = 0;
  let open;
  const gate = new Promise(resolve => {
    open = resolve;
  });
  return async function waitForOthers() {
    arrived += 1;
    if (arrived >= participants) {
      open();
    }
    await gate;
  };
}

export function runConcurrently(count, task) {
  const waitForOthers = createBarrier(count);
  return Promise.all(
    Array.from({length: count}, async (_unused, index) => {
      await waitForOthers();
      return task(index);
    }),
  );
}

export function settleConcurrently(count, task) {
  const waitForOthers = createBarrier(count);
  return Promise.allSettled(
    Array.from({length: count}, async (_unused, index) => {
      await waitForOthers();
      return task(index);
    }),
  );
}

export async function contendWithLockHolder(hold, contend) {
  const held = Promise.withResolvers();
  const released = Promise.withResolvers();
  const holding = sequelize.transaction(async transaction => {
    await hold(transaction);
    held.resolve();
    await released.promise;
  });
  try {
    await Promise.race([held.promise, holding]);
    const contending = contend();
    await waitForLockWaiter();
    released.resolve();
    await holding;
    return await contending;
  } finally {
    released.resolve();
  }
}

async function waitForLockWaiter() {
  await vi.waitFor(async () => {
    const {waiting} = await sequelize.query(LOCK_WAITERS_QUERY, {
      type: QueryTypes.SELECT,
      plain: true,
    });
    if (waiting === 0) {
      throw new Error('No statement is waiting on a lock yet.');
    }
  }, LOCK_WAIT_POLL);
}
