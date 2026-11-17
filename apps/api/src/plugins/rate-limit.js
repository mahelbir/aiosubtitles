import fp from 'fastify-plugin';
import rateLimit, {normalizeIP} from '@fastify/rate-limit';
import LocalStore from '@fastify/rate-limit/store/LocalStore.js';
import RedisStore from '@fastify/rate-limit/store/RedisStore.js';
import {promiseSilent} from 'melperjs';
import proxyAddr from 'proxy-addr';
import {config} from '../config/index.js';
import {tooManyRequests} from '../lib/errors.js';
import {
  GLOBAL_RATE_LIMIT_SCOPE,
  RATE_LIMIT_HEADER_VALUE,
  RateLimitKey,
  RateLimitPenalty,
  toRateLimitKey,
} from '../lib/rate-limit.js';
import {redis} from '../redis/index.js';

const toAddress = request =>
  normalizeIP(request.clientIp, config.clientIpv6Subnet);

const IDENTIFY = {
  [RateLimitKey.IP]: toAddress,
  [RateLimitKey.USER]: request => request.auth?.id ?? toAddress(request),
};

const PHASE = {
  [RateLimitKey.IP]: 'onRequest',
  [RateLimitKey.USER]: 'preHandler',
};

const STORE_FLAGS = {
  [RateLimitPenalty.NONE]: {},
  [RateLimitPenalty.RENEW]: {continueExceeding: true},
  [RateLimitPenalty.EXPONENTIAL]: {exponentialBackoff: true},
};

const isAllowListed = proxyAddr.compile(config.rateLimitAllowList);

const isTrusted = request => isAllowListed(request.clientIp, 0);

const isSkipped = async request =>
  (await request.routeOptions.config?.skipRateLimit?.(request)) === true;

const isExempt = async request =>
  isTrusted(request) || (await isSkipped(request));

const isGlobalSkipped = async request =>
  (await request.routeOptions.config?.skipGlobalRateLimit?.(request)) === true;

const DEFAULT_PENALTY = {
  [RateLimitKey.IP]: config.rateLimitIpPenalty,
  [RateLimitKey.USER]: config.rateLimitUserPenalty,
};

const NAMESPACE = 'rate:';

const DEGRADED_LOG_WINDOW = 60000;

const PENALTY_CEILING = 3600000;

const REFUND_SCRIPT = `
  local current = tonumber(redis.call('GET', KEYS[1]))
  if not current then
    return 0
  end
  if current <= 1 then
    redis.call('DEL', KEYS[1])
    return 0
  end
  return redis.call('DECR', KEYS[1])
`;

let log = null;
let degradedAt = 0;

function reportDegraded(error) {
  const now = Date.now();
  if (now - degradedAt < DEGRADED_LOG_WINDOW) {
    return;
  }
  degradedAt = now;
  log?.warn(
    {err: error},
    'Rate limit store unreachable, counting in memory per process',
  );
}

class RateLimitStore extends RedisStore {
  constructor({continueExceeding, exponentialBackoff}) {
    super(continueExceeding, exponentialBackoff, redis, NAMESPACE);
    this._local = new LocalStore(continueExceeding, exponentialBackoff);
    if (!this.redis.rateLimitRefund) {
      this.redis.defineCommand('rateLimitRefund', {
        numberOfKeys: 1,
        lua: REFUND_SCRIPT,
      });
    }
  }

  async refund(key, timeWindow) {
    try {
      await this.redis.rateLimitRefund(`${this.key}${key}`);
    } catch (error) {
      reportDegraded(error);
      this._refundLocally(key, timeWindow);
    }
  }

  _refundLocally(key, timeWindow) {
    const entry = this._local.lru.get(key);
    if (!entry || entry.iterationStartMs + timeWindow <= Date.now()) {
      return;
    }
    if (entry.current <= 1) {
      this._local.lru.delete(key);
      return;
    }
    entry.current -= 1;
  }

  incr(key, cb, timeWindow, max) {
    this._count('incr', key, cb, timeWindow, max);
  }

  read(key, cb, timeWindow, max) {
    this._count('read', key, cb, timeWindow, max);
  }

  _count(method, key, cb, timeWindow, max) {
    super[method](
      key,
      (error, result) => {
        if (!error) {
          cb(
            null,
            method === 'incr'
              ? this._capPenalty(key, result, timeWindow)
              : result,
          );
          return;
        }
        reportDegraded(error);
        this._local[method](key, cb, timeWindow, max);
      },
      timeWindow,
      max,
    );
  }

  _capPenalty(key, result, timeWindow) {
    const ceiling = Math.max(PENALTY_CEILING, timeWindow);
    if (result.ttl <= ceiling) {
      return result;
    }
    promiseSilent(this.redis.pexpire(`${this.key}${key}`, ceiling, 'LT'));
    return {...result, ttl: ceiling};
  }

  child(params) {
    const store = new RateLimitStore(params);
    params.onStore?.(store);
    return store;
  }
}

const STORE = {
  store: RateLimitStore,
  global: false,
  skipOnError: true,
};

const ALLOWED = {isAllowed: true};

const ROUTELESS = Object.freeze({config: Object.freeze({})});

export const toRateLimitSubject = clientIp => ({
  clientIp,
  routeOptions: ROUTELESS,
});

const isExclusive = request => {
  const {rateLimits, exclusiveRateLimits} = request.routeOptions.config ?? {};
  return exclusiveRateLimits === true && rateLimits?.length > 0;
};

const asArray = value => (value ? [value].flat() : []);

const scopeMethodOf = request =>
  request.method === 'HEAD' ? 'GET' : request.method;

const scopeOf = (request, scope) =>
  scope ?? `${scopeMethodOf(request)}${request.routeOptions.url}`;

function publish(reply, result) {
  if (!config.isRateLimitHeadersEnabled) {
    return;
  }
  for (const [name, value] of Object.entries(RATE_LIMIT_HEADER_VALUE)) {
    reply.header(name, value(result));
  }
}

function remember(request, result) {
  const narrowest = request.rateLimit;
  if (!narrowest || result.remaining < narrowest.remaining) {
    request.rateLimit = result;
  }
}

function toHook(checks) {
  return async function enforceRateLimits(request, reply) {
    for (const check of checks) {
      const result = await check(request);
      if (result.isAllowed) {
        continue;
      }
      if (result.isExceeded) {
        await request.routeOptions.config?.onRateLimited?.(request, result);
        publish(reply, result);
        return reply.respond(tooManyRequests());
      }
      remember(request, result);
    }
  };
}

export default fp(
  async function rateLimitPlugin(fastify) {
    fastify.decorateRequest('rateLimit', null);

    if (config.rateLimitWindow === 0) {
      fastify.decorate('rateLimiter', () =>
        Object.assign(async () => ALLOWED, {
          reset: async () => {},
          refund: async () => {},
        }),
      );
      return;
    }

    log = fastify.log;

    let isBooted = false;
    fastify.addHook('onReady', async () => {
      isBooted = true;
    });

    if (config.isRateLimitHeadersEnabled) {
      fastify.addHook('onSend', async (request, reply, payload) => {
        const narrowest = request.rateLimit;
        const published = Number(reply.getHeader('x-ratelimit-remaining'));
        if (narrowest && !(published < narrowest.remaining)) {
          publish(reply, narrowest);
        }
        return payload;
      });
    }

    await fastify.register(rateLimit, STORE);

    fastify.decorate(
      'rateLimiter',
      ({max, timeWindow, key = RateLimitKey.IP, scope, identify, penalty}) => {
        if (isBooted) {
          throw new Error(
            'rateLimiter() builds a counter and must run while routes register, not inside a handler.',
          );
        }
        const toKey = request =>
          toRateLimitKey({
            key,
            max,
            timeWindow,
            scope: scopeOf(request, scope),
            identity: identify?.(request) ?? IDENTIFY[key](request),
          });
        let store = null;
        const limit = fastify.createRateLimit({
          allowList: isExempt,
          ...STORE_FLAGS[penalty ?? DEFAULT_PENALTY[key]],
          max,
          timeWindow,
          keyGenerator: toKey,
          onStore: created => {
            store = created;
          },
        });
        limit.reset = request => redis.del(`${NAMESPACE}${toKey(request)}`);
        limit.refund = request => store.refund(toKey(request), timeWindow);
        return limit;
      },
    );

    const toGlobalHook = (key, max, applies) => {
      const limit = fastify.rateLimiter({
        key,
        max,
        timeWindow: config.rateLimitWindow,
        scope: GLOBAL_RATE_LIMIT_SCOPE,
      });
      return toHook([
        async request =>
          applies(request) &&
          !isExclusive(request) &&
          !(await isGlobalSkipped(request))
            ? limit(request)
            : ALLOWED,
      ]);
    };

    fastify.addHook(
      PHASE[RateLimitKey.IP],
      toGlobalHook(RateLimitKey.IP, config.rateLimitIpMax, () => true),
    );
    fastify.addHook(
      PHASE[RateLimitKey.USER],
      toGlobalHook(RateLimitKey.USER, config.rateLimitUserMax, request =>
        Boolean(request.auth),
      ),
    );

    fastify.addHook('onRoute', route => {
      const windows = route.config?.rateLimits;
      if (!windows?.length) {
        return;
      }
      const {rateLimitGroup} = route.config;
      const checks = {onRequest: [], preHandler: []};
      for (const window of windows) {
        const {key = RateLimitKey.IP} = window;
        checks[PHASE[key]].push(
          fastify.rateLimiter({...window, scope: rateLimitGroup}),
        );
      }
      if (checks.onRequest.length > 0) {
        route.onRequest = [
          toHook(checks.onRequest),
          ...asArray(route.onRequest),
        ];
      }
      if (checks.preHandler.length > 0) {
        route.preHandler = [
          ...asArray(route.preHandler),
          toHook(checks.preHandler),
        ];
      }
    });
  },
  {name: 'rate-limit'},
);
