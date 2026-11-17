import {describe, expect, it} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {getTestApp} from '../helpers/app.js';
import {readEnvelope} from '../helpers/assertions.js';
import {toEmail} from '../helpers/factories.js';
import {FixtureRecord} from '../helpers/fixture-models.js';
import {
  HTTP_FIXTURE_MESSAGE,
  HTTP_FIXTURE_RECORDS_URL,
  HTTP_FIXTURE_URL,
} from '../helpers/fixtures.js';

describe('response envelope', () => {
  it('wraps a success', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET',
      url: HTTP_FIXTURE_URL,
    });
    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(readEnvelope(response)).toEqual({
      success: true,
      message: HTTP_FIXTURE_MESSAGE,
      data: null,
    });
  });

  it('wraps an unknown route rather than emitting Fastify default', async () => {
    const app = await getTestApp();
    const response = await app.inject({method: 'GET', url: '/nowhere'});
    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND);
    expect(readEnvelope(response)).toMatchObject({success: false, data: null});
  });

  it('wraps a validation failure with field-level detail', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST',
      url: HTTP_FIXTURE_URL,
      payload: {code: 'a b', count: ''},
    });
    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
    const body = readEnvelope(response);
    expect(body.success).toBe(false);
    expect(body.data.errors.map(entry => entry.field).toSorted()).toEqual([
      'code',
      'count',
    ]);
    expect(body.message).toBe(body.data.errors[0].message);
  });

  it('renders a duplicate as a conflict carrying the model own wording', async () => {
    const app = await getTestApp();
    const payload = {name: toEmail('duplicate-me')};

    const first = await app.inject({
      method: 'POST',
      url: HTTP_FIXTURE_RECORDS_URL,
      payload,
    });
    expect(first.statusCode).toBe(StatusCodes.OK);

    const second = await app.inject({
      method: 'POST',
      url: HTTP_FIXTURE_RECORDS_URL,
      payload,
    });
    expect(second.statusCode).toBe(StatusCodes.CONFLICT);
    expect(readEnvelope(second).message).toBe(
      FixtureRecord.getAttributes().name.unique.msg,
    );
  });

  it('renders a missing record as not found, named by the model', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET',
      url: `${HTTP_FIXTURE_RECORDS_URL}/018f3a2b-6c4d-7e8f-9a0b-1c2d3e4f5061`,
    });
    expect([response.statusCode, readEnvelope(response).message]).toEqual([
      StatusCodes.NOT_FOUND,
      FixtureRecord.notFoundMessage,
    ]);
  });
});
