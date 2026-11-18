import {describe, expect, it} from 'vitest';
import {compareCueTimings} from '@repo/subtitle-core/timing/compare-cue-timings.js';
import {TIME_FAMILY_GRID} from '../../src/metrics/time-family-metrics.js';
import {createTimingComparer} from '../../src/score-tables/time-family-run.js';

const CUE_COUNT = 60;

const makeTrack = ({scale = 1, shiftMs = 0, jitterMs = 0, dropEvery = 0}) => ({
  cues: Array.from({length: CUE_COUNT}, (_, cueIndex) => {
    const startMs =
      Math.round((1000 + cueIndex * 2500) * scale) +
      shiftMs +
      (cueIndex % 3 === 0 ? jitterMs : 0);
    return {startMs, endMs: startMs + 1200};
  }).filter((_, cueIndex) => dropEvery === 0 || cueIndex % dropEvery !== 0),
});

const TRACKS = [
  makeTrack({}),
  makeTrack({shiftMs: 120}),
  makeTrack({shiftMs: 2000}),
  makeTrack({scale: 25 / 23.976}),
  makeTrack({jitterMs: 180}),
  makeTrack({dropEvery: 7}),
  makeTrack({dropEvery: 4, jitterMs: 90}),
];

describe('createTimingComparer', () => {
  it('gives the same verdict as a direct comparison for every grid setting', () => {
    const createSameFamilyCheck = createTimingComparer();

    for (const setting of TIME_FAMILY_GRID) {
      const isSameTimeFamily = createSameFamilyCheck(setting);
      for (const reference of TRACKS) {
        for (const candidate of TRACKS) {
          expect(isSameTimeFamily(reference, candidate)).toBe(
            compareCueTimings({
              candidateCues: candidate.cues,
              referenceCues: reference.cues,
              timingSettings: {
                cueStartToleranceMs: setting.startToleranceMs,
                matchedCueShareMin: setting.matchedShareMin,
              },
            }).isSameTimeFamily,
          );
        }
      }
    }
  });

  it('separates the shares that the grid tells apart', () => {
    const createSameFamilyCheck = createTimingComparer();
    const verdicts = TIME_FAMILY_GRID.flatMap(setting =>
      TRACKS.map(candidate =>
        createSameFamilyCheck(setting)(TRACKS[0], candidate),
      ),
    );

    expect(verdicts).toContain(true);
    expect(verdicts).toContain(false);
  });
});
