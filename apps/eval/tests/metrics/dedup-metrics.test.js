import {describe, expect, it} from 'vitest';
import {
  checkNearDuplicateThreshold,
  computeContentKeyAgreement,
  computeTierOneTwoRecall,
  deriveNearDuplicateThreshold,
} from '../../src/metrics/dedup-metrics.js';

const buildTimeEqualPair = (similarity, groupClasses) => ({
  videoCode: 'V15',
  similarity,
  groupClasses,
});

describe('deriveNearDuplicateThreshold', () => {
  it('returns the base threshold when no cross-class pair exists', () => {
    expect(
      deriveNearDuplicateThreshold({
        timeEqualPairs: [
          buildTimeEqualPair(0.99, ['fits', 'fits']),
          buildTimeEqualPair(0.4, ['wrong', 'wrong']),
        ],
      }),
    ).toEqual({threshold: 0.9, crossClassSimilarityMax: null});
  });

  it('raises the threshold one hundredth above the cross-class maximum', () => {
    expect(
      deriveNearDuplicateThreshold({
        timeEqualPairs: [
          buildTimeEqualPair(0.95, ['fits', 'wrong']),
          buildTimeEqualPair(0.7, ['constant', 'wrong']),
        ],
      }),
    ).toEqual({
      threshold: expect.closeTo(0.96, 12),
      crossClassSimilarityMax: 0.95,
    });
  });

  it('keeps the base threshold above a low cross-class maximum', () => {
    expect(
      deriveNearDuplicateThreshold({
        timeEqualPairs: [buildTimeEqualPair(0.5, ['fits', 'wrong'])],
      }),
    ).toEqual({threshold: 0.9, crossClassSimilarityMax: 0.5});
  });

  it('rounds the derived threshold so a same-class pair at it merges', () => {
    const timeEqualPairs = [
      buildTimeEqualPair(0.93, ['fits', 'wrong']),
      buildTimeEqualPair(0.94, ['fits', 'fits']),
    ];
    const {threshold} = deriveNearDuplicateThreshold({timeEqualPairs});
    expect(threshold).toBe(0.94);
    expect(
      checkNearDuplicateThreshold({pairs: timeEqualPairs, threshold}),
    ).toEqual(
      expect.objectContaining({
        isPassing: true,
        crossClassMergeCount: 0,
        sameClassMergeCount: 1,
      }),
    );
  });

  it('ignores same-class pairs when taking the maximum', () => {
    expect(
      deriveNearDuplicateThreshold({
        timeEqualPairs: [
          buildTimeEqualPair(0.99, ['wrong', 'wrong']),
          buildTimeEqualPair(0.95, ['wrong', 'fits']),
        ],
      }),
    ).toEqual({
      threshold: expect.closeTo(0.96, 12),
      crossClassSimilarityMax: 0.95,
    });
  });
});

describe('checkNearDuplicateThreshold', () => {
  it('fails on one cross-class merge and reports the margin', () => {
    expect(
      checkNearDuplicateThreshold({
        pairs: [
          buildTimeEqualPair(0.97, ['fits', 'wrong']),
          buildTimeEqualPair(0.95, ['fits', 'fits']),
          buildTimeEqualPair(0.5, ['wrong', 'wrong']),
        ],
        threshold: 0.9,
      }),
    ).toEqual(
      expect.objectContaining({
        isPassing: false,
        crossClassMergeCount: 1,
        sameClassMergeCount: 1,
        margin: expect.any(Number),
      }),
    );
  });

  it('passes when every cross-class pair stays below the threshold', () => {
    expect(
      checkNearDuplicateThreshold({
        pairs: [
          buildTimeEqualPair(0.8, ['fits', 'wrong']),
          buildTimeEqualPair(0.95, ['fits', 'fits']),
        ],
        threshold: 0.9,
      }),
    ).toEqual(
      expect.objectContaining({
        isPassing: true,
        crossClassMergeCount: 0,
        sameClassMergeCount: 1,
        margin: expect.any(Number),
      }),
    );
  });

  it('reports the margin as the threshold minus the cross-class maximum', () => {
    expect(
      checkNearDuplicateThreshold({
        pairs: [
          buildTimeEqualPair(0.97, ['fits', 'wrong']),
          buildTimeEqualPair(0.6, ['wrong', 'fits']),
        ],
        threshold: 0.9,
      }).margin,
    ).toBeCloseTo(-0.07, 12);
    expect(
      checkNearDuplicateThreshold({
        pairs: [buildTimeEqualPair(0.8, ['fits', 'wrong'])],
        threshold: 0.9,
      }).margin,
    ).toBeCloseTo(0.1, 12);
  });

  it('merges a cross-class pair exactly at the threshold', () => {
    expect(
      checkNearDuplicateThreshold({
        pairs: [buildTimeEqualPair(0.9, ['fits', 'wrong'])],
        threshold: 0.9,
      }),
    ).toEqual(
      expect.objectContaining({
        isPassing: false,
        crossClassMergeCount: 1,
        margin: 0,
      }),
    );
  });

  it('merges a similarity equal to the threshold at six decimals', () => {
    expect(
      checkNearDuplicateThreshold({
        pairs: [
          buildTimeEqualPair(0.9399999999999998, ['fits', 'fits']),
          buildTimeEqualPair(0.9399999999999998, ['fits', 'wrong']),
        ],
        threshold: 0.94,
      }),
    ).toEqual(
      expect.objectContaining({
        isPassing: false,
        crossClassMergeCount: 1,
        sameClassMergeCount: 1,
        margin: 0,
      }),
    );
    expect(
      checkNearDuplicateThreshold({
        pairs: [buildTimeEqualPair(0.94, ['fits', 'fits'])],
        threshold: 0.9400000000000001,
      }).sameClassMergeCount,
    ).toBe(1);
  });

  it('reports no margin when no cross-class pair exists', () => {
    expect(
      checkNearDuplicateThreshold({
        pairs: [buildTimeEqualPair(0.95, ['fits', 'fits'])],
        threshold: 0.9,
      }),
    ).toEqual(
      expect.objectContaining({
        isPassing: true,
        crossClassSimilarityMax: null,
        margin: null,
      }),
    );
  });

  it('reports the counts per video and in total', () => {
    const buildVideoPair = (videoCode, similarity, groupClasses) => ({
      videoCode,
      similarity,
      groupClasses,
    });
    expect(
      checkNearDuplicateThreshold({
        pairs: [
          buildVideoPair('V15', 0.95, ['fits', 'fits']),
          buildVideoPair('V04', 0.92, ['fits', 'wrong']),
          buildVideoPair('V15', 0.85, ['wrong', 'fits']),
          buildVideoPair('V04', 0.5, ['fits', 'fits']),
        ],
        threshold: 0.9,
      }),
    ).toEqual({
      isPassing: false,
      pairCount: 4,
      crossClassPairCount: 2,
      crossClassSimilarityMax: 0.92,
      crossClassMergeCount: 1,
      sameClassMergeCount: 1,
      margin: expect.closeTo(-0.02, 12),
      videos: [
        {
          videoCode: 'V04',
          isPassing: false,
          pairCount: 2,
          crossClassPairCount: 1,
          crossClassSimilarityMax: 0.92,
          crossClassMergeCount: 1,
          sameClassMergeCount: 0,
          margin: expect.closeTo(-0.02, 12),
        },
        {
          videoCode: 'V15',
          isPassing: true,
          pairCount: 2,
          crossClassPairCount: 1,
          crossClassSimilarityMax: 0.85,
          crossClassMergeCount: 0,
          sameClassMergeCount: 1,
          margin: expect.closeTo(0.05, 12),
        },
      ],
    });
  });
});

describe('computeTierOneTwoRecall', () => {
  const buildRow = (videoCode, subtitleSource, candidateKey, tierOneKey) => ({
    videoCode,
    subtitleSource,
    candidateKey,
    tierOneKey,
  });

  it('measures tier-1 recall per source pair type, row reduction and false merges', () => {
    expect(
      computeTierOneTwoRecall({
        rows: [
          buildRow('V01', 'site-a', 'K1', 'a:1'),
          buildRow('V01', 'site-a', 'K1', 'a:1'),
          buildRow('V01', 'site-b', 'K1', 'b:7'),
          buildRow('V01', 'site-a', 'K2', null),
          buildRow('V02', 'site-a', 'K3', 'a:5'),
          buildRow('V02', 'site-a', 'K4', 'a:5'),
          buildRow('V03', 'site-a', 'K1', 'a:1'),
        ],
      }),
    ).toEqual({
      pairRecall: {
        total: {
          pairCount: 3,
          mergedPairCount: 1,
          recall: expect.closeTo(1 / 3, 12),
        },
        sameSite: {pairCount: 1, mergedPairCount: 1, recall: 1},
        crossSite: {pairCount: 2, mergedPairCount: 0, recall: 0},
      },
      rowReduction: 1,
      falseMerges: {pairCount: 1, videoCodes: ['V02']},
    });
  });

  it('reports undefined ratios as null when nothing is removable', () => {
    expect(
      computeTierOneTwoRecall({
        rows: [
          buildRow('V01', 'site-a', 'K1', null),
          buildRow('V01', 'site-a', 'K2', null),
        ],
      }),
    ).toEqual({
      pairRecall: {
        total: {pairCount: 0, mergedPairCount: 0, recall: null},
        sameSite: {pairCount: 0, mergedPairCount: 0, recall: null},
        crossSite: {pairCount: 0, mergedPairCount: 0, recall: null},
      },
      rowReduction: null,
      falseMerges: {pairCount: 0, videoCodes: []},
    });
  });
});

describe('computeContentKeyAgreement', () => {
  const buildRow = (
    videoCode,
    candidateKey,
    contentKey,
    rawSha256,
    groupClass,
  ) => ({videoCode, candidateKey, contentKey, rawSha256, groupClass});

  const agreement = () =>
    computeContentKeyAgreement({
      rows: [
        buildRow('V02', 'K3', 'c5', 'h5', 'wrong'),
        buildRow('V01', 'K1', 'c1', 'h1', 'fits'),
        buildRow('V01', 'K1', 'c1', 'h1', 'fits'),
        buildRow('V01', 'K1', 'c2', 'h3', 'fits'),
        buildRow('V01', 'K2', 'c1', 'h4', 'wrong'),
        buildRow('V02', 'K3', 'c6', 'h5', 'wrong'),
        buildRow('V03', 'K5', null, 'h7', 'fits'),
        buildRow('V03', 'K6', null, 'h8', 'wrong'),
      ],
    });

  it('reports precision, recall, cross-class and byte-identical splits per video', () => {
    expect(agreement().videos).toEqual([
      {
        videoCode: 'V01',
        equalContentKeyPairCount: 3,
        sharedCandidateKeyPairCount: 3,
        agreedPairCount: 1,
        precision: expect.closeTo(1 / 3, 12),
        recall: expect.closeTo(1 / 3, 12),
        crossClassPairCount: 2,
        byteIdenticalSplitPairCount: 0,
      },
      {
        videoCode: 'V02',
        equalContentKeyPairCount: 0,
        sharedCandidateKeyPairCount: 1,
        agreedPairCount: 0,
        precision: null,
        recall: 0,
        crossClassPairCount: 0,
        byteIdenticalSplitPairCount: 1,
      },
      {
        videoCode: 'V03',
        equalContentKeyPairCount: 0,
        sharedCandidateKeyPairCount: 0,
        agreedPairCount: 0,
        precision: null,
        recall: null,
        crossClassPairCount: 0,
        byteIdenticalSplitPairCount: 0,
      },
    ]);
  });

  it('reports a single-row video with no pair and no macro value', () => {
    expect(
      computeContentKeyAgreement({
        rows: [buildRow('V21', 'K1', 'c1', 'h1', 'wrong')],
      }),
    ).toEqual(
      expect.objectContaining({
        macro: {
          precision: {value: null, definedVideoCount: 0, videoCount: 1},
          recall: {value: null, definedVideoCount: 0, videoCount: 1},
        },
        videos: [
          {
            videoCode: 'V21',
            equalContentKeyPairCount: 0,
            sharedCandidateKeyPairCount: 0,
            agreedPairCount: 0,
            precision: null,
            recall: null,
            crossClassPairCount: 0,
            byteIdenticalSplitPairCount: 0,
          },
        ],
      }),
    );
  });

  it('pools pairs for the micro total and averages defined videos for the macro', () => {
    expect(agreement()).toEqual(
      expect.objectContaining({
        total: {
          equalContentKeyPairCount: 3,
          sharedCandidateKeyPairCount: 4,
          agreedPairCount: 1,
          precision: expect.closeTo(1 / 3, 12),
          recall: 0.25,
          crossClassPairCount: 2,
          byteIdenticalSplitPairCount: 1,
        },
        macro: {
          precision: {
            value: expect.closeTo(1 / 3, 12),
            definedVideoCount: 1,
            videoCount: 3,
          },
          recall: {
            value: expect.closeTo(1 / 6, 12),
            definedVideoCount: 2,
            videoCount: 3,
          },
        },
      }),
    );
  });
});
