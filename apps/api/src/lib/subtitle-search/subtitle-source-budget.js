import {clamp, partition} from 'es-toolkit';
import {config} from '../../config/index.js';
import {redis} from '../../redis/index.js';
import {SubtitleSourceBudgetScope} from '../subtitle-sources/subtitle-source-contract.js';
import {
  BUDGET_FACTOR_RECOVERY_WINDOW_MAX_MS,
  BUDGET_FACTOR_RECOVERY_WINDOW_MIN_MS,
  pickCallBreaker,
  readSubtitleSourceBreakers,
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
        return -budgetIndex
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

export function toBudgetRequestMax({requestMax, budgetFactor, isBackground}) {
  const viewerRequestMax = Math.floor(requestMax * budgetFactor);
  if (!isBackground || viewerRequestMax < 1) {
    return viewerRequestMax;
  }
  return Math.max(
    1,
    Math.floor(requestMax * budgetFactor * config.subtitleBackgroundRateShare),
  );
}

function listSpentBudgets(downloadBudgets, credentialId) {
  const [credentialBudgets, sourceBudgets] = partition(
    downloadBudgets,
    ({budgetScope}) => budgetScope === SubtitleSourceBudgetScope.CREDENTIAL,
  );
  if (credentialId && credentialBudgets.length > 0) {
    return credentialBudgets;
  }
  return sourceBudgets.length > 0 ? sourceBudgets : [DEFAULT_DOWNLOAD_BUDGET];
}

export async function spendSubtitleSourceBudget(spendOptions) {
  const {isSpent} = await trySpendSubtitleSourceBudget(spendOptions);
  return isSpent;
}

export async function trySpendSubtitleSourceBudget({
  client,
  credentialId,
  isBackground,
  nowMs = Date.now(),
}) {
  const spentBudgets = listSpentBudgets(client.downloadBudgets, credentialId);
  const {budgetFactor} = pickCallBreaker(
    await readSubtitleSourceBreakers(
      client,
      nowMs,
      toBudgetRecoveryWindowMs(client.downloadBudgets),
    ),
    {isKeylessCall: !credentialId},
  );
  const budgetKeys = spentBudgets.map(({budgetScope, windowMs}) =>
    toBudgetKey({
      subtitleSource: client.subtitleSource,
      budgetScope,
      credentialId,
      budgetWindow: Math.floor(nowMs / windowMs),
    }),
  );
  const budgetArguments = spentBudgets.flatMap(({windowMs, requestMax}) => [
    toBudgetRequestMax({requestMax, budgetFactor, isBackground}),
    windowMs,
  ]);
  const spendAnswer = await redis.spendSubtitleSourceBudget(
    budgetKeys.length,
    ...budgetKeys,
    ...budgetArguments,
  );
  if (spendAnswer === 1) {
    return {
      isSpent: true,
      refusedWindowMs: null,
      refusedRequestMax: null,
      retryAtMs: null,
    };
  }
  const refusedIndex = -spendAnswer - 1;
  const {windowMs} = spentBudgets[refusedIndex];
  return {
    isSpent: false,
    refusedWindowMs: windowMs,
    refusedRequestMax: budgetArguments[refusedIndex * 2],
    retryAtMs: (Math.floor(nowMs / windowMs) + 1) * windowMs,
  };
}
