import {describe, expect, it} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {getTestApp} from '../helpers/app.js';
import {recordQueries} from '../helpers/counters.js';
import {
  createFixtureRecord,
  createFixtureTag,
  toEmail,
} from '../helpers/factories.js';
import {
  PAGINATION_FIXTURE_TAGS_URL,
  PAGINATION_FIXTURE_URL,
} from '../helpers/fixtures.js';

async function seedRecords(from, to, tag) {
  for (let index = from; index < to; index += 1) {
    await createFixtureRecord({
      name: toEmail(`bulk-${index}`),
      tags: tag ? [tag] : [],
    });
  }
}

async function warmAndCount(app, request) {
  await app.inject(request);
  return recordQueries(async () => {
    const response = await app.inject(request);
    expect(response.statusCode).toBe(StatusCodes.OK);
  });
}

describe('list endpoints do not scale their queries with their rows', () => {
  it('costs the same for two records as for twenty', async () => {
    const app = await getTestApp();
    const tag = await createFixtureTag({label: 'bulk-tag', rank: 500});
    const request = {
      method: 'GET',
      url: `${PAGINATION_FIXTURE_URL}?pageSize=100`,
    };

    await seedRecords(0, 2, tag);
    const small = await warmAndCount(app, request);

    await seedRecords(2, 20, tag);
    const large = await warmAndCount(app, request);

    expect(large.length).toBe(small.length);
  });

  it('costs the same for two tags as for twenty', async () => {
    const app = await getTestApp();
    const request = {
      method: 'GET',
      url: `${PAGINATION_FIXTURE_TAGS_URL}?pageSize=100`,
    };

    for (const index of [1, 2]) {
      await createFixtureTag({label: `small-${index}`, rank: index * 100});
    }
    const small = await warmAndCount(app, request);

    for (const index of [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      await createFixtureTag({label: `large-${index}`, rank: index * 100});
    }
    const large = await warmAndCount(app, request);

    expect(large.length).toBe(small.length);
  });

  it('does not grow with the number of tags a record holds', async () => {
    const app = await getTestApp();
    const request = {
      method: 'GET',
      url: `${PAGINATION_FIXTURE_URL}?pageSize=100`,
    };

    const tags = [];
    for (const index of [1, 2, 3, 4, 5]) {
      tags.push(
        await createFixtureTag({label: `many-${index}`, rank: index * 50}),
      );
    }
    await createFixtureRecord({
      name: toEmail('one-tag'),
      tags: tags.slice(0, 1),
    });
    const few = await warmAndCount(app, request);

    await createFixtureRecord({name: toEmail('five-tags'), tags});
    const many = await warmAndCount(app, request);

    expect(many.length).toBe(few.length);
  });
});
