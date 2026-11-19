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
import {HTTP_FIXTURE_RECORDS_URL} from '../helpers/fixtures.js';

const FORBIDDEN = [...FixtureRecord.sensitiveAttributes];
const SECRET = '$2b$04$fixture-secret-hash';

describe('sensitive attributes', () => {
  it('never cross the wire on a read endpoint', async () => {
    const app = await getTestApp();
    const tag = await createFixtureTag({rank: 500});
    const subject = await createFixtureRecord({
      name: toEmail('visible'),
      secret: SECRET,
      tags: [tag],
    });

    const response = await app.inject({
      method: 'GET',
      url: `${HTTP_FIXTURE_RECORDS_URL}/${subject.id}`,
    });
    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(findForbiddenKeys(readEnvelope(response), FORBIDDEN)).toEqual([]);
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
});
