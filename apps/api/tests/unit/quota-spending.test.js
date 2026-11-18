import {describe, expect, it} from 'vitest';
import {isQuotaSpendAllowed} from '../../src/lib/subtitle-background/quota-spending.js';

function makeQuotaCheck(quotaRemainingCount, quotaAllowedCount) {
  return {quotaRemainingCount, quotaAllowedCount};
}

describe('isQuotaSpendAllowed', () => {
  it('refuses when the remaining quota equals the viewer share', () => {
    expect(
      isQuotaSpendAllowed({
        quotaChecks: [makeQuotaCheck(10, 20)],
        viewerShare: 0.5,
      }),
    ).toBe(false);
  });

  it('allows when the remaining quota is above the viewer share', () => {
    expect(
      isQuotaSpendAllowed({
        quotaChecks: [makeQuotaCheck(11, 20)],
        viewerShare: 0.5,
      }),
    ).toBe(true);
  });

  it('sums every account before comparing', () => {
    expect(
      isQuotaSpendAllowed({
        quotaChecks: [makeQuotaCheck(5, 20), makeQuotaCheck(30, 1000)],
        viewerShare: 0.5,
      }),
    ).toBe(false);
  });

  it('allows the summed accounts once they pass the viewer share', () => {
    expect(
      isQuotaSpendAllowed({
        quotaChecks: [makeQuotaCheck(15, 20), makeQuotaCheck(500, 1000)],
        viewerShare: 0.5,
      }),
    ).toBe(true);
  });
});
