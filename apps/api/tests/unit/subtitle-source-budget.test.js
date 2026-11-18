import {describe, expect, it} from 'vitest';
import {toBudgetRecoveryWindowMs} from '../../src/lib/subtitle-search/subtitle-source-budget.js';
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
