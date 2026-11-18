import {Enum} from 'enum-plus';

export const GLOBAL_RATE_LIMIT_SCOPE = '~global';

export const RateLimitKey = Enum({
  IP: 'ip',
  USER_CONFIG: 'user-config',
});

export const RateLimitPenalty = Enum({
  NONE: 'none',
  RENEW: 'renew',
  EXPONENTIAL: 'exponential',
});

export function toRateLimitKey({key, max, timeWindow, scope, identity}) {
  return `${key}:${max}/${timeWindow}:${scope}-${identity}`;
}

export const RATE_LIMIT_HEADER_VALUE = {
  'x-ratelimit-limit': result => result.max,
  'x-ratelimit-remaining': result => result.remaining,
  'x-ratelimit-reset': result => result.ttlInSeconds,
  'retry-after': result => result.ttlInSeconds,
};

export const RATE_LIMIT_HEADERS = Object.keys(RATE_LIMIT_HEADER_VALUE);
