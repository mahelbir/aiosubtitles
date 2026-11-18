import {describe, expect, it} from 'vitest';
import {
  toBudgetRecoveryWindowMs,
  toBudgetRequestMax,
} from '../../src/lib/subtitle-search/subtitle-source-budget.js';
import {SubtitleSourceBudgetScope} from '../../src/lib/subtitle-sources/subtitle-source-contract.js';

function makeBudget(windowMs, budgetScope) {
  return {
    budgetScope: budgetScope ?? SubtitleSourceBudgetScope.SUBTITLE_SOURCE,
    windowMs,
    requestMax: 10,
  };
}

describe('toBudgetRecoveryWindowMs', () => {
  it('recovers a minute budget over one minute', () => {
    expect(toBudgetRecoveryWindowMs([makeBudget(60000)])).toBe(60000);
  });

  it('recovers a daily budget over one hour at most', () => {
    expect(toBudgetRecoveryWindowMs([makeBudget(86400000)])).toBe(3600000);
  });

  it('recovers a source without a budget over the default window', () => {
    expect(toBudgetRecoveryWindowMs([])).toBe(60000);
  });

  it('takes the shortest declared window', () => {
    expect(
      toBudgetRecoveryWindowMs([
        makeBudget(86400000),
        makeBudget(600000, SubtitleSourceBudgetScope.CREDENTIAL),
      ]),
    ).toBe(600000);
  });

  it('never recovers faster than one minute', () => {
    expect(toBudgetRecoveryWindowMs([makeBudget(10000)])).toBe(60000);
  });
});

describe('toBudgetRequestMax', () => {
  it.each([
    [1, 1],
    [2, 1],
    [10, 5],
  ])(
    'gives the background at least one of %i requests',
    (requestMax, backgroundRequestMax) => {
      expect(
        toBudgetRequestMax({requestMax, budgetFactor: 1, isBackground: true}),
      ).toBe(backgroundRequestMax);
    },
  );

  it.each([1, 2, 10])(
    'keeps the whole window of %i requests for the viewer',
    requestMax => {
      expect(
        toBudgetRequestMax({requestMax, budgetFactor: 1, isBackground: false}),
      ).toBe(requestMax);
    },
  );

  it('leaves the background nothing when the breaker leaves the viewer nothing', () => {
    expect(
      toBudgetRequestMax({
        requestMax: 1,
        budgetFactor: 0.5,
        isBackground: true,
      }),
    ).toBe(0);
  });
});
