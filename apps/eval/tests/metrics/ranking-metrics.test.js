import {describe, expect, it} from 'vitest';
import {
  computeFirstPositiveRank,
  computePairOrder,
  computeReciprocalRank,
  computeTopOne,
  computeWorstError,
  countInvalidAbovePositive,
  isInformativeVideo,
} from '../../src/metrics/ranking-metrics.js';

const buildGroup = (groupClass, groupScore, isValid = true) => ({
  groupClass,
  groupScore,
  isValid,
});

describe('computePairOrder', () => {
  it('counts a won pair as one and a tied pair as one half', () => {
    const rankedGroups = [
      buildGroup('fits', 10),
      buildGroup('wrong', 5),
      buildGroup('wrong', 10),
    ];
    expect(computePairOrder({rankedGroups, label: 'Y1'})).toBe((1 + 0.5) / 2);
  });

  it('treats constant as positive under Y2 only', () => {
    const rankedGroups = [
      buildGroup('constant', 8),
      buildGroup('fits', 2),
      buildGroup('wrong', 5),
    ];
    expect(computePairOrder({rankedGroups, label: 'Y1'})).toBe(0);
    expect(computePairOrder({rankedGroups, label: 'Y2'})).toBe(0.5);
  });

  it('ties float scores that are equal at six decimals', () => {
    const rankedGroups = [
      buildGroup('fits', 0.1 + 0.2),
      buildGroup('wrong', 0.3),
    ];
    expect(computePairOrder({rankedGroups, label: 'Y1'})).toBe(0.5);
  });

  it('ignores invalid groups', () => {
    const rankedGroups = [
      buildGroup('fits', 10),
      buildGroup('wrong', 5),
      buildGroup('wrong', 20, false),
    ];
    expect(computePairOrder({rankedGroups, label: 'Y1'})).toBe(1);
  });
});

describe('computeTopOne', () => {
  it('returns one half for one fits and one wrong tied at the top', () => {
    const rankedGroups = [
      buildGroup('fits', 10),
      buildGroup('wrong', 10),
      buildGroup('wrong', 3),
    ];
    expect(computeTopOne({rankedGroups, label: 'Y1'})).toBe(0.5);
  });

  it('counts constant at the top as positive under Y2 only', () => {
    const rankedGroups = [
      buildGroup('fits', 10),
      buildGroup('wrong', 10),
      buildGroup('constant', 10),
      buildGroup('wrong', 5),
    ];
    expect(computeTopOne({rankedGroups, label: 'Y1'})).toBe(1 / 3);
    expect(computeTopOne({rankedGroups, label: 'Y2'})).toBe(2 / 3);
  });
});

describe('computeFirstPositiveRank', () => {
  const rankedGroups = [
    buildGroup('wrong', 9),
    buildGroup('fits', 5),
    buildGroup('wrong', 5),
    buildGroup('constant', 5),
    buildGroup('fits', 1),
  ];

  it('returns the expected rank and wrong groups above under Y1', () => {
    expect(computeFirstPositiveRank({rankedGroups, label: 'Y1'})).toEqual({
      firstPositiveRank: 1 + 4 / 2,
      negativesAbove: 1 + 1 / 2,
    });
  });

  it('returns the expected rank and wrong groups above under Y2', () => {
    expect(computeFirstPositiveRank({rankedGroups, label: 'Y2'})).toEqual({
      firstPositiveRank: 1 + 4 / 3,
      negativesAbove: 1 + 1 / 3,
    });
  });
});

describe('computeReciprocalRank', () => {
  it('averages over the positions inside a tied top block', () => {
    const rankedGroups = [buildGroup('fits', 4), buildGroup('wrong', 4)];
    expect(computeReciprocalRank({rankedGroups, label: 'Y1'})).toBe(0.75);
  });

  it('offsets the tied block by the groups above it', () => {
    const rankedGroups = [
      buildGroup('wrong', 9),
      buildGroup('fits', 5),
      buildGroup('wrong', 5),
      buildGroup('recap', 5),
    ];
    expect(computeReciprocalRank({rankedGroups, label: 'Y1'})).toBeCloseTo(
      (1 / 2 + 1 / 3 + 1 / 4) / 3,
      12,
    );
  });
});

describe('computeWorstError', () => {
  it('returns the share of wrong groups tied at the top', () => {
    const rankedGroups = [
      buildGroup('fits', 10),
      buildGroup('wrong', 10),
      buildGroup('constant', 10),
      buildGroup('wrong', 5),
    ];
    expect(computeWorstError({rankedGroups, label: 'Y1'})).toBe(1 / 3);
  });

  it('does not count an ignored class on top as an error', () => {
    const rankedGroups = [buildGroup('drift', 10), buildGroup('fits', 2)];
    expect(computeWorstError({rankedGroups, label: 'Y1'})).toBe(0);
  });
});

describe('countInvalidAbovePositive', () => {
  it('counts invalid groups above the best positive, ties as one half', () => {
    const rankedGroups = [
      buildGroup('fits', 5),
      buildGroup('fits', 2),
      buildGroup('wrong', 7, false),
      buildGroup('wrong', 5, false),
      buildGroup('wrong', 3, false),
      buildGroup('wrong', 9),
    ];
    expect(countInvalidAbovePositive({rankedGroups, label: 'Y1'})).toBe(1.5);
  });
});

describe('isInformativeVideo', () => {
  it('is true with a positive and a not-positive group', () => {
    const rankedGroups = [buildGroup('fits', 1), buildGroup('constant', 2)];
    expect(isInformativeVideo({rankedGroups, label: 'Y1'})).toBe(true);
  });

  it('is false when every group is positive', () => {
    const rankedGroups = [buildGroup('fits', 1), buildGroup('constant', 2)];
    expect(isInformativeVideo({rankedGroups, label: 'Y2'})).toBe(false);
  });

  it('is false without a positive group', () => {
    const rankedGroups = [buildGroup('wrong', 1), buildGroup('wrong', 2)];
    expect(isInformativeVideo({rankedGroups, label: 'Y1'})).toBe(false);
  });
});

describe('dropped groups', () => {
  const rankedGroups = [
    buildGroup('fits', -Infinity),
    buildGroup('wrong', 0),
    buildGroup('wrong', -Infinity),
  ];

  it('places a dropped positive below every kept group and ties it with the other dropped groups', () => {
    expect(computePairOrder({rankedGroups, label: 'Y1'})).toBe(0.25);
    expect(computeTopOne({rankedGroups, label: 'Y1'})).toBe(0);
    expect(computeFirstPositiveRank({rankedGroups, label: 'Y1'})).toEqual({
      firstPositiveRank: 1 + 3 / 2,
      negativesAbove: 1 + 1 / 2,
    });
  });

  it('ties every dropped group at the top when all are dropped', () => {
    const droppedGroups = [
      buildGroup('fits', -Infinity),
      buildGroup('wrong', -Infinity),
      buildGroup('wrong', -Infinity),
    ];
    expect(computePairOrder({rankedGroups: droppedGroups, label: 'Y1'})).toBe(
      0.5,
    );
    expect(computeTopOne({rankedGroups: droppedGroups, label: 'Y1'})).toBe(
      1 / 3,
    );
    expect(computeWorstError({rankedGroups: droppedGroups, label: 'Y1'})).toBe(
      2 / 3,
    );
  });
});

describe('undefined metrics', () => {
  it('returns null pair order when a label has no pair', () => {
    const rankedGroups = [buildGroup('fits', 3), buildGroup('constant', 2)];
    expect(computePairOrder({rankedGroups, label: 'Y1'})).toBeNull();
  });

  it('returns null positive-based metrics without a positive group', () => {
    const rankedGroups = [
      buildGroup('wrong', 3),
      buildGroup('wrong', 9, false),
    ];
    expect(computeFirstPositiveRank({rankedGroups, label: 'Y1'})).toBeNull();
    expect(computeReciprocalRank({rankedGroups, label: 'Y1'})).toBeNull();
    expect(countInvalidAbovePositive({rankedGroups, label: 'Y1'})).toBeNull();
  });

  it('returns null top metrics without a valid group', () => {
    const rankedGroups = [buildGroup('fits', 3, false)];
    expect(computeTopOne({rankedGroups, label: 'Y1'})).toBeNull();
    expect(computeWorstError({rankedGroups, label: 'Y1'})).toBeNull();
  });
});
