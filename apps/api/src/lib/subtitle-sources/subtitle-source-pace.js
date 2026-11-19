import {redis} from '../../redis/index.js';

const PACE_PREFIX = 'subtitle-source-pace:v1:';

redis.defineCommand('reserveSubtitleSourcePace', {
  numberOfKeys: 1,
  lua: `
    local nowMs = tonumber(ARGV[1])
    local intervalMs = tonumber(ARGV[2])
    local burstMs = tonumber(ARGV[3])
    local waitMaxMs = tonumber(ARGV[4])
    local callCount = tonumber(ARGV[5])
    local plannedCallCount = tonumber(ARGV[6])
    local startMs = math.max(tonumber(redis.call('GET', KEYS[1]) or nowMs), nowMs)
    local function toCallWait(callIndex)
      return math.max(0, startMs + (callIndex - 1) * intervalMs - burstMs - nowMs)
    end
    if toCallWait(plannedCallCount) > waitMaxMs then
      return false
    end
    local callWaits = {}
    for callIndex = 1, callCount do
      callWaits[callIndex] = toCallWait(callIndex)
    end
    local nextMs = startMs + callCount * intervalMs
    redis.call('SET', KEYS[1], nextMs, 'PX', nextMs - nowMs)
    return callWaits
  `,
});

export function reserveSubtitleSourcePace({
  subtitleSource,
  intervalMs,
  burstMax,
  waitMaxMs,
  callCount,
  plannedCallCount = callCount,
  nowMs = Date.now(),
}) {
  return redis.reserveSubtitleSourcePace(
    `${PACE_PREFIX}${subtitleSource}`,
    nowMs,
    intervalMs,
    (burstMax - 1) * intervalMs,
    waitMaxMs,
    callCount,
    Math.max(callCount, plannedCallCount),
  );
}
