import {describe, expect, it} from 'vitest';
import {
  NEAR_DUPLICATE_TEXT_SIMILARITY_MIN,
  areCuesNearDuplicate,
} from '../../src/deduplication/are-cues-near-duplicate.js';
import {
  NEAR_DUPLICATE_SCENE_LINES,
  OTHER_SCENE_LINES,
  SCENE_LINES,
  makeCues,
} from '../helpers/deduplication-fixtures.js';

describe('NEAR_DUPLICATE_TEXT_SIMILARITY_MIN', () => {
  it('starts at the metrics τ₀ of 0.9', () => {
    expect(NEAR_DUPLICATE_TEXT_SIMILARITY_MIN).toBe(0.9);
  });
});

describe('areCuesNearDuplicate', () => {
  it('accepts identical cues', () => {
    expect(
      areCuesNearDuplicate({
        cuesA: makeCues(),
        cuesB: makeCues(),
        textSimilarityMin: 0.9,
      }),
    ).toBe(true);
  });

  it('accepts equal timings with one changed word at 0.9', () => {
    expect(
      areCuesNearDuplicate({
        cuesA: makeCues(),
        cuesB: makeCues(NEAR_DUPLICATE_SCENE_LINES),
        textSimilarityMin: 0.9,
      }),
    ).toBe(true);
  });

  it('rejects the same pair when the threshold is above its similarity', () => {
    expect(
      areCuesNearDuplicate({
        cuesA: makeCues(),
        cuesB: makeCues(NEAR_DUPLICATE_SCENE_LINES),
        textSimilarityMin: 0.999,
      }),
    ).toBe(false);
  });

  it('treats two empty cue texts at the same time as identical', () => {
    const emptyTextLines = SCENE_LINES.map((line, index) =>
      index === 0 ? '' : line,
    );
    expect(
      areCuesNearDuplicate({
        cuesA: makeCues(emptyTextLines),
        cuesB: makeCues(emptyTextLines),
        textSimilarityMin: 1,
      }),
    ).toBe(true);
  });

  it('accepts a single cue whose similarity is exactly the minimum', () => {
    expect(
      areCuesNearDuplicate({
        cuesA: makeCues(['abcdefghij']),
        cuesB: makeCues(['abcdefghiX']),
        textSimilarityMin: 0.9,
      }),
    ).toBe(true);
  });

  it('accepts ten cues whose mean similarity is exactly the minimum', () => {
    const tenLines = [...SCENE_LINES, ...SCENE_LINES.slice(0, 2)];
    expect(
      areCuesNearDuplicate({
        cuesA: makeCues(tenLines),
        cuesB: makeCues([...tenLines.slice(0, 9), 'zzzz']),
        textSimilarityMin: 0.9,
      }),
    ).toBe(true);
  });

  it('rejects equal timings with different text', () => {
    expect(
      areCuesNearDuplicate({
        cuesA: makeCues(),
        cuesB: makeCues(OTHER_SCENE_LINES),
        textSimilarityMin: 0.9,
      }),
    ).toBe(false);
  });

  it('rejects equal text with timings shifted by 1 s', () => {
    expect(
      areCuesNearDuplicate({
        cuesA: makeCues(),
        cuesB: makeCues(SCENE_LINES, 1000),
        textSimilarityMin: 0.9,
      }),
    ).toBe(false);
  });

  it('rejects a single changed end time', () => {
    const cuesB = makeCues();
    cuesB[4] = {...cuesB[4], endMs: cuesB[4].endMs + 40};
    expect(
      areCuesNearDuplicate({cuesA: makeCues(), cuesB, textSimilarityMin: 0.9}),
    ).toBe(false);
  });

  it('rejects a different cue count', () => {
    expect(
      areCuesNearDuplicate({
        cuesA: makeCues(),
        cuesB: makeCues(SCENE_LINES.slice(0, -1)),
        textSimilarityMin: 0.9,
      }),
    ).toBe(false);
  });

  it('never treats two empty cue lists as near duplicates', () => {
    expect(
      areCuesNearDuplicate({cuesA: [], cuesB: [], textSimilarityMin: 0.9}),
    ).toBe(false);
  });
});
