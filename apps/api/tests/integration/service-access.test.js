import {describe, expect, it} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {getTestApp} from '../helpers/app.js';
import {authHeaders, getSeededAdminUser} from '../helpers/factories.js';
import {SECURITY_KEY_FIXTURE_URL} from '../helpers/fixtures.js';
import {config} from '../../src/config/index.js';
import {SECURITY_KEY_HEADER} from '../../src/plugins/security-key.js';

describe('the security key guard', () => {
  it('admits a caller carrying the key', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET',
      url: `${SECURITY_KEY_FIXTURE_URL}?securityKey=${encodeURIComponent(config.securityKey)}`,
    });
    expect(response.statusCode).toBe(StatusCodes.OK);
  });

  it('admits a write the same way', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST',
      url: `${SECURITY_KEY_FIXTURE_URL}?securityKey=${encodeURIComponent(config.securityKey)}`,
      payload: {},
    });
    expect(response.statusCode).toBe(StatusCodes.OK);
  });

  it('admits a caller carrying the key in the header', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET',
      url: SECURITY_KEY_FIXTURE_URL,
      headers: {[SECURITY_KEY_HEADER]: config.securityKey},
    });
    expect(response.statusCode).toBe(StatusCodes.OK);
  });

  it('lets the query win over a wrong key in the header', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET',
      url: `${SECURITY_KEY_FIXTURE_URL}?securityKey=${encodeURIComponent(config.securityKey)}`,
      headers: {[SECURITY_KEY_HEADER]: 'nope'},
    });
    expect(response.statusCode).toBe(StatusCodes.OK);
  });

  it('does not fall back to the header once the query is wrong', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET',
      url: `${SECURITY_KEY_FIXTURE_URL}?securityKey=nope`,
      headers: {[SECURITY_KEY_HEADER]: config.securityKey},
    });
    expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED);
  });

  it.each([
    ['a wrong key', '?securityKey=nope'],
    ['no key at all', ''],
    ['an empty key', '?securityKey='],
  ])('refuses %s', async (_label, query) => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET',
      url: `${SECURITY_KEY_FIXTURE_URL}${query}`,
    });
    expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED);
  });

  it.each([
    ['a wrong header key', 'nope'],
    ['an empty header key', ''],
  ])('refuses %s', async (_label, value) => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET',
      url: SECURITY_KEY_FIXTURE_URL,
      headers: {[SECURITY_KEY_HEADER]: value},
    });
    expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED);
  });

  it('does not accept a user token in place of the key', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET',
      url: SECURITY_KEY_FIXTURE_URL,
      headers: await authHeaders(await getSeededAdminUser()),
    });
    expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED);
  });
});
