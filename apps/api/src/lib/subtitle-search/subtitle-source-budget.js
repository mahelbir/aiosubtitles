import {clamp} from 'es-toolkit';
import {config} from '../../config/index.js';
import {redis} from '../../redis/index.js';
import {SubtitleSourceBudgetScope} from '../subtitle-sources/subtitle-source-contract.js';
import {
  BUDGET_FACTOR_RECOVERY_WINDOW_MAX_MS,
  BUDGET_FACTOR_RECOVERY_WINDOW_MIN_MS,
  readSubtitleSourceBreaker,
} from './subtitle-source-breaker.js';

export const DEFAULT_DOWNLOAD_BUDGET = Object.freeze({
  budgetScope: SubtitleSourceBudgetScope.SUBTITLE_SOURCE,
  windowMs: 60000,
  requestMax: 10,
});

const BUDGET_PREFIX = 'subtitle-source-budget:v1:';

redis.defineCommand('spendSubtitleSourceBudget', {
  lua: `
    for budgetIndex, budgetKey in ipairs(KEYS) do
      local spentCount = tonumber(redis.call('GET', budgetKey)) or 0
      if spentCount + 1 > tonumber(ARGV[budgetIndex * 2 - 1]) then
        return 0
      end
    end
    for budgetIndex, budgetKey in ipairs(KEYS) do
      if redis.call('INCR', budgetKey) == 1 then
        redis.call('PEXPIRE', budgetKey, ARGV[budgetIndex * 2])
      end
    end
    return 1
  `,
});

function toBudgetKey({
  subtitleSource,
  budgetScope,
  credentialId,
  budgetWindow,
}) {
  return budgetScope === SubtitleSourceBudgetScope.CREDENTIAL
    ? `${BUDGET_PREFIX}${subtitleSource}:credential:${credentialId}:${budgetWindow}`
    : `${BUDGET_PREFIX}${subtitleSource}:${budgetWindow}`;
}

export function toBudgetRecoveryWindowMs(downloadBudgets) {
  const declaredBudgets =
    downloadBudgets.length > 0 ? downloadBudgets : [DEFAULT_DOWNLOAD_BUDGET];
  return clamp(
    Math.min(...declaredBudgets.map(({windowMs}) => windowMs)),
    BUDGET_FACTOR_RECOVERY_WINDOW_MIN_MS,
    BUDGET_FACTOR_RECOVERY_WINDOW_MAX_MS,
  );
}

export async function spendSubtitleSourceBudget({
  client,
  credentialId,
  isBackground,
  nowMs,
}) {
  const declaredBudgets = client.downloadBudgets.filter(
    ({budgetScope}) =>
      budgetScope !== SubtitleSourceBudgetScope.CREDENTIAL || credentialId,
  );
  const hasSubtitleSourceBudget = declaredBudgets.some(
    ({budgetScope}) =>
      budgetScope === SubtitleSourceBudgetScope.SUBTITLE_SOURCE,
  );
  const spentBudgets = hasSubtitleSourceBudget
    ? declaredBudgets
    : [DEFAULT_DOWNLOAD_BUDGET, ...declaredBudgets];
  const {budgetFactor} = await readSubtitleSourceBreaker(
    client.subtitleSource,
    nowMs,
    toBudgetRecoveryWindowMs(client.downloadBudgets),
  );
  const budgetShare = isBackground ? config.subtitleSourceBackgroundShare : 1;
  const budgetKeys = spentBudgets.map(({budgetScope, windowMs}) =>
    toBudgetKey({
      subtitleSource: client.subtitleSource,
      budgetScope,
      credentialId,
      budgetWindow: Math.floor(nowMs / windowMs),
    }),
  );
  const budgetArguments = spentBudgets.flatMap(({windowMs, requestMax}) => [
    Math.floor(requestMax * budgetFactor * budgetShare),
    windowMs,
  ]);
  const isSpent = await redis.spendSubtitleSourceBudget(
    budgetKeys.length,
    ...budgetKeys,
    ...budgetArguments,
  );
  return isSpent === 1;
}
