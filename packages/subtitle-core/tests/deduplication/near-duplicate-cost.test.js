import {distance} from 'fastest-levenshtein';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {areCuesNearDuplicate} from '../../src/deduplication/are-cues-near-duplicate.js';
import {groupDuplicates} from '../../src/deduplication/group-duplicates.js';
import {
  makeCues,
  makeDistinctCandidate,
  makeFileFacts,
  makeScrambledLines,
} from '../helpers/deduplication-fixtures.js';

vi.mock(import('fastest-levenshtein'), async importOriginal => {
  const levenshtein = await importOriginal();
  return {...levenshtein, distance: vi.fn(levenshtein.distance)};
});

const TEXT_SIMILARITY_MIN = 0.9;
const FILE_COUNT = 300;
const CUE_COUNT = 40;
const PAIR_COUNT = (FILE_COUNT * (FILE_COUNT - 1)) / 2;
const BASE_LINES = makeScrambledLines({seed: 1, lineCount: CUE_COUNT});

const makeTimeEqualRow = (fileIndex, lines) =>
  makeDistinctCandidate(`row-${String(fileIndex).padStart(3, '0')}`, {
    fileFacts: makeFileFacts({
      contentKey: `key-${fileIndex}`,
      normalizedCues: makeCues(lines),
    }),
  });

const makeNearIdenticalLines = fileIndex =>
  BASE_LINES.map((line, lineIndex) =>
    lineIndex === fileIndex % CUE_COUNT ? `${line}${fileIndex}` : line,
  );

describe('near-duplicate cost', () => {
  beforeEach(() => {
    distance.mockClear();
  });

  it('stops comparing cue texts once the pair cannot reach the minimum', () => {
    const isNearDuplicate = areCuesNearDuplicate({
      cuesA: makeCues(BASE_LINES),
      cuesB: makeCues(makeScrambledLines({seed: 2, lineCount: CUE_COUNT})),
      textSimilarityMin: TEXT_SIMILARITY_MIN,
    });

    expect(isNearDuplicate).toBe(false);
    expect(distance.mock.calls.length).toBeLessThan(CUE_COUNT / 4);
  });

  it('bounds the comparisons for 300 time-equal files with different text', () => {
    const candidates = Array.from({length: FILE_COUNT}, (_, fileIndex) =>
      makeTimeEqualRow(
        fileIndex,
        makeScrambledLines({seed: fileIndex + 2, lineCount: CUE_COUNT}),
      ),
    );

    const groups = groupDuplicates({
      candidates,
      textSimilarityMin: TEXT_SIMILARITY_MIN,
    });

    expect(groups).toHaveLength(FILE_COUNT);
    expect(distance.mock.calls.length).toBeLessThanOrEqual(PAIR_COUNT * 8);
  });

  it('compares 300 near-identical files only until each one joins the group', () => {
    const candidates = Array.from({length: FILE_COUNT}, (_, fileIndex) =>
      makeTimeEqualRow(fileIndex, makeNearIdenticalLines(fileIndex)),
    );

    const groups = groupDuplicates({
      candidates,
      textSimilarityMin: TEXT_SIMILARITY_MIN,
    });

    expect(groups).toHaveLength(1);
    expect(groups[0].duplicateTier).toBe(4);
    expect(distance.mock.calls.length).toBe((FILE_COUNT - 1) * CUE_COUNT);
  });
});
