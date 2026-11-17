import {afterEach, describe, expect, it} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {Permission} from '@repo/shared/constants/permission.js';
import {config} from '../../src/config/index.js';
import {generateAccessToken} from '../../src/lib/auth/token.js';
import {tooManyRequests} from '../../src/lib/errors.js';
import {GLOBAL_RATE_LIMIT_SCOPE} from '../../src/lib/rate-limit.js';
import {GLOBAL_HANDSHAKE_WINDOW} from '../../src/plugins/sockets.js';
import {redis} from '../../src/redis/index.js';
import {getScopeWith} from '../helpers/app.js';
import {createRole, createUser, toEmail} from '../helpers/factories.js';
import {
  FAULTY_SOCKET_FIXTURE_NAMESPACE,
  SOCKET_FIXTURE_NAMESPACE,
  THROTTLED_SOCKET_FIXTURE_NAMESPACE,
  THROTTLED_SOCKET_FIXTURE_WINDOW,
} from '../helpers/fixtures.js';
import {
  closeSockets,
  connectSocket,
  pipelineHandshakes,
  waitForEvent,
} from '../helpers/sockets.js';

const THROTTLED = THROTTLED_SOCKET_FIXTURE_NAMESPACE;
const {max: MAX} = THROTTLED_SOCKET_FIXTURE_WINDOW;
const {max: GLOBAL_MAX, timeWindow: GLOBAL_WINDOW} = GLOBAL_HANDSHAKE_WINDOW;
const BUCKET = `rate:ip:${MAX}/60000:handshake${THROTTLED}-127.0.0.1`;
const GLOBAL_BUCKET = `rate:ip:${GLOBAL_MAX}/${GLOBAL_WINDOW}:handshake${GLOBAL_RATE_LIMIT_SCOPE}-127.0.0.1`;
const WRONG_KEY = {securityKey: 'not-the-key'};
const RIGHT_KEY = {securityKey: config.securityKey};
const BURST = 20;
const THROTTLED_STATUS = StatusCodes.TOO_MANY_REQUESTS;

const countGuarded = statuses =>
  statuses.filter(status => status !== THROTTLED_STATUS).length;

const edge = address => ({headers: {[config.clientIpHeader]: address}});

const attempt = (namespace, auth, options) =>
  connectSocket(namespace, auth, options).catch(err => err);

async function failTimes(times, {namespace = THROTTLED, ...options} = {}) {
  for (let index = 0; index < times; index += 1) {
    await attempt(namespace, WRONG_KEY, options);
  }
}

const buckets = async () => (await redis.keys('rate:*')).sort();

function expectThrottled(refusal) {
  const {message} = tooManyRequests();
  expect(refusal.message).toBe(message);
  expect(refusal.data).toMatchObject({
    success: false,
    message,
    statusCode: StatusCodes.TOO_MANY_REQUESTS,
  });
}

afterEach(() => {
  closeSockets();
});

describe('a namespace that declares handshake windows', () => {
  it('turns a caller away once its refusals spend the window, before any guard runs', async () => {
    await failTimes(MAX);

    expectThrottled(await attempt(THROTTLED, RIGHT_KEY));
  });

  it('holds handshakes arriving together to the window', async () => {
    const refusals = await Promise.all(
      Array.from({length: BURST}, () => attempt(THROTTLED, WRONG_KEY)),
    );

    expect(
      countGuarded(refusals.map(refusal => refusal.data.statusCode)),
    ).toBeLessThanOrEqual(MAX);
  });

  it('counts a polling handshake as it counts a websocket one', async () => {
    await failTimes(MAX, {transport: 'polling'});

    expectThrottled(await attempt(THROTTLED, RIGHT_KEY));
  });

  it('lets a caller through while its refusals stay inside the window', async () => {
    await failTimes(MAX - 1);

    const client = await connectSocket(THROTTLED, RIGHT_KEY);
    expect(client.connected).toBe(true);
  });

  it('never charges a handshake it admits', async () => {
    for (let index = 0; index <= MAX; index += 1) {
      const client = await connectSocket(THROTTLED, RIGHT_KEY);
      expect(client.connected).toBe(true);
    }

    expect(await buckets()).toEqual([]);
  });

  it('writes the bucket shape the HTTP windows use, beside the shared one', async () => {
    await failTimes(1);

    expect(await buckets()).toEqual([BUCKET, GLOBAL_BUCKET].sort());
  });

  it('keeps charging the knocks it turns away, so a penalty escalates as on HTTP', async () => {
    await failTimes(MAX + 1);

    expect(await redis.get(BUCKET)).toBe(String(MAX + 1));
  });

  it('counts the caller the edge reports, as HTTP does', async () => {
    await failTimes(MAX, edge('203.0.113.7'));

    const neighbour = await connectSocket(
      THROTTLED,
      RIGHT_KEY,
      edge('203.0.113.8'),
    );
    expect(neighbour.connected).toBe(true);
    expectThrottled(await attempt(THROTTLED, RIGHT_KEY, edge('203.0.113.7')));
  });

  it('counts nothing for a caller the project trusts', async () => {
    const trusted = edge(config.rateLimitAllowList[0]);
    await failTimes(MAX + 1, trusted);

    const client = await connectSocket(THROTTLED, RIGHT_KEY, trusted);
    expect(client.connected).toBe(true);
    expect(await buckets()).toEqual([]);
  });

  it('leaves the budget alone when revalidation re-runs the guards', async () => {
    const role = await createRole({
      slug: 'throttled-admin',
      position: 3000,
      permissions: [Permission.ADMIN],
    });
    const admin = await createUser({
      email: toEmail('throttled-admin'),
      roles: [role],
    });
    const {token} = await generateAccessToken(admin.id);
    const client = await connectSocket(THROTTLED, {token});
    const dropped = waitForEvent(client, 'disconnect');

    await admin.update({disabledAt: new Date()});
    await getScopeWith('revalidateUserSockets').revalidateUserSockets([
      admin.id,
    ]);

    await dropped;
    expect(await buckets()).toEqual([]);
  });
});

describe('the shared handshake budget', () => {
  it('charges a namespace that declares nothing', async () => {
    await failTimes(1, {namespace: SOCKET_FIXTURE_NAMESPACE});

    expect(await buckets()).toEqual([GLOBAL_BUCKET]);
  });

  it('turns a caller away from every namespace once it is spent', async () => {
    await failTimes(GLOBAL_MAX, {namespace: SOCKET_FIXTURE_NAMESPACE});

    expectThrottled(await attempt(SOCKET_FIXTURE_NAMESPACE, RIGHT_KEY));
    expectThrottled(await attempt(THROTTLED, RIGHT_KEY));
  });

  it('holds a burst packed into one request to the budget', async () => {
    const guesses = Array.from({length: GLOBAL_MAX * 3}, (_, index) => ({
      securityKey: `guess-${index}`,
    }));

    const statuses = await pipelineHandshakes(
      SOCKET_FIXTURE_NAMESPACE,
      guesses,
    );

    expect(statuses).toHaveLength(guesses.length);
    expect(countGuarded(statuses)).toBe(GLOBAL_MAX);
  });

  it('escalates the window for every knock past the budget', async () => {
    await failTimes(GLOBAL_MAX + 2, {namespace: SOCKET_FIXTURE_NAMESPACE});

    expect(await redis.pttl(GLOBAL_BUCKET)).toBeGreaterThan(GLOBAL_WINDOW);
  });

  it('leaves a server fault uncharged', async () => {
    const refusal = await attempt(FAULTY_SOCKET_FIXTURE_NAMESPACE, RIGHT_KEY);

    expect(refusal.data.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
    expect(await buckets()).toEqual([]);
  });
});
