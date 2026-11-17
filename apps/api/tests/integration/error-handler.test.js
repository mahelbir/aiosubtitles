import {afterEach, describe, expect, it, vi} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {ErrorCode} from '@repo/shared/constants/error-code.js';
import {getTestApp} from '../helpers/app.js';
import {readEnvelope} from '../helpers/assertions.js';
import {authHeaders, getSeededAdminUser} from '../helpers/factories.js';
import {
  HTTP_FIXTURE_RECORDS_URL,
  HTTP_FIXTURE_URL,
  fixtureSource,
} from '../helpers/fixtures.js';

afterEach(() => {
  vi.restoreAllMocks();
});

const asAdmin = async () => authHeaders(await getSeededAdminUser());

describe('an unexpected failure', () => {
  it('answers the envelope rather than leaking a stack', async () => {
    const app = await getTestApp();
    const headers = await asAdmin();
    vi.spyOn(fixtureSource, 'read').mockRejectedValueOnce(
      new Error('the datastore fell over'),
    );

    const response = await app.inject({
      method: 'GET',
      url: HTTP_FIXTURE_URL,
      headers,
    });

    expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
    const body = readEnvelope(response);
    expect(body.success).toBe(false);
    expect(body.data.errorCode).toBe(ErrorCode.INTERNAL_ERROR);
    expect(response.body).not.toContain('at Object');
    expect(response.body).not.toContain('.js:');
  });

  it('carries the description so an operator can correlate it with the log', async () => {
    const app = await getTestApp();
    const headers = await asAdmin();
    vi.spyOn(fixtureSource, 'read').mockRejectedValueOnce(
      new Error('the datastore fell over'),
    );

    const response = await app.inject({
      method: 'GET',
      url: HTTP_FIXTURE_URL,
      headers,
    });
    expect(readEnvelope(response).data.errorDescription).toBe(
      'the datastore fell over',
    );
  });

  it('does not leave the connection in a state the next request inherits', async () => {
    const app = await getTestApp();
    const headers = await asAdmin();
    vi.spyOn(fixtureSource, 'read').mockRejectedValueOnce(new Error('boom'));

    await app.inject({method: 'GET', url: HTTP_FIXTURE_URL, headers});
    const recovered = await app.inject({
      method: 'GET',
      url: HTTP_FIXTURE_URL,
      headers,
    });
    expect(recovered.statusCode).toBe(StatusCodes.OK);
  });
});

describe('a known client error', () => {
  it('keeps the status and wording the thrower chose', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET',
      url: `${HTTP_FIXTURE_RECORDS_URL}/not-a-uuid`,
      headers: await asAdmin(),
    });
    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
    expect(readEnvelope(response).data.errorCode).toBe(
      ErrorCode.VALIDATION_ERROR,
    );
  });

  it('reports every violation, not one per field and not only the first', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST',
      url: HTTP_FIXTURE_URL,
      headers: await asAdmin(),
      payload: {code: 'ABCDE', count: 0},
    });
    const {errors, message} = readEnvelope(response).data
      ? {
          ...readEnvelope(response).data,
          message: readEnvelope(response).message,
        }
      : {};

    expect([...new Set(errors.map(entry => entry.field))].toSorted()).toEqual([
      'code',
      'count',
    ]);
    /* Two rules refuse the code; both are reported rather than collapsed. */
    expect(errors.filter(entry => entry.field === 'code').length).toBe(2);
    expect(message).toBe(errors[0].message);
  });

  it('answers a body that is not an object at all', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST',
      url: HTTP_FIXTURE_URL,
      headers: {...(await asAdmin()), 'content-type': 'application/json'},
      payload: '"just a string"',
    });
    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
    expect(readEnvelope(response).success).toBe(false);
  });

  it('answers malformed JSON without an internal error', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST',
      url: HTTP_FIXTURE_URL,
      headers: {...(await asAdmin()), 'content-type': 'application/json'},
      payload: '{not json',
    });
    expect(response.statusCode).toBeLessThan(StatusCodes.INTERNAL_SERVER_ERROR);
    expect(readEnvelope(response).success).toBe(false);
  });
});
