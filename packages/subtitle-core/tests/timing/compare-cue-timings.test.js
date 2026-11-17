import {describe, expect, it} from 'vitest';
import {
  COMPARISON_METHOD_VERSION,
  DEFAULT_TIMING_SETTINGS,
  compareCueTimings,
} from '../../src/timing/compare-cue-timings.js';
import {makeCue, makeCueTrack, mapCueTimes} from '../helpers/cue-tracks.js';

const TIMING_SETTINGS = {
  cueStartToleranceMs: 300,
  matchedCueShareMin: 0.8,
  offsetNearZeroMs: 150,
  fpsRatioNearOneDelta: 0.002,
};
const CUE_COUNT = 250;
const FIXED_OFFSET_MS = 2000;
const REFERENCE_FPS = 23.976;
const CANDIDATE_FPS = 25;
const FPS_RATIO_DELTA = 0.001;
const SMALL_JITTER_MS = 200;
const SMALL_SHIFT_MS = 250;
const LARGE_DISPLACEMENT_MS = 1500;
const UNEVEN_TRACK_OFFSET_MS = 1200;
const EXTRA_LINE_DELAY_MS = 4000;
const DENSE_CUE_COUNT = 600;
const DENSE_MIN_CUE_GAP_MS = 1000;
const DENSE_CUE_GAP_SPREAD_MS = 4001;
const PAL_TRACK_OFFSET_MS = 3000;
const NO_COMPARISON = {
  timingOffsetMs: 0,
  timingFpsRatio: 1,
  matchedCueShare: 0,
  isSameTimeFamily: false,
};

const referenceCues = makeCueTrack({cueCount: CUE_COUNT});

const signFor = cueIndex => (cueIndex % 20 === 0 ? 1 : -1);

describe('compareCueTimings', () => {
  it('finds no shift and the same time family for identical tracks', () => {
    const comparison = compareCueTimings({
      candidateCues: referenceCues.map(cue => ({...cue})),
      referenceCues,
      timingSettings: TIMING_SETTINGS,
    });

    expect(comparison).toEqual({
      timingOffsetMs: 0,
      timingFpsRatio: 1,
      matchedCueShare: 1,
      isSameTimeFamily: true,
    });
  });

  it('finds a fixed offset when every cue is shifted by 2000 ms', () => {
    const comparison = compareCueTimings({
      candidateCues: mapCueTimes(
        referenceCues,
        timeMs => timeMs + FIXED_OFFSET_MS,
      ),
      referenceCues,
      timingSettings: TIMING_SETTINGS,
    });

    expect(
      Math.abs(comparison.timingOffsetMs - FIXED_OFFSET_MS),
    ).toBeLessThanOrEqual(TIMING_SETTINGS.cueStartToleranceMs);
    expect(comparison.matchedCueShare).toBeLessThanOrEqual(0.05);
    expect(comparison.isSameTimeFamily).toBe(false);
  });

  it('finds the fps ratio of a candidate scaled from 23.976 to 25 fps', () => {
    const fpsRatio = CANDIDATE_FPS / REFERENCE_FPS;
    const comparison = compareCueTimings({
      candidateCues: mapCueTimes(referenceCues, timeMs =>
        Math.round(timeMs * fpsRatio),
      ),
      referenceCues,
      timingSettings: TIMING_SETTINGS,
    });

    expect(Math.abs(comparison.timingFpsRatio - fpsRatio)).toBeLessThanOrEqual(
      FPS_RATIO_DELTA,
    );
    expect(comparison.isSameTimeFamily).toBe(false);
  });

  it('keeps the same time family when 10% of cues jitter within the tolerance', () => {
    const comparison = compareCueTimings({
      candidateCues: mapCueTimes(referenceCues, (timeMs, cueIndex) =>
        cueIndex % 10 === 0
          ? timeMs + signFor(cueIndex) * SMALL_JITTER_MS
          : timeMs,
      ),
      referenceCues,
      timingSettings: TIMING_SETTINGS,
    });

    expect(comparison.matchedCueShare).toBeGreaterThanOrEqual(
      TIMING_SETTINGS.matchedCueShareMin,
    );
    expect(comparison.isSameTimeFamily).toBe(true);
  });

  it('leaves the time family when a fixed offset passes the near-zero limit within the tolerance', () => {
    const comparison = compareCueTimings({
      candidateCues: mapCueTimes(
        referenceCues,
        timeMs => timeMs + SMALL_SHIFT_MS,
      ),
      referenceCues,
      timingSettings: TIMING_SETTINGS,
    });

    expect(comparison.matchedCueShare).toBe(1);
    expect(comparison.isSameTimeFamily).toBe(false);
  });

  it('leaves the time family when the matched share falls below the minimum', () => {
    const comparison = compareCueTimings({
      candidateCues: mapCueTimes(referenceCues, (timeMs, cueIndex) =>
        [0, 3, 6].includes(cueIndex % 10)
          ? timeMs + (cueIndex % 2 === 0 ? 1 : -1) * LARGE_DISPLACEMENT_MS
          : timeMs,
      ),
      referenceCues,
      timingSettings: TIMING_SETTINGS,
    });

    expect(comparison.matchedCueShare).toBeLessThan(
      TIMING_SETTINGS.matchedCueShareMin,
    );
    expect(comparison.isSameTimeFamily).toBe(false);
  });

  it('matches nothing against an empty reference', () => {
    const comparison = compareCueTimings({
      candidateCues: referenceCues,
      referenceCues: [],
      timingSettings: TIMING_SETTINGS,
    });

    expect(comparison.matchedCueShare).toBe(0);
    expect(comparison.isSameTimeFamily).toBe(false);
    expect(comparison.timingOffsetMs).toBe(0);
    expect(comparison.timingFpsRatio).toBe(1);
  });

  it('matches nothing for an empty candidate', () => {
    const comparison = compareCueTimings({
      candidateCues: [],
      referenceCues,
      timingSettings: TIMING_SETTINGS,
    });

    expect(comparison.matchedCueShare).toBe(0);
    expect(comparison.isSameTimeFamily).toBe(false);
    expect(comparison.timingOffsetMs).toBe(0);
    expect(comparison.timingFpsRatio).toBe(1);
  });

  it('finds a fixed offset when the candidate lacks every fifth cue', () => {
    const comparison = compareCueTimings({
      candidateCues: mapCueTimes(
        referenceCues,
        timeMs => timeMs + UNEVEN_TRACK_OFFSET_MS,
      ).filter((_, cueIndex) => cueIndex % 5 !== 0),
      referenceCues,
      timingSettings: TIMING_SETTINGS,
    });

    expect(comparison.timingOffsetMs).toBe(UNEVEN_TRACK_OFFSET_MS);
    expect(comparison.timingFpsRatio).toBe(1);
    expect(comparison.isSameTimeFamily).toBe(false);
  });

  it('finds a negative offset when every cue starts earlier', () => {
    const comparison = compareCueTimings({
      candidateCues: mapCueTimes(
        referenceCues,
        timeMs => timeMs - FIXED_OFFSET_MS,
      ),
      referenceCues,
      timingSettings: TIMING_SETTINGS,
    });

    expect(comparison.timingOffsetMs).toBe(-FIXED_OFFSET_MS);
    expect(comparison.timingFpsRatio).toBe(1);
  });

  it('compares cues given out of order', () => {
    const comparison = compareCueTimings({
      candidateCues: referenceCues.toReversed(),
      referenceCues: referenceCues.toReversed(),
      timingSettings: TIMING_SETTINGS,
    });

    expect(comparison).toEqual({
      timingOffsetMs: 0,
      timingFpsRatio: 1,
      matchedCueShare: 1,
      isSameTimeFamily: true,
    });
  });

  it('matches two single-cue tracks without a ratio fit', () => {
    const comparison = compareCueTimings({
      candidateCues: [makeCue({startMs: 5100, endMs: 7000})],
      referenceCues: [makeCue({startMs: 5000, endMs: 7000})],
      timingSettings: TIMING_SETTINGS,
    });

    expect(comparison).toEqual({
      timingOffsetMs: 100,
      timingFpsRatio: 1,
      matchedCueShare: 1,
      isSameTimeFamily: true,
    });
  });

  it('skips cues whose start is not a finite number', () => {
    const comparison = compareCueTimings({
      candidateCues: [
        ...referenceCues,
        makeCue({startMs: Number.NaN}),
        makeCue({startMs: Number.POSITIVE_INFINITY}),
        makeCue({startMs: null}),
      ],
      referenceCues: [...referenceCues, makeCue({startMs: undefined})],
      timingSettings: TIMING_SETTINGS,
    });

    expect(comparison).toEqual({
      timingOffsetMs: 0,
      timingFpsRatio: 1,
      matchedCueShare: 1,
      isSameTimeFamily: true,
    });
  });

  it('counts each reference cue once toward the matched share', () => {
    const comparison = compareCueTimings({
      candidateCues: referenceCues.flatMap(cue => [cue, {...cue}]),
      referenceCues,
      timingSettings: TIMING_SETTINGS,
    });

    expect(comparison.matchedCueShare).toBe(0.5);
    expect(comparison.isSameTimeFamily).toBe(false);
  });

  it('leaves the time family for a short candidate that is a subset of the reference', () => {
    const longReferenceCues = makeCueTrack({cueCount: 400});
    const comparison = compareCueTimings({
      candidateCues: longReferenceCues.slice(0, 20),
      referenceCues: longReferenceCues,
      timingSettings: TIMING_SETTINGS,
    });

    expect(comparison.matchedCueShare).toBe(0.05);
    expect(comparison.isSameTimeFamily).toBe(false);
  });

  describe('with a candidate carrying 25% extra cues on the same timing', () => {
    const baseCues = referenceCues.slice(0, 200);
    const extraLineCues = baseCues.flatMap((cue, cueIndex) =>
      cueIndex % 4 === 0
        ? [
            cue,
            makeCue({
              startMs: cue.startMs + EXTRA_LINE_DELAY_MS,
              endMs: cue.startMs + EXTRA_LINE_DELAY_MS + 1000,
            }),
          ]
        : [cue],
    );

    it('keeps the time family when the share meets the minimum', () => {
      const comparison = compareCueTimings({
        candidateCues: extraLineCues,
        referenceCues: baseCues,
        timingSettings: TIMING_SETTINGS,
      });

      expect(comparison).toEqual({
        timingOffsetMs: 0,
        timingFpsRatio: 1,
        matchedCueShare: 0.8,
        isSameTimeFamily: true,
      });
    });

    it('leaves the time family when the minimum is above the share', () => {
      const comparison = compareCueTimings({
        candidateCues: extraLineCues,
        referenceCues: baseCues,
        timingSettings: {...TIMING_SETTINGS, matchedCueShareMin: 0.85},
      });

      expect(comparison.matchedCueShare).toBe(0.8);
      expect(comparison.isSameTimeFamily).toBe(false);
    });
  });

  it('treats a missing track and missing cues as empty', () => {
    const comparison = compareCueTimings({
      candidateCues: null,
      referenceCues: [null, ...referenceCues],
      timingSettings: TIMING_SETTINGS,
    });

    expect(comparison).toEqual({
      timingOffsetMs: 0,
      timingFpsRatio: 1,
      matchedCueShare: 0,
      isSameTimeFamily: false,
    });
  });

  it('reports no shift when no cue pairs within the offset search range', () => {
    const comparison = compareCueTimings({
      candidateCues: [makeCue({startMs: 50_000_000})],
      referenceCues: [makeCue({startMs: 1000})],
      timingSettings: TIMING_SETTINGS,
    });

    expect(comparison).toEqual({
      timingOffsetMs: 0,
      timingFpsRatio: 1,
      matchedCueShare: 0,
      isSameTimeFamily: false,
    });
  });

  it('keeps the hypothesis ratio when every paired cue starts at the same time', () => {
    const comparison = compareCueTimings({
      candidateCues: [
        makeCue({startMs: 5000}),
        makeCue({startMs: 5000, text: 'Second line'}),
      ],
      referenceCues: [
        makeCue({startMs: 5000}),
        makeCue({startMs: 5000, text: 'Second line'}),
      ],
      timingSettings: TIMING_SETTINGS,
    });

    expect(comparison).toEqual({
      timingOffsetMs: 0,
      timingFpsRatio: 1,
      matchedCueShare: 1,
      isSameTimeFamily: true,
    });
  });

  it('keeps the default for a setting left out of partial settings', () => {
    const {fpsRatioNearOneDelta: _, ...partialSettings} = {
      ...TIMING_SETTINGS,
      offsetNearZeroMs: 300,
    };
    const comparison = compareCueTimings({
      candidateCues: mapCueTimes(
        referenceCues,
        timeMs => timeMs + SMALL_SHIFT_MS,
      ),
      referenceCues,
      timingSettings: partialSettings,
    });

    expect(comparison).toEqual({
      timingOffsetMs: SMALL_SHIFT_MS,
      timingFpsRatio: 1,
      matchedCueShare: 1,
      isSameTimeFamily: true,
    });
  });

  it.each([
    ['an object', {}],
    ['a string', 'abc'],
    ['a number', 5],
    ['an array-like object', {length: 2}],
  ])('treats %s in place of a track as an empty track', (_, badTrack) => {
    expect(
      compareCueTimings({
        candidateCues: badTrack,
        referenceCues,
        timingSettings: TIMING_SETTINGS,
      }),
    ).toEqual(NO_COMPARISON);
    expect(
      compareCueTimings({
        candidateCues: referenceCues,
        referenceCues: badTrack,
        timingSettings: TIMING_SETTINGS,
      }),
    ).toEqual(NO_COMPARISON);
  });

  it('treats a call without arguments as two empty tracks', () => {
    expect(compareCueTimings()).toEqual(NO_COMPARISON);
  });

  describe('on a dense track with 1-5 s gaps', () => {
    const denseReferenceCues = makeCueTrack({
      cueCount: DENSE_CUE_COUNT,
      minCueGapMs: DENSE_MIN_CUE_GAP_MS,
      cueGapSpreadMs: DENSE_CUE_GAP_SPREAD_MS,
    });

    it('finds a fixed offset through chance matches', () => {
      const comparison = compareCueTimings({
        candidateCues: mapCueTimes(
          denseReferenceCues,
          timeMs => timeMs + FIXED_OFFSET_MS,
        ),
        referenceCues: denseReferenceCues,
        timingSettings: TIMING_SETTINGS,
      });

      expect(comparison.matchedCueShare).toBeGreaterThan(0);
      expect(comparison.matchedCueShare).toBeLessThan(
        TIMING_SETTINGS.matchedCueShareMin,
      );
      expect(comparison.timingOffsetMs).toBe(FIXED_OFFSET_MS);
      expect(comparison.timingFpsRatio).toBe(1);
      expect(comparison.isSameTimeFamily).toBe(false);
    });

    it('finds a PAL speed-up combined with a fixed offset', () => {
      const fpsRatio = CANDIDATE_FPS / REFERENCE_FPS;
      const comparison = compareCueTimings({
        candidateCues: mapCueTimes(denseReferenceCues, timeMs =>
          Math.round(timeMs * fpsRatio + PAL_TRACK_OFFSET_MS),
        ),
        referenceCues: denseReferenceCues,
        timingSettings: TIMING_SETTINGS,
      });

      expect(
        Math.abs(comparison.timingFpsRatio - fpsRatio),
      ).toBeLessThanOrEqual(FPS_RATIO_DELTA);
      expect(
        Math.abs(comparison.timingOffsetMs - PAL_TRACK_OFFSET_MS),
      ).toBeLessThanOrEqual(TIMING_SETTINGS.cueStartToleranceMs);
      expect(comparison.isSameTimeFamily).toBe(false);
    });
  });
});

describe('timing comparison constants', () => {
  it('starts the comparison method at version 1', () => {
    expect(COMPARISON_METHOD_VERSION).toBe(1);
  });

  it('defaults every timing setting to a number', () => {
    expect(Object.keys(DEFAULT_TIMING_SETTINGS).sort()).toEqual([
      'cueStartToleranceMs',
      'fpsRatioNearOneDelta',
      'matchedCueShareMin',
      'offsetNearZeroMs',
    ]);
    expect(Object.values(DEFAULT_TIMING_SETTINGS).every(Number.isFinite)).toBe(
      true,
    );
  });
});
