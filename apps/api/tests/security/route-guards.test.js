import {describe, expect, it} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {config} from '../../src/config/index.js';
import {getRegisteredRoutes, getTestApp} from '../helpers/app.js';
import {routeCalls, routeSecurity} from '../helpers/assertions.js';

const PUBLIC_ROUTES = new Set([
  'GET /',
  'POST /auth/login',
  'POST /auth/refresh',
  /* CORS preflight must answer before any credential is presented. */
  'OPTIONS *',
  /* The public storage subtree is served openly by design; the private one is
     never mounted at all. */
  'GET /static/*',
]);

const PLACEHOLDER_ID = '018f3a2b-6c4d-7e8f-9a0b-1c2d3e4f5061';

const toUrl = url => url.replaceAll(/:[^/]+/g, PLACEHOLDER_ID);

async function allRoutes() {
  await getTestApp();
  return getRegisteredRoutes().flatMap(route =>
    routeCalls(route).map(call => ({...call, security: routeSecurity(route)})),
  );
}

describe('route table', () => {
  it('registers the routes the suite reasons about', async () => {
    const ids = (await allRoutes()).map(route => route.id);
    expect(ids).toContain('POST /auth/login');
    expect(ids).toContain('GET /users');
    expect(ids).toContain('PATCH /roles/:id/move');
  });

  it('declares a security requirement on every route outside the public list', async () => {
    const unguarded = (await allRoutes())
      .filter(route => !PUBLIC_ROUTES.has(route.id))
      .filter(route => route.security.length === 0)
      .map(route => route.id);
    expect(unguarded).toEqual([]);
  });

  it('keeps the public list honest — every entry still exists', async () => {
    const ids = new Set((await allRoutes()).map(route => route.id));
    for (const entry of PUBLIC_ROUTES) {
      expect(ids).toContain(entry);
    }
  });
});

describe('anonymous access', () => {
  it('refuses every guarded route without credentials', async () => {
    const app = await getTestApp();
    const routes = (await allRoutes()).filter(
      route => !PUBLIC_ROUTES.has(route.id),
    );
    expect(routes.length).toBeGreaterThan(0);

    const allowed = [];
    for (const route of routes) {
      const response = await app.inject({
        method: route.method,
        url: toUrl(route.url),
        payload: route.method === 'GET' ? undefined : {},
        remoteAddress: config.rateLimitAllowList[0],
      });
      if (
        response.statusCode !== StatusCodes.UNAUTHORIZED &&
        response.statusCode !== StatusCodes.FORBIDDEN
      ) {
        allowed.push(`${route.id} -> ${response.statusCode}`);
      }
    }
    expect(allowed).toEqual([]);
  });

  it('answers a guarded route before it validates the request body', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/users',
      payload: {email: '!!invalid!!'},
    });
    expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED);
  });
});

describe('subtree guards', () => {
  it('gives every management route the administration requirement', async () => {
    const managed = (await allRoutes()).filter(
      route =>
        route.url.startsWith('/users') ||
        route.url.startsWith('/roles') ||
        route.url.startsWith('/settings') ||
        route.url.startsWith('/sockets'),
    );
    expect(managed.length).toBeGreaterThan(0);
    for (const route of managed) {
      expect(route.security[0]).toHaveProperty('bearerAuth');
    }
  });

  it('guards the security-key routes with the key scheme, not a bearer token', async () => {
    const keyed = (await allRoutes()).filter(route =>
      route.security.some(requirement => 'securityKey' in requirement),
    );
    expect(keyed.length).toBeGreaterThan(0);
    for (const route of keyed) {
      expect(route.security[0]).toHaveProperty('securityKey');
    }
  });
});
