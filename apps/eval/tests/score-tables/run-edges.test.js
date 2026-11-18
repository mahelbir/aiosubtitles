import {describe, expect, it} from 'vitest';
import {DROPPED_GROUP_SCORE} from '../../src/commands/rank-groups.js';
import {ComparisonOutcome} from '../../src/constants/comparison-outcome.js';
import {
  listTimeEqualPairs,
  runNearDuplicateCheck,
} from '../../src/score-tables/dedup-run.js';
import {
  compareRankingRows,
  summarizeRankingRow,
} from '../../src/score-tables/ranking-run.js';

const makeCues = texts =>
  texts.map((text, cueIndex) => ({
    startMs: cueIndex * 1000,
    endMs: cueIndex * 1000 + 500,
    text,
  }));

const makeContentGroup = (groupClass, cues) => ({
  groupClass,
  rows: [{candidate: {fileFacts: {isFileValid: true, normalizedCues: cues}}}],
});

const DEDUP_VIDEOS = [
  {
    videoCode: 'V01',
    contentGroups: [
      makeContentGroup('fits', makeCues(['abcdefghij', 'klmnopqrst'])),
      makeContentGroup('wrong', makeCues(['abcdefghix', 'klmnopqrsx'])),
      makeContentGroup('wrong', makeCues(['abcdefghij'])),
    ],
  },
];

describe('tier-4 run', () => {
  it('measures the text similarity of time-equal groups only', () => {
    expect(listTimeEqualPairs({videos: DEDUP_VIDEOS})).toEqual([
      {videoCode: 'V01', groupClasses: ['fits', 'wrong'], similarity: 0.9},
    ]);
  });

  it('reports the exact mean cue similarity, not a rounded search result', () => {
    const [timeEqualPair] = listTimeEqualPairs({
      videos: [
        {
          videoCode: 'V02',
          contentGroups: [
            makeContentGroup('fits', makeCues(['abc', 'xyz'])),
            makeContentGroup('fits', makeCues(['abd', 'xyz'])),
          ],
        },
      ],
    });

    expect(timeEqualPair.similarity).toBe((1 - 1 / 3 + 1) / 2);
    expect(timeEqualPair.similarity).not.toBe(0.833333);
  });

  it('raises τ above a cross-class similarity (metrics §4.3)', () => {
    const {threshold, crossClassSimilarityMax, thresholdCheck} =
      runNearDuplicateCheck({videos: DEDUP_VIDEOS});

    expect(crossClassSimilarityMax).toBe(0.9);
    expect(threshold).toBe(0.91);
    expect(thresholdCheck.crossClassMergeCount).toBe(0);
  });
});

const makeVideoRanking = (videoCode, fitsScore, wrongScore) => ({
  videoCode,
  rankedGroups: [
    {groupClass: 'fits', groupScore: fitsScore, isValid: true},
    {groupClass: 'wrong', groupScore: wrongScore, isValid: true},
  ],
});

describe('ranking run', () => {
  const auditPassedCodes = new Set(['V01']);
  const goodRow = summarizeRankingRow({
    rowName: 'good',
    videoRankings: [makeVideoRanking('V01', 1, 0)],
    auditPassedCodes,
  });
  const badRow = summarizeRankingRow({
    rowName: 'bad',
    videoRankings: [makeVideoRanking('V01', DROPPED_GROUP_SCORE, 0)],
    auditPassedCodes,
  });

  it('counts dropped positives and worst errors by video', () => {
    const [y1Summary] = badRow.labelSummaries;

    expect(y1Summary.droppedPositives).toEqual({
      droppedCount: 1,
      videoCodes: ['V01'],
    });
    expect(y1Summary.worstErrorVideoCodes).toEqual(['V01']);
  });

  it('marks a win, a loss and the rows nobody beats', () => {
    expect(
      compareRankingRows({rowSummaries: [goodRow, badRow], label: 'Y1'}),
    ).toEqual({
      label: 'Y1',
      outcomeRows: [
        [null, ComparisonOutcome.WIN],
        [ComparisonOutcome.LOSS, null],
      ],
      notBeatenRowNames: ['good'],
    });
  });
});
