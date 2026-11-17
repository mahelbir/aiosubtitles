import {describe, expect, it} from 'vitest';
import {mulberry32} from '../../src/metrics/mulberry32.js';

const LONG_RUN_CALL_COUNT = 5_000_000;

const takeOutputs = (generator, outputCount) =>
  Array.from({length: outputCount}, () => generator());

describe('mulberry32', () => {
  it('returns the reference outputs for seed 20261117', () => {
    expect(takeOutputs(mulberry32(20261117), 5)).toEqual([
      0.876015507383272, 0.0866415249183774, 0.9978529647924006,
      0.0065161436796188354, 0.19620617339387536,
    ]);
  });

  it('returns the reference outputs for seeds 0 and 1', () => {
    expect(takeOutputs(mulberry32(0), 3)).toEqual([
      0.26642920868471265, 0.0003297457005828619, 0.2232720274478197,
    ]);
    expect(takeOutputs(mulberry32(1), 3)).toEqual([
      0.6270739405881613, 0.002735721180215478, 0.5274470399599522,
    ]);
  });

  it('matches a Python uint32 run of the bryc original after five million calls', () => {
    const generator = mulberry32(20261117);
    for (let callIndex = 0; callIndex < LONG_RUN_CALL_COUNT; callIndex += 1) {
      generator();
    }
    expect(takeOutputs(generator, 3)).toEqual([
      0.9483216714579612, 0.6843040063977242, 0.4084617488551885,
    ]);
  });
});
