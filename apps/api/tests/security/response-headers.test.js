import {splitTrim} from 'melperjs';
import {describe, expect, it} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {config} from '../../src/config/index.js';
import {getRegisteredRoutes, getTestApp} from '../helpers/app.js';
import {routeCalls} from '../helpers/assertions.js';
import {authHeaders, getSeededAdminUser} from '../helpers/factories.js';
import {HTTP_FIXTURE_URL} from '../helpers/fixtures.js';

async function getFixture() {
  const app = await getTestApp();
  return app.inject({
    method: 'GET',
    url: HTTP_FIXTURE_URL,
    headers: await authHeaders(await getSeededAdminUser()),
  });
}

describe('response headers', () => {
  it('hardens every response', async () => {
    const {headers} = await getFixture();

    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['referrer-policy']).toBe('no-referrer');
    expect(headers['content-security-policy']).toContain("default-src 'none'");
    expect(headers['content-security-policy']).toContain(
      "frame-ancestors 'none'",
    );
  });

  it('pins HTTPS for its own host without reaching sibling subdomains', async () => {
    const {headers} = await getFixture();

    expect(headers['strict-transport-security']).toMatch(/^max-age=\d+$/);
  });

  it('leaves the public storage subtree loadable from another origin', async () => {
    const {headers} = await getFixture();

    expect(headers['cross-origin-resource-policy']).toBe('cross-origin');
  });

  it('lets a browser preflight every method a route answers to', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'OPTIONS',
      url: HTTP_FIXTURE_URL,
      headers: {
        origin: config.corsOrigins[0],
        'access-control-request-method': 'GET',
      },
    });
    const allowed = splitTrim(
      response.headers['access-control-allow-methods'],
      ',',
    );
    const answered = new Set(
      getRegisteredRoutes()
        .flatMap(routeCalls)
        .map(call => call.method)
        .filter(method => method !== 'OPTIONS'),
    );

    expect([...answered].filter(method => !allowed.includes(method))).toEqual(
      [],
    );
  });

  it('lets a browser cache the preflight', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'OPTIONS',
      url: HTTP_FIXTURE_URL,
      headers: {
        origin: config.corsOrigins[0],
        'access-control-request-method': 'POST',
      },
    });

    expect(response.statusCode).toBe(StatusCodes.NO_CONTENT);
    expect(Number(response.headers['access-control-max-age'])).toBeGreaterThan(
      0,
    );
  });
});
