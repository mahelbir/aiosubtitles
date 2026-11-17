import {describe, expect, it} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {getTestApp} from '../helpers/app.js';
import {findForbiddenKeys, readEnvelope} from '../helpers/assertions.js';
import {
  createFixtureRecord,
  createFixtureTag,
  toEmail,
} from '../helpers/factories.js';
import {fixtureRecordCache} from '../helpers/fixture-cache.js';
import {FixtureRecord} from '../helpers/fixture-models.js';
import {
  HTTP_FIXTURE_RECORDS_URL,
  PAGINATION_FIXTURE_URL,
} from '../helpers/fixtures.js';

const FORBIDDEN = [...FixtureRecord.sensitiveAttributes];
const SECRET = '$2b$04$fixture-secret-hash';

describe('sensitive attributes', () => {
  it('never cross the wire on any read endpoint', async () => {
    const app = await getTestApp();
    const tag = await createFixtureTag({rank: 500});
    const subject = await createFixtureRecord({
      name: toEmail('visible'),
      secret: SECRET,
      tags: [tag],
    });

    const urls = [
      PAGINATION_FIXTURE_URL,
      `${HTTP_FIXTURE_RECORDS_URL}/${subject.id}`,
    ];

    const leaks = [];
    for (const url of urls) {
      const response = await app.inject({method: 'GET', url});
      expect(response.statusCode).toBe(StatusCodes.OK);
      const found = findForbiddenKeys(readEnvelope(response), FORBIDDEN);
      leaks.push(...found.map(path => `${url} ${path}`));
    }
    expect(leaks).toEqual([]);
  });

  it('is not merely absent from the payload but absent from the body text', async () => {
    const app = await getTestApp();
    const subject = await createFixtureRecord({
      name: toEmail('hash-check'),
      secret: SECRET,
    });
    const response = await app.inject({
      method: 'GET',
      url: `${HTTP_FIXTURE_RECORDS_URL}/${subject.id}`,
    });
    expect(response.body).not.toContain('$2');
  });

  it('never reach the cache, so the secret lives in the database alone', async () => {
    const subject = await createFixtureRecord({
      name: toEmail('cached-hash'),
      secret: SECRET,
    });
    const cached = await fixtureRecordCache.get(subject.id);
    expect(findForbiddenKeys(cached, FORBIDDEN)).toEqual([]);
    expect(JSON.stringify(cached)).not.toContain('$2');
  });

  it('does not leak through a search that matches on the hidden column', async () => {
    const app = await getTestApp();
    await createFixtureRecord({name: toEmail('searchable'), secret: SECRET});
    const response = await app.inject({
      method: 'GET',
      url: `${PAGINATION_FIXTURE_URL}?search=searchable`,
    });
    expect(findForbiddenKeys(readEnvelope(response), FORBIDDEN)).toEqual([]);
  });
});
