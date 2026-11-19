import {beforeEach, describe, expect, it} from 'vitest';
import {reserveSubtitleSourcePace} from '../../src/lib/subtitle-sources/subtitle-source-pace.js';
import {redis} from '../../src/redis/index.js';

const NOW_MS = 1_800_000_000_000;
const PACE_KEY = 'subtitle-source-pace:v1:fixture-paced-source';
const fixturePace = {
  subtitleSource: 'fixture-paced-source',
  intervalMs: 1000,
  burstMax: 3,
  waitMaxMs: 5000,
};

function reserve(callCount, nowMs = NOW_MS, paceOverrides = {}) {
  return reserveSubtitleSourcePace({
    ...fixturePace,
    ...paceOverrides,
    callCount,
    nowMs,
  });
}

beforeEach(async () => {
  await redis.flushdb();
});

describe('reserveSubtitleSourcePace', () => {
  it('lets a burst through at once, then spaces the calls by the interval', async () => {
    await expect(reserve(3)).resolves.toEqual([0, 0, 0]);
    await expect(reserve(2)).resolves.toEqual([1000, 2000]);
    await expect(reserve(1, NOW_MS + 500)).resolves.toEqual([2500]);
  });

  it('refuses a reservation whose last call would wait past the cap and keeps nothing of it', async () => {
    await reserve(3);

    await expect(reserve(2, NOW_MS, {waitMaxMs: 1500})).resolves.toBeNull();
    await expect(reserve(1)).resolves.toEqual([1000]);
  });

  it('refuses a first call when the whole planned task would not fit', async () => {
    await reserve(3);

    await expect(reserve(1, NOW_MS, {plannedCallCount: 6})).resolves.toBeNull();
    await expect(reserve(1, NOW_MS, {plannedCallCount: 5})).resolves.toEqual([
      1000,
    ]);
  });

  it('turns a second whole search away before its first call until all of it fits', async () => {
    const searchPace = {intervalMs: 2500, burstMax: 6, waitMaxMs: 10000};
    const firstCallPace = {...searchPace, plannedCallCount: 6};

    await expect(reserve(1, NOW_MS, firstCallPace)).resolves.toEqual([0]);
    await expect(reserve(5, NOW_MS + 300, searchPace)).resolves.toEqual([
      0, 0, 0, 0, 0,
    ]);
    await expect(reserve(1, NOW_MS + 300, firstCallPace)).resolves.toBeNull();
    await expect(reserve(1, NOW_MS + 5000, firstCallPace)).resolves.toEqual([
      0,
    ]);
    await expect(reserve(5, NOW_MS + 5300, searchPace)).resolves.toEqual([
      0, 2200, 4700, 7200, 9700,
    ]);
  });

  it('gives the whole burst back once the pace has drained', async () => {
    await reserve(3);

    await expect(reserve(3, NOW_MS + 3000)).resolves.toEqual([0, 0, 0]);
  });

  it('keeps its pace only until the last reserved turn has passed', async () => {
    await reserve(3);

    const paceTtlMs = await redis.pttl(PACE_KEY);
    expect(paceTtlMs).toBeGreaterThan(0);
    expect(paceTtlMs).toBeLessThanOrEqual(3000);
  });
});
