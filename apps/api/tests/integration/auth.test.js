import {describe, expect, it} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {Permission} from '@repo/shared/constants/permission.js';
import {ADMIN_EMAIL, ADMIN_PASSWORD} from '../../src/db/seeders/00002-users.js';
import {
  RateLimitKey,
  RateLimitPenalty,
  toRateLimitKey,
} from '../../src/lib/rate-limit.js';
import {redis} from '../../src/redis/index.js';
import {getRegisteredRoutes, getTestApp} from '../helpers/app.js';
import {readEnvelope} from '../helpers/assertions.js';
import {
  DEFAULT_PASSWORD,
  authHeaders,
  createUser,
  getSeededAdminUser,
  toEmail,
} from '../helpers/factories.js';

const ADMIN_CREDENTIALS = {email: ADMIN_EMAIL, password: ADMIN_PASSWORD};

const login = (app, payload, remoteAddress = undefined) =>
  app.inject({method: 'POST', url: '/auth/login', payload, remoteAddress});

const loginRoute = () =>
  getRegisteredRoutes().find(
    route => route.method === 'POST' && route.url === '/auth/login',
  );

const loginBucketOf = ({max, timeWindow}, identity) =>
  `rate:${toRateLimitKey({
    key: RateLimitKey.IP,
    max,
    timeWindow,
    scope: 'POST/auth/login',
    identity,
  })}`;

describe('login', () => {
  it('issues both tokens for the seeded administrator', async () => {
    const app = await getTestApp();
    const response = await login(app, ADMIN_CREDENTIALS);
    expect(response.statusCode).toBe(StatusCodes.OK);
    const {data} = readEnvelope(response);
    expect(data.accessToken).toEqual(expect.any(String));
    expect(data.refreshToken).toEqual(expect.any(String));
    expect(data.expiresIn).toBeGreaterThan(0);
  });

  it('gives the same refusal for a wrong password and a missing account', async () => {
    const app = await getTestApp();
    const wrong = await login(
      app,
      {email: ADMIN_EMAIL, password: 'not-the-password'},
      '10.0.0.1',
    );
    const missing = await login(
      app,
      {email: toEmail('nobody'), password: 'not-the-password'},
      '10.0.0.2',
    );
    expect(wrong.statusCode).toBe(StatusCodes.UNAUTHORIZED);
    expect(missing.statusCode).toBe(StatusCodes.UNAUTHORIZED);
    expect(readEnvelope(missing).message).toBe(readEnvelope(wrong).message);
  });

  it('refuses a disabled account even with the right password', async () => {
    const app = await getTestApp();
    await createUser({email: toEmail('benched'), disabledAt: new Date()});
    const response = await login(app, {
      email: toEmail('benched'),
      password: DEFAULT_PASSWORD,
    });
    expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED);
  });

  it('never returns the stored hash', async () => {
    const app = await getTestApp();
    const response = await login(app, ADMIN_CREDENTIALS);
    expect(response.body).not.toContain('$2');
  });

  it('escalates the penalty of its minute window', async () => {
    await getTestApp();

    expect(loginRoute().config.rateLimits).toContainEqual({
      max: 10,
      timeWindow: 60000,
      penalty: RateLimitPenalty.EXPONENTIAL,
    });
  });

  it('doubles the lockout for every attempt past the minute budget', async () => {
    const app = await getTestApp();
    const address = '10.0.0.7';
    const [burst, minute] = loginRoute().config.rateLimits;
    const burstKey = loginBucketOf(burst, address);
    const minuteKey = loginBucketOf(minute, address);

    const attempts = [];
    for (let index = 0; index < minute.max + 2; index += 1) {
      await redis.del(burstKey);
      const response = await login(
        app,
        {email: ADMIN_EMAIL, password: 'not-the-password'},
        address,
      );
      attempts.push({
        status: response.statusCode,
        ttl: await redis.pttl(minuteKey),
      });
    }
    const [first, second] = attempts.slice(-2);

    expect(attempts.map(({status}) => status)).toEqual([
      ...new Array(minute.max).fill(StatusCodes.UNAUTHORIZED),
      StatusCodes.TOO_MANY_REQUESTS,
      StatusCodes.TOO_MANY_REQUESTS,
    ]);
    expect(first.ttl).toBeLessThanOrEqual(minute.timeWindow);
    expect(second.ttl).toBeGreaterThan(minute.timeWindow);
  });
});

describe('principal', () => {
  it('rebuilds the permissions from the roles, not from the token', async () => {
    const app = await getTestApp();
    const admin = await getSeededAdminUser();
    const response = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: await authHeaders(admin),
    });
    expect(response.statusCode).toBe(StatusCodes.OK);
    const {data} = readEnvelope(response);
    expect(data.id).toBe(admin.id);
    expect(data.email).toBe(ADMIN_EMAIL);
    expect(data.permissions).toContain(Permission.ADMIN);
  });

  it('refuses a request with no bearer header', async () => {
    const app = await getTestApp();
    const response = await app.inject({method: 'GET', url: '/auth/me'});
    expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED);
  });

  it('refuses a garbage token', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: {authorization: 'Bearer not-a-token'},
    });
    expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED);
  });

  it('stops accepting a live token once the account is disabled', async () => {
    const app = await getTestApp();
    const user = await createUser({email: toEmail('soon-benched')});
    const headers = await authHeaders(user);

    const before = await app.inject({method: 'GET', url: '/auth/me', headers});
    expect(before.statusCode).toBe(StatusCodes.OK);

    await user.update({disabledAt: new Date()});

    const after = await app.inject({method: 'GET', url: '/auth/me', headers});
    expect(after.statusCode).toBe(StatusCodes.UNAUTHORIZED);
  });
});

describe('refresh', () => {
  it('exchanges a refresh token for a new access token', async () => {
    const app = await getTestApp();
    const {data} = readEnvelope(await login(app, ADMIN_CREDENTIALS));
    const response = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: {refreshToken: data.refreshToken},
    });
    expect(response.statusCode).toBe(StatusCodes.OK);
    const refreshed = readEnvelope(response).data;
    expect(refreshed.accessToken).toEqual(expect.any(String));
    expect(refreshed).not.toHaveProperty('refreshToken');
  });

  it('refuses an access token in the refresh slot', async () => {
    const app = await getTestApp();
    const {data} = readEnvelope(await login(app, ADMIN_CREDENTIALS));
    const response = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: {refreshToken: data.accessToken},
    });
    expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED);
  });
});

describe('request size', () => {
  it('refuses an oversized body anywhere on the auth subtree', async () => {
    const app = await getTestApp();
    const oversized = 'x'.repeat(9 * 1024);
    for (const url of ['/auth/login', '/auth/refresh']) {
      const response = await app.inject({
        method: 'POST',
        url,
        payload: {
          email: ADMIN_EMAIL,
          password: oversized,
          refreshToken: oversized,
        },
      });
      expect(response.statusCode).toBe(StatusCodes.REQUEST_TOO_LONG);
    }
  });

  it('leaves the rest of the app on the default limit', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/users',
      headers: await authHeaders(await getSeededAdminUser()),
      payload: {email: toEmail('oversized'), password: 'x'.repeat(9 * 1024)},
    });
    expect(response.statusCode).not.toBe(StatusCodes.REQUEST_TOO_LONG);
  });
});

describe('session edges', () => {
  it('rejects the token of an account that has been deleted', async () => {
    const app = await getTestApp();
    const user = await createUser({email: toEmail('short-lived')});
    const headers = await authHeaders(user);
    expect(
      (await app.inject({method: 'GET', url: '/auth/me', headers})).statusCode,
    ).toBe(StatusCodes.OK);

    await user.destroy();

    expect(
      (await app.inject({method: 'GET', url: '/auth/me', headers})).statusCode,
    ).toBe(StatusCodes.UNAUTHORIZED);
  });

  it('refuses to refresh for a disabled account', async () => {
    const app = await getTestApp();
    const user = await createUser({email: toEmail('benched-refresh')});
    const {data} = readEnvelope(
      await login(app, {
        email: toEmail('benched-refresh'),
        password: DEFAULT_PASSWORD,
      }),
    );
    await user.update({disabledAt: new Date()});

    const response = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: {refreshToken: data.refreshToken},
    });
    expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED);
  });

  it('refuses to refresh for an account that has been deleted', async () => {
    const app = await getTestApp();
    const user = await createUser({email: toEmail('deleted-refresh')});
    const {data} = readEnvelope(
      await login(app, {
        email: toEmail('deleted-refresh'),
        password: DEFAULT_PASSWORD,
      }),
    );
    await user.destroy();

    const response = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: {refreshToken: data.refreshToken},
    });
    expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED);
  });

  it('gives a disabled account the same wording at both entry points', async () => {
    const app = await getTestApp();
    const user = await createUser({email: toEmail('benched-both')});
    const {data} = readEnvelope(
      await login(
        app,
        {email: toEmail('benched-both'), password: DEFAULT_PASSWORD},
        '10.0.0.1',
      ),
    );
    await user.update({disabledAt: new Date()});

    const refused = await login(
      app,
      {email: toEmail('benched-both'), password: DEFAULT_PASSWORD},
      '10.0.0.2',
    );
    const refreshed = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: {refreshToken: data.refreshToken},
    });

    expect(readEnvelope(refused).message).toBe(readEnvelope(refreshed).message);
  });

  it('refuses a refresh token that is not a token at all', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: {refreshToken: 'nonsense'},
    });
    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
  });
});
