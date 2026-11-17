import {setTimeout} from 'node:timers/promises';
import {afterEach, describe, expect, it} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {config} from '../../src/config/index.js';
import {
  GLOBAL_RATE_LIMIT_SCOPE,
  RateLimitKey,
  RateLimitPenalty,
} from '../../src/lib/rate-limit.js';
import {redis} from '../../src/redis/index.js';
import {tooManyRequests} from '../../src/lib/errors.js';
import {readEnvelope} from '../helpers/assertions.js';
import {
  asCaller,
  buildProbe,
  callerOf,
  closeProbes,
} from '../helpers/rate-limit-probe.js';

const TWO_PER_MINUTE = [{max: 2, timeWindow: 60000}];
const PENALTY_CEILING = 3600000;
const OK = StatusCodes.OK;
const LIMITED = StatusCodes.TOO_MANY_REQUESTS;

const call = (app, path, options = {}) =>
  app.inject({method: 'GET', url: path, ...options});

async function codes(app, path, times, options = {}) {
  const seen = [];
  for (let index = 0; index < times; index += 1) {
    seen.push((await call(app, path, options)).statusCode);
  }
  return seen;
}

const NAMESPACE = 'rate:';
const GLOBAL = `:${GLOBAL_RATE_LIMIT_SCOPE}-`;

const bucketsOf = async (pattern = '*') =>
  (await redis.keys(`${NAMESPACE}${pattern}`))
    .sort()
    .map(key => key.slice(NAMESPACE.length));

const globalBuckets = async key =>
  (await bucketsOf(`${key}:*${GLOBAL}*`)).map(
    bucket => bucket.split(GLOBAL)[1],
  );

const routeBuckets = async (pattern = '*') =>
  (await bucketsOf(pattern)).filter(bucket => !bucket.includes(GLOBAL));

const soleRouteKey = async () => `${NAMESPACE}${(await routeBuckets())[0]}`;

const STORE_COMMANDS = ['rateLimit', 'rateLimitRefund'];

async function whileStoreIsDown(run) {
  const reachable = STORE_COMMANDS.map(name => redis[name]);
  for (const name of STORE_COMMANDS) {
    redis[name] = (...args) => {
      const callback = args.at(-1);
      const error = new Error('redis down');
      return typeof callback === 'function'
        ? callback(error)
        : Promise.reject(error);
    };
  }
  try {
    return await run();
  } finally {
    STORE_COMMANDS.forEach((name, index) => {
      redis[name] = reachable[index];
    });
  }
}

function refunding() {
  return {
    path: '/act',
    handler: app => {
      const rate = app.rateLimiter({max: 2, timeWindow: 60000});
      return async (request, reply) => {
        const status = await rate(request);
        if (status.isExceeded) {
          return reply.respond(tooManyRequests());
        }
        for (
          let index = 0;
          index < Number(request.query.refund ?? 0);
          index += 1
        ) {
          await rate.refund(request);
        }
        return reply.success();
      };
    },
  };
}

afterEach(closeProbes);

describe('a route that declares nothing', () => {
  it('rides the shared address budget', async () => {
    const {app} = await buildProbe([{path: '/plain'}]);

    const seen = await codes(app, '/plain', config.rateLimitIpMax + 1);

    expect(seen.at(-1)).toBe(LIMITED);
    expect(seen.filter(code => code === OK)).toHaveLength(
      config.rateLimitIpMax,
    );
  });

  it('spends one address bucket across every path', async () => {
    const {app} = await buildProbe([{path: '/one'}, {path: '/two'}]);

    await call(app, '/one');
    await call(app, '/two');

    expect(await globalBuckets(RateLimitKey.IP)).toEqual(['127.0.0.1']);
  });

  it('treats one IPv6 allocation as one caller', async () => {
    const {app} = await buildProbe([
      {path: '/tight', config: {rateLimits: TWO_PER_MINUTE}},
    ]);
    const inBlock = ['2001:db8:1:2:aaaa::1', '2001:db8:1:2:ffff::9'];

    const seen = [];
    for (const address of [...inBlock, inBlock[0]]) {
      seen.push(
        (await call(app, '/tight', {remoteAddress: address})).statusCode,
      );
    }
    const neighbour = await call(app, '/tight', {
      remoteAddress: '2001:db8:1:3:aaaa::1',
    });

    expect(seen).toEqual([OK, OK, LIMITED]);
    expect(neighbour.statusCode).toBe(OK);
  });

  it('keeps one address clear of another', async () => {
    const {app} = await buildProbe([{path: '/plain'}]);

    await codes(app, '/plain', config.rateLimitIpMax + 1);
    const elsewhere = await call(app, '/plain', {remoteAddress: '10.0.0.9'});

    expect(elsewhere.statusCode).toBe(OK);
  });
});

describe('an address the edge reports in a header', () => {
  const edge = address => ({[config.clientIpHeader]: address});

  it('counts the reported caller, not the socket it arrived on', async () => {
    const {app} = await buildProbe([
      {path: '/tight', config: {rateLimits: TWO_PER_MINUTE}},
    ]);
    const proxied = {remoteAddress: '10.0.0.1'};

    const seen = await codes(app, '/tight', 3, {
      ...proxied,
      headers: edge('203.0.113.7'),
    });
    const other = await call(app, '/tight', {
      ...proxied,
      headers: edge('203.0.113.8'),
    });

    expect(seen).toEqual([OK, OK, LIMITED]);
    expect(other.statusCode).toBe(OK);
    expect(await globalBuckets(RateLimitKey.IP)).toEqual([
      '203.0.113.7',
      '203.0.113.8',
    ]);
  });

  it('falls back to the socket when the header is absent', async () => {
    const {app} = await buildProbe([{path: '/plain'}]);

    await call(app, '/plain', {remoteAddress: '10.0.0.1'});

    expect(await globalBuckets(RateLimitKey.IP)).toEqual(['10.0.0.1']);
  });

  it.each([
    ['an IPv4 caller', '203.0.113.7:8080', '203.0.113.7'],
    ['an IPv6 caller', '[2001:db8:1:2::7]:443', '2001:db8:1:2::'],
  ])('strips the port the edge wrote for %s', async (_name, value, bucket) => {
    const {app} = await buildProbe([{path: '/plain'}]);

    await call(app, '/plain', {headers: edge(value)});

    expect(await globalBuckets(RateLimitKey.IP)).toEqual([bucket]);
  });

  it.each(['not-an-ip', '1.2.3.4, not-an-ip', '203.0.113.7:port', '[::1]'])(
    'falls back to the socket when the edge wrote %j',
    async value => {
      const {app} = await buildProbe([{path: '/plain'}]);

      await call(app, '/plain', {
        remoteAddress: '10.0.0.1',
        headers: edge(value),
      });

      expect(await globalBuckets(RateLimitKey.IP)).toEqual(['10.0.0.1']);
    },
  );

  it('keys a socket that reports no address as one empty identity', async () => {
    const {app} = await buildProbe([{path: '/plain'}]);

    await call(app, '/plain', {remoteAddress: 'Not-An-Address'});

    expect(await globalBuckets(RateLimitKey.IP)).toEqual(['']);
  });

  it('ignores what a caller prefixed to the entry the edge wrote', async () => {
    const {app} = await buildProbe([{path: '/plain'}]);

    await call(app, '/plain', {headers: edge('1.2.3.4, 203.0.113.7')});

    expect(await globalBuckets(RateLimitKey.IP)).toEqual(['203.0.113.7']);
  });

  it('holds a caller to one bucket however it dresses the header', async () => {
    const {app} = await buildProbe([
      {path: '/tight', config: {rateLimits: TWO_PER_MINUTE}},
    ]);

    const seen = [];
    for (const forged of ['1.1.1.1', '2.2.2.2', '3.3.3.3']) {
      seen.push(
        (await call(app, '/tight', {headers: edge(`${forged}, 203.0.113.7`)}))
          .statusCode,
      );
    }

    expect(seen).toEqual([OK, OK, LIMITED]);
  });

  it('folds a reported IPv6 caller to its allocation', async () => {
    const {app} = await buildProbe([
      {path: '/tight', config: {rateLimits: TWO_PER_MINUTE}},
    ]);

    const seen = [];
    for (const address of [
      '2001:db8:1:2:aaaa::1',
      '2001:db8:1:2:ffff::9',
      '2001:db8:1:2:cccc::5',
    ]) {
      seen.push(
        (await call(app, '/tight', {headers: edge(address)})).statusCode,
      );
    }

    expect(seen).toEqual([OK, OK, LIMITED]);
  });

  it('still waves through a trusted caller the edge reports', async () => {
    const {app} = await buildProbe([
      {path: '/tight', config: {rateLimits: TWO_PER_MINUTE}},
    ]);

    const seen = await codes(app, '/tight', 4, {
      headers: edge(config.rateLimitAllowList[0]),
    });

    expect(seen).toEqual([OK, OK, OK, OK]);
    expect(await redis.keys('rate:*')).toEqual([]);
  });
});

describe('a path that matches no route', () => {
  it('answers not found while the address budget holds', async () => {
    const {app} = await buildProbe([{path: '/plain'}]);

    const missing = await call(app, '/nowhere');

    expect(missing.statusCode).toBe(StatusCodes.NOT_FOUND);
  });

  it('is charged to the address bucket the routes already share', async () => {
    const {app} = await buildProbe([{path: '/plain'}]);

    await call(app, '/plain');
    await call(app, '/nowhere');

    expect(await globalBuckets(RateLimitKey.IP)).toEqual(['127.0.0.1']);
  });

  it('shares that budget rather than opening one beside it', async () => {
    const {app} = await buildProbe([{path: '/plain'}]);

    await codes(app, '/plain', config.rateLimitIpMax);
    const missing = await call(app, '/nowhere');

    expect(missing.statusCode).toBe(LIMITED);
  });

  it('stops answering once a prober spends it', async () => {
    const {app} = await buildProbe([{path: '/plain'}]);

    const seen = await codes(app, '/nowhere', config.rateLimitIpMax + 1);

    expect(seen.at(-1)).toBe(LIMITED);
    expect(seen.filter(code => code === StatusCodes.NOT_FOUND)).toHaveLength(
      config.rateLimitIpMax,
    );
  });
});

describe('a route that declares its own windows', () => {
  it('enforces the window it named', async () => {
    const {app} = await buildProbe([
      {path: '/tight', config: {rateLimits: TWO_PER_MINUTE}},
    ]);

    expect(await codes(app, '/tight', 3)).toEqual([OK, OK, LIMITED]);
  });

  it.each([
    ['the burst window answers first', 2, [OK, OK, LIMITED]],
    ['the wider window answers first', 5, [OK, OK, OK, LIMITED, LIMITED]],
  ])('%s', async (_name, burst, expected) => {
    const {app} = await buildProbe([
      {
        path: '/paired',
        config: {
          rateLimits: [
            {max: burst, timeWindow: 1000},
            {max: 3, timeWindow: 60000},
          ],
        },
      },
    ]);

    expect(await codes(app, '/paired', expected.length)).toEqual(expected);
  });

  it('counts every window it named, not only the one that refused', async () => {
    const {app} = await buildProbe([
      {
        path: '/paired',
        config: {
          rateLimits: [
            {max: 1, timeWindow: 1000},
            {max: 9, timeWindow: 60000},
          ],
        },
      },
    ]);

    await call(app, '/paired');

    expect(await routeBuckets()).toEqual([
      'ip:1/1000:GET/paired-127.0.0.1',
      'ip:9/60000:GET/paired-127.0.0.1',
    ]);
  });

  it('lets a spent window run down while it keeps being knocked on', async () => {
    const {app} = await buildProbe([
      {path: '/tight', config: {rateLimits: [{max: 1, timeWindow: 2000}]}},
    ]);

    await codes(app, '/tight', 2);
    const key = await soleRouteKey();
    const opened = await redis.pttl(key);

    await setTimeout(300);
    await call(app, '/tight');
    const afterKnocking = await redis.pttl(key);

    expect(afterKnocking).toBeLessThanOrEqual(opened - 250);
  });

  it('spends one budget whether a caller asks with GET or HEAD', async () => {
    const {app} = await buildProbe([
      {path: '/tight', config: {rateLimits: TWO_PER_MINUTE}},
    ]);

    const seen = [];
    for (const method of ['GET', 'HEAD', 'GET', 'HEAD']) {
      seen.push((await call(app, '/tight', {method})).statusCode);
    }

    expect(seen).toEqual([OK, OK, LIMITED, LIMITED]);
    expect(await routeBuckets()).toEqual(['ip:2/60000:GET/tight-127.0.0.1']);
  });

  it('gives two routes their own buckets even for one window shape', async () => {
    const {app} = await buildProbe([
      {path: '/twin-a', config: {rateLimits: TWO_PER_MINUTE}},
      {path: '/twin-b', config: {rateLimits: TWO_PER_MINUTE}},
    ]);

    await codes(app, '/twin-a', 3);
    const sibling = await call(app, '/twin-b');

    expect(sibling.statusCode).toBe(OK);
    expect(await routeBuckets()).toEqual([
      'ip:2/60000:GET/twin-a-127.0.0.1',
      'ip:2/60000:GET/twin-b-127.0.0.1',
    ]);
  });

  it('narrows the shared budgets rather than replacing them', async () => {
    const {app} = await buildProbe([
      {
        path: '/tight',
        config: {rateLimits: TWO_PER_MINUTE},
        isGuarded: true,
      },
    ]);

    await call(app, '/tight', {headers: asCaller('alice')});

    expect(await globalBuckets(RateLimitKey.IP)).toEqual(['127.0.0.1']);
    expect(await routeBuckets()).toHaveLength(1);
  });
});

describe('a window that escalates its penalty', () => {
  const escalating = (timeWindow, extra = {}) => ({
    path: '/escalating',
    config: {
      rateLimits: [{max: 1, timeWindow, penalty: RateLimitPenalty.EXPONENTIAL}],
      ...extra,
    },
  });

  it('doubles the window for every request past the budget', async () => {
    const {app} = await buildProbe([escalating(60000)]);

    await codes(app, '/escalating', 2);
    const key = await soleRouteKey();
    const first = await redis.pttl(key);
    await call(app, '/escalating');

    expect(first).toBeLessThanOrEqual(60000);
    expect(await redis.pttl(key)).toBeGreaterThan(60000);
  });

  it('stops growing at the ceiling', async () => {
    const reported = [];
    const {app} = await buildProbe([
      escalating(60000, {
        onRateLimited: (request, result) => reported.push(result.ttl),
      }),
    ]);

    await codes(app, '/escalating', 9);
    const stored = await redis.pttl(await soleRouteKey());

    expect(reported.slice(-3)).toEqual([
      1920000,
      PENALTY_CEILING,
      PENALTY_CEILING,
    ]);
    expect(stored).toBeLessThanOrEqual(PENALTY_CEILING);
    expect(stored).toBeGreaterThan(PENALTY_CEILING - 5000);
  });

  it('never cuts a window configured longer than the ceiling', async () => {
    const twoHours = 2 * PENALTY_CEILING;
    const {app} = await buildProbe([escalating(twoHours)]);

    await codes(app, '/escalating', 2);
    const key = await soleRouteKey();
    const refused = await redis.pttl(key);
    await call(app, '/escalating');
    const escalated = await redis.pttl(key);

    expect(refused).toBeGreaterThan(twoHours - 5000);
    expect(escalated).toBeGreaterThan(twoHours - 5000);
    expect(escalated).toBeLessThanOrEqual(twoHours);
  });
});

describe('a window keyed by a named caller', () => {
  it('spends per caller rather than per address', async () => {
    const {app} = await buildProbe([
      {
        path: '/mine',
        config: {
          rateLimits: [{max: 2, timeWindow: 60000, identify: callerOf}],
        },
      },
    ]);

    const alice = await codes(app, '/mine', 3, {headers: asCaller('alice')});
    const bob = await call(app, '/mine', {headers: asCaller('bob')});

    expect(alice).toEqual([OK, OK, LIMITED]);
    expect(bob.statusCode).toBe(OK);
    expect(await routeBuckets()).toEqual([
      'ip:2/60000:GET/mine-alice',
      'ip:2/60000:GET/mine-bob',
    ]);
  });

  it('falls back to the address when no caller is named', async () => {
    const {app} = await buildProbe([
      {
        path: '/mine',
        config: {
          rateLimits: [{max: 2, timeWindow: 60000, identify: callerOf}],
        },
      },
    ]);

    expect(await codes(app, '/mine', 3)).toEqual([OK, OK, LIMITED]);
    expect(await routeBuckets()).toEqual(['ip:2/60000:GET/mine-127.0.0.1']);
  });

  it('stacks with an address window on the same route', async () => {
    const {app} = await buildProbe([
      {
        path: '/mixed',
        config: {
          rateLimits: [
            {max: 5, timeWindow: 60000},
            {max: 2, timeWindow: 60000, identify: callerOf},
          ],
        },
      },
    ]);

    const alice = await codes(app, '/mixed', 3, {headers: asCaller('alice')});
    expect(alice).toEqual([OK, OK, LIMITED]);

    const bob = await codes(app, '/mixed', 3, {headers: asCaller('bob')});
    expect(bob).toEqual([OK, OK, LIMITED]);

    expect(await routeBuckets('ip:5/*')).toEqual([
      'ip:5/60000:GET/mixed-127.0.0.1',
    ]);
  });
});

describe('a group of routes', () => {
  const grouped = (path, extra = {}) => ({
    path,
    config: {
      rateLimits: TWO_PER_MINUTE,
      rateLimitGroup: 'otp',
      ...extra,
    },
  });

  it('spends one bucket however many paths carry the name', async () => {
    const {app} = await buildProbe([grouped('/send'), grouped('/resend')]);

    expect(await codes(app, '/send', 2)).toEqual([OK, OK]);
    expect((await call(app, '/resend')).statusCode).toBe(LIMITED);
  });

  it('names the group in the bucket instead of the path', async () => {
    const {app} = await buildProbe([grouped('/send'), grouped('/resend')]);

    await call(app, '/send');
    await call(app, '/resend');

    expect(await routeBuckets()).toEqual(['ip:2/60000:otp-127.0.0.1']);
  });

  it('keeps two groups clear of each other', async () => {
    const {app} = await buildProbe([
      grouped('/send'),
      {
        path: '/reset',
        config: {rateLimits: TWO_PER_MINUTE, rateLimitGroup: 'reset'},
      },
    ]);

    await codes(app, '/send', 3);

    expect((await call(app, '/reset')).statusCode).toBe(OK);
    expect(await routeBuckets()).toEqual([
      'ip:2/60000:otp-127.0.0.1',
      'ip:2/60000:reset-127.0.0.1',
    ]);
  });

  it('leaves an ungrouped route on its own bucket', async () => {
    const {app} = await buildProbe([
      grouped('/send'),
      {path: '/alone', config: {rateLimits: TWO_PER_MINUTE}},
    ]);

    await codes(app, '/send', 3);

    expect((await call(app, '/alone')).statusCode).toBe(OK);
    expect(await routeBuckets()).toEqual([
      'ip:2/60000:GET/alone-127.0.0.1',
      'ip:2/60000:otp-127.0.0.1',
    ]);
  });

  it('still spends per caller when the window is keyed by a named caller', async () => {
    const {app} = await buildProbe([
      {
        path: '/send',
        config: {
          rateLimits: [{max: 2, timeWindow: 60000, identify: callerOf}],
          rateLimitGroup: 'otp',
        },
      },
      {
        path: '/resend',
        config: {
          rateLimits: [{max: 2, timeWindow: 60000, identify: callerOf}],
          rateLimitGroup: 'otp',
        },
      },
    ]);

    await codes(app, '/send', 2, {headers: asCaller('alice')});
    const alice = await call(app, '/resend', {headers: asCaller('alice')});
    const bob = await call(app, '/resend', {headers: asCaller('bob')});

    expect(alice.statusCode).toBe(LIMITED);
    expect(bob.statusCode).toBe(OK);
    expect(await routeBuckets()).toEqual([
      'ip:2/60000:otp-alice',
      'ip:2/60000:otp-bob',
    ]);
  });
});

describe('the order the windows run in', () => {
  it('turns an address away before the guard costs anything', async () => {
    const {app, guarded} = await buildProbe([
      {
        path: '/tight',
        config: {rateLimits: TWO_PER_MINUTE},
        isGuarded: true,
      },
    ]);

    await codes(app, '/tight', 2, {headers: asCaller('alice')});
    expect(guarded()).toBe(2);

    const refused = await call(app, '/tight', {headers: asCaller('alice')});
    expect(refused.statusCode).toBe(LIMITED);
    expect(guarded()).toBe(2);
  });
});

describe('a route that watches its own refusals', () => {
  it('hears about every window that turned a caller away', async () => {
    const seen = [];
    const {app} = await buildProbe([
      {
        path: '/tight',
        config: {
          rateLimits: TWO_PER_MINUTE,
          onRateLimited: (request, result) =>
            seen.push({url: request.url, remaining: result.remaining}),
        },
      },
    ]);

    await codes(app, '/tight', 2);
    expect(seen).toEqual([]);

    await codes(app, '/tight', 2);
    expect(seen).toEqual([
      {url: '/tight', remaining: 0},
      {url: '/tight', remaining: 0},
    ]);
  });

  it('hears the shared address budget refuse, not only its own windows', async () => {
    const seen = [];
    const {app} = await buildProbe([
      {
        path: '/plain',
        config: {
          onRateLimited: (request, result) => seen.push(result.max),
        },
      },
    ]);

    await codes(app, '/plain', config.rateLimitIpMax + 1);

    expect(seen).toEqual([config.rateLimitIpMax]);
  });

  it('waits for a hook that answers slowly', async () => {
    const seen = [];
    const {app} = await buildProbe([
      {
        path: '/tight',
        config: {
          rateLimits: TWO_PER_MINUTE,
          onRateLimited: async () => {
            await setTimeout(20);
            seen.push('heard');
          },
        },
      },
    ]);

    const refused = await call(app, '/tight');
    expect(refused.statusCode).toBe(OK);

    await codes(app, '/tight', 2);

    expect(seen).toEqual(['heard']);
  });

  it('stays quiet on a route that never asked to hear', async () => {
    const {app} = await buildProbe([
      {path: '/tight', config: {rateLimits: TWO_PER_MINUTE}},
    ]);

    expect(await codes(app, '/tight', 3)).toEqual([OK, OK, LIMITED]);
  });
});

describe('a route that waves some callers through', () => {
  const waved = {
    path: '/tight',
    config: {
      rateLimits: TWO_PER_MINUTE,
      skipRateLimit: request => request.query.internal === 'yes',
    },
  };

  it('counts nothing for the ones it waves through', async () => {
    const {app} = await buildProbe([waved]);

    expect(await codes(app, '/tight?internal=yes', 5)).toEqual([
      OK,
      OK,
      OK,
      OK,
      OK,
    ]);
    expect(await redis.keys('rate:*')).toEqual([]);
  });

  it('still counts everyone else', async () => {
    const {app} = await buildProbe([waved]);

    expect(await codes(app, '/tight', 3)).toEqual([OK, OK, LIMITED]);
  });

  it('waves them past the shared budgets too', async () => {
    const {app} = await buildProbe([
      {
        path: '/plain',
        isGuarded: true,
        config: {skipRateLimit: () => true},
      },
    ]);

    await codes(app, '/plain', 3, {headers: asCaller('alice')});

    expect(await redis.keys('rate:*')).toEqual([]);
  });
});

describe('a route that waves some callers past the shared budgets only', () => {
  const skipped = {
    path: '/act',
    isGuarded: true,
    config: {skipGlobalRateLimit: request => request.query.relay === 'yes'},
    handler: app => {
      const rate = app.rateLimiter({max: 2, timeWindow: 60000});
      return async (request, reply) => {
        const status = await rate(request);
        return status.isExceeded
          ? reply.respond(tooManyRequests())
          : reply.success();
      };
    },
  };

  it('opens no shared bucket for the ones it waves through', async () => {
    const {app} = await buildProbe([skipped]);

    await call(app, '/act?relay=yes', {headers: asCaller('alice')});

    expect(await globalBuckets(RateLimitKey.IP)).toEqual([]);
  });

  it('still lets its own limiter count them', async () => {
    const {app} = await buildProbe([skipped]);

    expect(await codes(app, '/act?relay=yes', 3)).toEqual([OK, OK, LIMITED]);
  });

  it('keeps everyone else on the shared budgets', async () => {
    const {app} = await buildProbe([skipped]);

    await call(app, '/act', {headers: asCaller('alice')});

    expect(await globalBuckets(RateLimitKey.IP)).toEqual(['127.0.0.1']);
  });
});

describe('a caller the project trusts', () => {
  it('is counted by nothing at all', async () => {
    const {app} = await buildProbe([
      {path: '/tight', config: {rateLimits: TWO_PER_MINUTE}},
    ]);
    const trusted = {remoteAddress: '10.9.9.9'};

    expect(await codes(app, '/tight', 5, trusted)).toEqual([
      OK,
      OK,
      OK,
      OK,
      OK,
    ]);
    expect(await redis.keys('rate:*')).toEqual([]);
  });

  it.each([
    ['an exact IPv4 entry', '10.9.9.10'],
    ['an exact IPv6 entry', '2001:db8:9::a'],
    ['a range', '198.51.101.1'],
  ])('lends nothing to an address beside %s', async (_name, neighbour) => {
    const {app} = await buildProbe([
      {path: '/tight', config: {rateLimits: TWO_PER_MINUTE}},
    ]);

    const seen = await codes(app, '/tight', 3, {remoteAddress: neighbour});

    expect(seen).toEqual([OK, OK, LIMITED]);
  });

  it.each([
    ['the exact IPv6 entry', '2001:db8:9::9'],
    ['an address inside the range', '198.51.100.77'],
    ['an IPv4-mapped address inside the range', '::ffff:198.51.100.77'],
  ])('waves through %s', async (_name, address) => {
    const {app} = await buildProbe([
      {path: '/tight', config: {rateLimits: TWO_PER_MINUTE}},
    ]);

    const seen = await codes(app, '/tight', 3, {remoteAddress: address});

    expect(seen).toEqual([OK, OK, OK]);
    expect(await redis.keys('rate:*')).toEqual([]);
  });
});

describe('opting out of the shared budgets', () => {
  it('stands alone when a route asks to', async () => {
    const {app} = await buildProbe([
      {
        path: '/alone',
        config: {rateLimits: TWO_PER_MINUTE, exclusiveRateLimits: true},
        isGuarded: true,
      },
    ]);

    await call(app, '/alone', {headers: asCaller('alice')});

    expect(await globalBuckets(RateLimitKey.IP)).toEqual([]);
    expect(await routeBuckets()).toHaveLength(1);
  });

  it('ignores the request to stand alone when no window backs it', async () => {
    const {app} = await buildProbe([
      {
        path: '/hollow',
        config: {exclusiveRateLimits: true},
        isGuarded: true,
      },
    ]);

    await call(app, '/hollow', {headers: asCaller('alice')});

    expect(await globalBuckets(RateLimitKey.IP)).toEqual(['127.0.0.1']);
  });
});

describe('a handler reading what is left of its budget', () => {
  const reporting = config => ({
    path: '/plain',
    isGuarded: true,
    ...(config && {config}),
    handler: () => async (request, reply) =>
      reply.success({
        max: request.rateLimit?.max ?? null,
        remaining: request.rateLimit?.remaining ?? null,
      }),
  });

  it('reads the shared address budget when nothing narrower ran', async () => {
    const {app} = await buildProbe([reporting()]);

    const {data} = readEnvelope(await call(app, '/plain'));

    expect(data).toEqual({
      max: config.rateLimitIpMax,
      remaining: config.rateLimitIpMax - 1,
    });
  });

  it('reads the narrowest window, not the first one that ran', async () => {
    const {app} = await buildProbe([reporting({rateLimits: TWO_PER_MINUTE})]);

    const {data} = readEnvelope(await call(app, '/plain'));

    expect(data).toEqual({max: 2, remaining: 1});
  });

  it('counts down as the caller keeps knocking', async () => {
    const {app} = await buildProbe([
      reporting({rateLimits: [{max: 5, timeWindow: 60000}]}),
    ]);

    const seen = [];
    for (let index = 0; index < 3; index += 1) {
      seen.push(readEnvelope(await call(app, '/plain')).data.remaining);
    }

    expect(seen).toEqual([4, 3, 2]);
  });

  it('reads nothing for a caller the project trusts', async () => {
    const {app} = await buildProbe([reporting({rateLimits: TWO_PER_MINUTE})]);

    const {data} = readEnvelope(
      await call(app, '/plain', {remoteAddress: '10.9.9.9'}),
    );

    expect(data).toEqual({max: null, remaining: null});
  });
});

describe('a limiter a handler drives itself', () => {
  const counted = ({scope, identify} = {}) => ({
    path: '/act',
    isGuarded: true,
    handler: app => {
      const rate = app.rateLimiter({
        max: 2,
        timeWindow: 60000,
        scope,
        identify,
      });
      return async (request, reply) => {
        const status = await rate(request);
        return status.isExceeded
          ? reply.respond(tooManyRequests())
          : reply.success();
      };
    },
  });

  it('refuses once the window it was built with is spent', async () => {
    const {app} = await buildProbe([counted()]);

    expect(await codes(app, '/act', 3)).toEqual([OK, OK, LIMITED]);
  });

  it('writes the same bucket shape the declared windows use', async () => {
    const {app} = await buildProbe([counted()]);

    await call(app, '/act');

    expect(await routeBuckets()).toEqual(['ip:2/60000:GET/act-127.0.0.1']);
  });

  it('clears the bucket when the handler forgives the caller', async () => {
    const {app} = await buildProbe([
      {
        path: '/act',
        handler: app => {
          const rate = app.rateLimiter({max: 2, timeWindow: 60000});
          return async (request, reply) => {
            if (request.query.forgive === 'yes') {
              await rate.reset(request);
              return reply.success();
            }
            const status = await rate(request);
            return status.isExceeded
              ? reply.respond(tooManyRequests())
              : reply.success();
          };
        },
      },
    ]);

    expect(await codes(app, '/act', 3)).toEqual([OK, OK, LIMITED]);

    await call(app, '/act?forgive=yes');

    expect(await codes(app, '/act', 3)).toEqual([OK, OK, LIMITED]);
  });

  it('clears only the caller it was handed', async () => {
    const {app} = await buildProbe([
      {
        path: '/act',
        handler: app => {
          const rate = app.rateLimiter({max: 1, timeWindow: 60000});
          return async (request, reply) => {
            await rate(request);
            if (request.query.forgive === 'yes') {
              await rate.reset(request);
            }
            return reply.success();
          };
        },
      },
    ]);

    await call(app, '/act', {remoteAddress: '10.0.0.1'});
    await call(app, '/act?forgive=yes', {remoteAddress: '10.0.0.2'});

    expect(await routeBuckets()).toEqual(['ip:1/60000:GET/act-10.0.0.1']);
  });

  it('gives back the one charge a handler refunds', async () => {
    const {app} = await buildProbe([refunding()]);

    expect(await codes(app, '/act?refund=1', 3)).toEqual([OK, OK, OK]);
    expect(await routeBuckets()).toEqual([]);
    expect(await codes(app, '/act', 3)).toEqual([OK, OK, LIMITED]);
  });

  it('never refunds a bucket below empty', async () => {
    const {app} = await buildProbe([refunding()]);

    await call(app, '/act?refund=2');

    expect(await routeBuckets()).toEqual([]);
    expect(await codes(app, '/act', 3)).toEqual([OK, OK, LIMITED]);
  });

  it('takes a scope of its own, so a handler can group by anything', async () => {
    const {app} = await buildProbe([counted({scope: 'checkout'})]);

    await call(app, '/act');

    expect(await routeBuckets()).toEqual(['ip:2/60000:checkout-127.0.0.1']);
  });

  it('counts the caller when the limiter is keyed by a named caller', async () => {
    const {app} = await buildProbe([counted({identify: callerOf})]);

    const alice = await codes(app, '/act', 3, {headers: asCaller('alice')});
    const bob = await call(app, '/act', {headers: asCaller('bob')});

    expect(alice).toEqual([OK, OK, LIMITED]);
    expect(bob.statusCode).toBe(OK);
  });

  it('counts by whatever the handler names, not only the caller', async () => {
    const {app} = await buildProbe([
      {
        path: '/reset',
        handler: app => {
          const rate = app.rateLimiter({
            max: 2,
            timeWindow: 60000,
            identify: request => request.query.email,
          });
          return async (request, reply) => {
            const status = await rate(request);
            return status.isExceeded
              ? reply.respond(tooManyRequests())
              : reply.success();
          };
        },
      },
    ]);

    const victim = await codes(app, '/reset?email=a@b.com', 3);
    const other = await call(app, '/reset?email=c@d.com', {
      remoteAddress: '10.0.0.9',
    });

    expect(victim).toEqual([OK, OK, LIMITED]);
    expect(other.statusCode).toBe(OK);
    expect(await routeBuckets()).toEqual([
      'ip:2/60000:GET/reset-a@b.com',
      'ip:2/60000:GET/reset-c@d.com',
    ]);
  });

  it('holds a spammer to one bucket however the address changes', async () => {
    const {app} = await buildProbe([
      {
        path: '/reset',
        handler: app => {
          const rate = app.rateLimiter({
            max: 2,
            timeWindow: 60000,
            identify: request => request.query.email,
          });
          return async (request, reply) => {
            const status = await rate(request);
            return status.isExceeded
              ? reply.respond(tooManyRequests())
              : reply.success();
          };
        },
      },
    ]);

    const seen = [];
    for (const host of ['10.0.0.1', '10.0.0.2', '10.0.0.3']) {
      seen.push(
        (await call(app, '/reset?email=a@b.com', {remoteAddress: host}))
          .statusCode,
      );
    }

    expect(seen).toEqual([OK, OK, LIMITED]);
  });

  it('falls back to the caller when the name resolves to nothing', async () => {
    const {app} = await buildProbe([
      {
        path: '/reset',
        handler: app => {
          const rate = app.rateLimiter({
            max: 2,
            timeWindow: 60000,
            identify: request => request.query.email,
          });
          return async (request, reply) => {
            const status = await rate(request);
            return status.isExceeded
              ? reply.respond(tooManyRequests())
              : reply.success();
          };
        },
      },
    ]);

    expect(await codes(app, '/reset', 3)).toEqual([OK, OK, LIMITED]);
    expect(await routeBuckets()).toEqual(['ip:2/60000:GET/reset-127.0.0.1']);
  });

  it('refuses to be built after boot, where its counter would reset', async () => {
    const {app} = await buildProbe([{path: '/plain'}]);

    expect(() => app.rateLimiter({max: 2, timeWindow: 60000})).toThrow(
      /must run while routes register/,
    );
  });

  it('names its own penalty, whatever identity it counts', async () => {
    const {app} = await buildProbe([
      {
        path: '/reset',
        handler: app => {
          const rate = app.rateLimiter({
            max: 1,
            timeWindow: 2000,
            identify: request => request.query.email,
            penalty: RateLimitPenalty.RENEW,
          });
          return async (request, reply) => {
            const status = await rate(request);
            return status.isExceeded
              ? reply.respond(tooManyRequests())
              : reply.success();
          };
        },
      },
    ]);

    await codes(app, '/reset?email=a@b.com', 2);
    const key = await soleRouteKey();
    const opened = await redis.pttl(key);

    await setTimeout(300);
    await call(app, '/reset?email=a@b.com');

    expect(await redis.pttl(key)).toBeGreaterThan(opened - 250);
  });

  it('reads the count without spending it when asked to peek', async () => {
    const {app} = await buildProbe([
      {
        path: '/act',
        handler: app => {
          const rate = app.rateLimiter({max: 2, timeWindow: 60000});
          return async (request, reply) => {
            const peeked = await rate(request, {increment: false});
            return reply.success({remaining: peeked.remaining});
          };
        },
      },
    ]);

    const seen = [];
    for (let index = 0; index < 3; index += 1) {
      seen.push(readEnvelope(await call(app, '/act')).data.remaining);
    }

    expect(seen).toEqual([2, 2, 2]);
    expect(await routeBuckets()).toEqual([]);
  });

  it('spends only what the handler decides to spend', async () => {
    const {app} = await buildProbe([
      {
        path: '/act',
        handler: app => {
          const rate = app.rateLimiter({max: 2, timeWindow: 60000});
          return async (request, reply) => {
            const status = await rate(request, {increment: false});
            if (status.isExceeded) {
              return reply.respond(tooManyRequests());
            }
            if (request.query.fail === 'yes') {
              await rate(request);
              return reply.error(null, 'Denied.', StatusCodes.UNAUTHORIZED);
            }
            return reply.success();
          };
        },
      },
    ]);

    const won = await codes(app, '/act', 5);
    expect(won).toEqual([OK, OK, OK, OK, OK]);

    const lost = await codes(app, '/act?fail=yes', 4);
    expect(lost).toEqual([
      StatusCodes.UNAUTHORIZED,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.UNAUTHORIZED,
      LIMITED,
    ]);
  });
});

describe('the refusal', () => {
  it('says nothing about the limit it enforces', async () => {
    const {app} = await buildProbe([
      {path: '/tight', config: {rateLimits: TWO_PER_MINUTE}},
      {path: '/plain'},
    ]);

    const allowed = await call(app, '/tight');
    await call(app, '/tight');
    const refused = await call(app, '/tight');
    const shared = await call(app, '/plain');

    expect(refused.statusCode).toBe(LIMITED);
    for (const response of [allowed, refused, shared]) {
      expect(
        Object.keys(response.headers).filter(
          name => name.includes('ratelimit') || name === 'retry-after',
        ),
      ).toEqual([]);
    }
  });
  it('reads as the envelope every other failure uses', async () => {
    const {app} = await buildProbe([
      {path: '/tight', config: {rateLimits: TWO_PER_MINUTE}},
    ]);

    await codes(app, '/tight', 2);
    const refused = await call(app, '/tight');

    expect(refused.statusCode).toBe(LIMITED);
    const envelope = readEnvelope(refused);
    expect(envelope.success).toBe(false);
    expect(envelope.message).toBe('Too many requests. Try again later.');
    expect(envelope.data).toBeNull();
  });
});

describe('a store that cannot reach Redis', () => {
  const alone = {rateLimits: TWO_PER_MINUTE, exclusiveRateLimits: true};

  it('keeps counting in memory rather than letting every caller through', async () => {
    const {app} = await buildProbe([{path: '/degraded', config: alone}]);

    const seen = await whileStoreIsDown(() => codes(app, '/degraded', 3));

    expect(seen).toEqual([OK, OK, LIMITED]);
    expect(await routeBuckets()).toEqual([]);
  });

  it('counts per process, so a second instance carries its own budget', async () => {
    const [first, second] = await Promise.all([
      buildProbe([{path: '/degraded', config: alone}]),
      buildProbe([{path: '/degraded', config: alone}]),
    ]);

    const seen = await whileStoreIsDown(async () => [
      await codes(first.app, '/degraded', 3),
      await codes(second.app, '/degraded', 1),
    ]);

    expect(seen).toEqual([[OK, OK, LIMITED], [OK]]);
  });

  it('gives back a charge it counted in memory', async () => {
    const {app} = await buildProbe([refunding()]);

    const seen = await whileStoreIsDown(async () => [
      ...(await codes(app, '/act?refund=1', 3)),
      ...(await codes(app, '/act', 3)),
    ]);

    expect(seen).toEqual([OK, OK, OK, OK, OK, LIMITED]);
  });

  it('returns to the shared budget once Redis answers again', async () => {
    const {app} = await buildProbe([{path: '/degraded', config: alone}]);

    await whileStoreIsDown(() => codes(app, '/degraded', 3));
    const seen = await codes(app, '/degraded', 3);

    expect(seen).toEqual([OK, OK, LIMITED]);
    expect(await routeBuckets()).toHaveLength(1);
  });
});
