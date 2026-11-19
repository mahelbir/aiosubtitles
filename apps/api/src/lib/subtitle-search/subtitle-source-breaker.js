import {redis} from '../../redis/index.js';

export const BUDGET_FACTOR_MIN = 0.125;

export const BUDGET_FACTOR_RECOVERY_WINDOW_MIN_MS = 60000;

export const BUDGET_FACTOR_RECOVERY_WINDOW_MAX_MS = 3600000;

const BREAKER_PREFIX = 'subtitle-source-breaker:v1:';
const KEYLESS_BREAKER_SUFFIX = ':keyless';
const BUDGET_FACTOR_RECOVERY_WINDOWS = Math.log2(1 / BUDGET_FACTOR_MIN);

const READ_BREAKER_LUA = `
  local nowMs = tonumber(ARGV[1])
  local recoveryWindowMs = tonumber(ARGV[2])
  local breakerUntil = 0
  local budgetFactor = 1
  local stored = redis.call('GET', KEYS[1])
  if stored then
    local breaker = cjson.decode(stored)
    breakerUntil = breaker.breakerUntil
    budgetFactor = breaker.budgetFactor
    if nowMs >= breakerUntil then
      local recoveredWindows = math.floor((nowMs - breakerUntil) / recoveryWindowMs)
      budgetFactor = math.min(1, budgetFactor * 2 ^ recoveredWindows)
    end
  end
`;

redis.defineCommand('readSubtitleSourceBreaker', {
  numberOfKeys: 1,
  lua: `${READ_BREAKER_LUA}
    return {tostring(breakerUntil), tostring(budgetFactor)}
  `,
});

redis.defineCommand('openSubtitleSourceBreaker', {
  numberOfKeys: 1,
  lua: `${READ_BREAKER_LUA}
    local retryAfterMs = tonumber(ARGV[3])
    local budgetFactorMin = tonumber(ARGV[4])
    local recoveryWindows = tonumber(ARGV[5])
    if nowMs >= breakerUntil then
      budgetFactor = math.max(budgetFactorMin, budgetFactor * 0.5)
    end
    breakerUntil = math.max(breakerUntil, nowMs + retryAfterMs)
    redis.call('SET', KEYS[1],
      cjson.encode({breakerUntil = breakerUntil, budgetFactor = budgetFactor}),
      'PX', math.floor(breakerUntil - nowMs + recoveryWindowMs * recoveryWindows) + 1)
    return 1
  `,
});

function toBreakerKey(subtitleSource, isKeylessOnly = false) {
  return `${BREAKER_PREFIX}${subtitleSource}${isKeylessOnly ? KEYLESS_BREAKER_SUFFIX : ''}`;
}

async function readBreaker(breakerKey, nowMs, recoveryWindowMs) {
  const [breakerUntil, budgetFactor] = await redis.readSubtitleSourceBreaker(
    breakerKey,
    nowMs,
    recoveryWindowMs,
  );
  return {
    isOpen: nowMs < Number(breakerUntil),
    budgetFactor: Number(budgetFactor),
  };
}

export async function openSubtitleSourceBreaker({
  subtitleSource,
  retryAfterMs,
  nowMs,
  recoveryWindowMs = BUDGET_FACTOR_RECOVERY_WINDOW_MIN_MS,
  isKeylessOnly = false,
}) {
  await redis.openSubtitleSourceBreaker(
    toBreakerKey(subtitleSource, isKeylessOnly),
    nowMs,
    recoveryWindowMs,
    retryAfterMs,
    BUDGET_FACTOR_MIN,
    BUDGET_FACTOR_RECOVERY_WINDOWS,
  );
}

export function readSubtitleSourceBreaker(
  subtitleSource,
  nowMs,
  recoveryWindowMs = BUDGET_FACTOR_RECOVERY_WINDOW_MIN_MS,
) {
  return readBreaker(toBreakerKey(subtitleSource), nowMs, recoveryWindowMs);
}

export async function readSubtitleSourceBreakers(
  client,
  nowMs,
  recoveryWindowMs = BUDGET_FACTOR_RECOVERY_WINDOW_MIN_MS,
) {
  const [keyedCall, keylessOnly] = await Promise.all([
    readSubtitleSourceBreaker(client.subtitleSource, nowMs, recoveryWindowMs),
    client.isKeylessLimitSeparate
      ? readBreaker(
          toBreakerKey(client.subtitleSource, true),
          nowMs,
          recoveryWindowMs,
        )
      : null,
  ]);
  return {
    keyedCall,
    keylessCall: keylessOnly
      ? {
          isOpen: keyedCall.isOpen || keylessOnly.isOpen,
          budgetFactor: Math.min(
            keyedCall.budgetFactor,
            keylessOnly.budgetFactor,
          ),
        }
      : keyedCall,
  };
}

export function pickCallBreaker({keyedCall, keylessCall}, {isKeylessCall}) {
  return isKeylessCall ? keylessCall : keyedCall;
}
